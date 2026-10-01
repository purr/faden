import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { Para, ParsedBook, SectionMeta } from '../types';
import { guessLang } from '../lang';
import { classify, countWords, normTitle } from './classify';
import { layoutPdf, pagesToRanges, type Run } from './pdflayout';

interface Mark {
  title: string;
  page: number;
}

// the polyfilled "legacy" build: the modern one targets safari 18+, and older iphones must import too
async function pdfjs() {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  return lib;
}

type Doc = Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs>>['getDocument']>['promise']>;

async function outlineMarks(doc: Doc): Promise<Mark[]> {
  const outline = await doc.getOutline();
  if (!outline?.length) return [];
  let items = outline;
  // a book with one or two top entries ("Book", "Appendix") is really organised one level down
  if (items.length < 3) items = items.flatMap((i) => [i, ...(i.items ?? [])]);
  const marks: Mark[] = [];
  for (const it of items) {
    try {
      const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest;
      const ref = dest?.[0];
      if (ref == null) continue;
      const page = typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
      marks.push({ title: it.title.trim(), page });
    } catch {
      // an outline entry pointing nowhere is skipped; the rest of the outline still structures the book
    }
  }
  marks.sort((a, b) => a.page - b.page);
  return marks.filter((m, i) => i === 0 || m.page !== marks[i - 1].page);
}

function findStart(paras: Para[], from: number, page: number, title: string): number {
  let i = from;
  while (i < paras.length && (paras[i].pg ?? 0) < page) i++;
  const want = normTitle(title).slice(0, 24);
  if (want) {
    for (let k = i; k < paras.length && (paras[k].pg ?? 0) === page; k++) {
      if (normTitle(paras[k].t).startsWith(want)) return k;
    }
  }
  return i;
}

function sectionsFrom(paras: Para[], cuts: { at: number; title: string }[]): { title: string; paras: Para[] }[] {
  const out: { title: string; paras: Para[] }[] = [];
  if (cuts.length && cuts[0].at > 0) out.push({ title: 'Opening pages', paras: paras.slice(0, cuts[0].at) });
  cuts.forEach((c, i) => {
    const slice = paras.slice(c.at, i + 1 < cuts.length ? cuts[i + 1].at : paras.length);
    if (slice.length) out.push({ title: c.title, paras: slice });
  });
  return out;
}

export async function parsePdf(buf: ArrayBuffer, fileName: string, onProgress?: (p: number) => void): Promise<ParsedBook> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(buf) });
  let doc: Doc;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new Error(`pdf: "${fileName}" could not be opened (${(e as Error).message})`);
  }
  try {
    const pages: Run[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const runs: Run[] = [];
      for (const it of tc.items) {
        if (!('str' in it)) continue;
        runs.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.hypot(it.transform[2], it.transform[3]), eol: it.hasEOL });
      }
      pages.push(runs);
      page.cleanup();
      onProgress?.(p / doc.numPages);
    }
    const { paras, pageTags } = layoutPdf(pages);
    if (!paras.length) throw new Error(`pdf: "${fileName}" has no text layer (a scanned pdf needs OCR first)`);

    const meta = await doc.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    const title = (typeof info.Title === 'string' && info.Title.trim()) || fileName.replace(/\.pdf$/i, '');
    const author = (typeof info.Author === 'string' && info.Author.trim()) || '';

    const marks = await outlineMarks(doc);
    let cuts: { at: number; title: string }[] = [];
    if (marks.length >= 2) {
      let from = 0;
      for (const m of marks) {
        const at = findStart(paras, from, m.page + 1, m.title);
        if (at >= paras.length) break;
        if (cuts.length && at <= cuts[cuts.length - 1].at) continue;
        cuts.push({ at, title: m.title });
        from = at;
      }
    }
    if (cuts.length < 2) {
      const heads = paras.map((p, i) => ({ p, i })).filter(({ p }) => p.h && p.h <= 2);
      if (heads.length >= 3 && heads.length <= 400 && paras.length / heads.length >= 6) cuts = heads.map(({ p, i }) => ({ at: i, title: p.t }));
      else {
        // no structure at all: ten-page parts keep each part's text view light
        cuts = [];
        for (let i = 0; i < paras.length; i++) {
          const pg = paras[i].pg ?? 1;
          if (i === 0 || Math.floor((pg - 1) / 10) !== Math.floor(((paras[i - 1].pg ?? 1) - 1) / 10)) {
            const a = Math.floor((pg - 1) / 10) * 10 + 1;
            cuts.push({ at: i, title: `Pages ${a}–${Math.min(a + 9, doc.numPages)}` });
          }
        }
      }
    }

    const sections = sectionsFrom(paras, cuts).map(({ title: t, paras: ps }) => {
      const first = ps[0].pg ?? 1;
      const last = ps[ps.length - 1].pg ?? first;
      const pageWords = new Array(last - first + 1).fill(0);
      for (const p of ps) pageWords[(p.pg ?? first) - first] += countWords([p]);
      const pagesTag = pageTags.slice(first - 1, last).every((x) => x && x === pageTags[first - 1]) ? pageTags[first - 1] : null;
      const meta: SectionMeta = {
        title: t,
        tag: classify({ title: t, paras: ps }) ?? (pagesTag as SectionMeta['tag']),
        skip: false,
        words: countWords(ps),
        pages: [first, last],
        pageWords,
      };
      return { meta, paras: ps };
    });

    const suggested = pageTags.map((t, i) => (t ? i + 1 : 0)).filter(Boolean);
    const sample = paras.slice(0, 200).map((p) => p.t).join(' ');
    return {
      title,
      author,
      lang: guessLang(sample),
      kind: 'pdf',
      sections,
      suggestedSkipPages: pagesToRanges(suggested),
    };
  } finally {
    void task.destroy();
  }
}
