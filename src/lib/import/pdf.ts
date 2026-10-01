import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ParsedBook } from '../types';
import { guessLang } from '../lang';
import { layoutPdf, pagesToRanges, type Run } from './pdflayout';
import { buildPdfSections, type Mark } from './pdfsections';

// the polyfilled "legacy" build: the modern one targets safari 18+, and older iphones must import too
async function pdfjs() {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  return lib;
}

type Lib = Awaited<ReturnType<typeof pdfjs>>;
type Task = ReturnType<Lib['getDocument']>;
type Doc = Awaited<Task['promise']>;
type Page = Awaited<ReturnType<Doc['getPage']>>;
type TextItems = Awaited<ReturnType<Page['getTextContent']>>['items'];

// page.getTextContent() loops over a ReadableStream with `for await`, which Safari on iOS cannot do
// ("undefined is not a function near '...e of t...'"); reading the same stream with a reader works everywhere
async function textItems(page: Page): Promise<TextItems> {
  const reader = page.streamTextContent().getReader();
  const items: TextItems = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return items;
    items.push(...(value as { items: TextItems }).items);
  }
}

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
      const runs: Run[] = [];
      for (const it of await textItems(page)) {
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
    const sections = buildPdfSections(paras, pageTags, await outlineMarks(doc), doc.numPages);
    const suggested = pageTags.map((t, i) => (t ? i + 1 : 0)).filter(Boolean);
    return {
      title,
      author,
      lang: guessLang(paras.slice(0, 200).map((p) => p.t).join(' ')),
      kind: 'pdf',
      sections,
      suggestedSkipPages: pagesToRanges(suggested),
    };
  } finally {
    void task.destroy();
  }
}

// renders pages of a stored pdf for the page view; keeps the document open between pages
export class PdfPages {
  private task: Task | null = null;
  private doc: Promise<Doc> | null = null;
  private pending: { cancel(): void } | null = null;

  constructor(private data: ArrayBuffer) {}

  private open(): Promise<Doc> {
    this.doc ??= pdfjs().then((lib) => {
      // pdf.js takes ownership of the bytes it is given, so it gets a copy
      this.task = lib.getDocument({ data: new Uint8Array(this.data.slice(0)) });
      return this.task.promise;
    });
    return this.doc;
  }

  async count(): Promise<number> {
    return (await this.open()).numPages;
  }

  // draws page `n` (1-based) into `canvas`, `width` css pixels wide, sharp on high-density screens
  async render(n: number, canvas: HTMLCanvasElement, width: number): Promise<void> {
    const doc = await this.open();
    this.pending?.cancel();
    const page = await doc.getPage(Math.max(1, Math.min(n, doc.numPages)));
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const vp = page.getViewport({ scale: scale * ratio });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = `${Math.floor(vp.width / ratio)}px`;
    canvas.style.height = `${Math.floor(vp.height / ratio)}px`;
    const task = page.render({ canvas, viewport: vp });
    this.pending = task;
    try {
      await task.promise;
    } catch (e) {
      // a newer page request cancelled this one; anything else is a real failure
      if ((e as Error).name !== 'RenderingCancelledException') throw e;
    } finally {
      if (this.pending === task) this.pending = null;
    }
  }

  destroy() {
    this.pending?.cancel();
    void this.task?.destroy();
  }
}
