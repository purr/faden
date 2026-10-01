import { unzipSync, strFromU8 } from 'fflate';
import type { Para, ParsedBook, SectionMeta, SkipTag } from '../types';
import { bodyOf, cleanText, htmlToParas, parseXhtml } from './html';
import { classify, countWords, tagFromType } from './classify';

interface TocEntry {
  title: string;
  file: string;
  frag: string;
  depth: number;
  order: number;
}

const OPS = 'http://www.idpf.org/2007/ops';

function resolve(base: string, href: string): { file: string; frag: string } {
  const [path, frag = ''] = href.split('#');
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // a malformed %-escape: keep the raw path, which is what the zip entry is most likely named
  }
  const parts = (path ? base + decoded : '').split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return { file: out.join('/'), frag };
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
const all = (root: Document | Element, local: string) => Array.from(root.getElementsByTagNameNS('*', local));
const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');

export function parseEpub(buf: ArrayBuffer, fileName: string): ParsedBook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch (e) {
    throw new Error(`epub: "${fileName}" is not a readable zip archive (${(e as Error).message})`);
  }
  const text = (path: string): string | null => {
    const f = files[path] ?? files[Object.keys(files).find((k) => k.toLowerCase() === path.toLowerCase()) ?? ''];
    return f ? strFromU8(f) : null;
  };

  const container = text('META-INF/container.xml');
  if (!container) throw new Error(`epub: "${fileName}" has no META-INF/container.xml`);
  const opfPath = all(xml(container), 'rootfile')[0]?.getAttribute('full-path');
  const opfSrc = opfPath ? text(opfPath) : null;
  if (!opfPath || !opfSrc) throw new Error(`epub: "${fileName}" names no readable package file`);
  const opf = xml(opfSrc);
  const base = dirOf(opfPath);

  const meta = (local: string) => cleanText(all(opf, local)[0]?.textContent?.trim() ?? '');
  const title = meta('title') || fileName.replace(/\.epub$/i, '');
  const author = meta('creator');
  const lang = meta('language') || 'und';

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const it of all(opf, 'item')) {
    manifest.set(it.getAttribute('id') ?? '', {
      href: resolve(base, it.getAttribute('href') ?? '').file,
      type: it.getAttribute('media-type') ?? '',
      props: it.getAttribute('properties') ?? '',
    });
  }
  const spineEl = all(opf, 'spine')[0];
  const spine = all(opf, 'itemref')
    .map((r) => ({ item: manifest.get(r.getAttribute('idref') ?? ''), linear: r.getAttribute('linear') !== 'no' }))
    .filter((r) => r.item && /x?html/.test(r.item.type)) as { item: { href: string; type: string; props: string }; linear: boolean }[];
  if (!spine.length) throw new Error(`epub: "${fileName}" has an empty reading order`);

  // table of contents and landmarks: epub 3 nav document, else epub 2 ncx
  const toc: TocEntry[] = [];
  const typeOf = new Map<string, string>();
  const navItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'));
  const navSrc = navItem ? text(navItem.href) : null;
  if (navItem && navSrc) {
    const nav = parseXhtml(navSrc);
    const navBase = dirOf(navItem.href);
    for (const n of all(nav, 'nav')) {
      const kind = n.getAttributeNS(OPS, 'type') ?? n.getAttribute('epub:type') ?? '';
      if (/\btoc\b/.test(kind)) {
        const walk = (ol: Element, depth: number) => {
          for (const li of Array.from(ol.children).filter((c) => c.localName === 'li')) {
            const a = Array.from(li.children).find((c) => c.localName === 'a' || c.localName === 'span');
            const href = a?.getAttribute('href');
            if (a && href) {
              const r = resolve(navBase, href);
              toc.push({ title: cleanText(a.textContent ?? '').replace(/\s+/g, ' ').trim(), ...r, depth, order: toc.length });
            }
            const sub = Array.from(li.children).find((c) => c.localName === 'ol');
            if (sub) walk(sub, depth + 1);
          }
        };
        const ol = all(n, 'ol')[0];
        if (ol) walk(ol, 0);
      } else if (/\blandmarks\b/.test(kind)) {
        for (const a of all(n, 'a')) {
          const t = a.getAttributeNS(OPS, 'type') ?? a.getAttribute('epub:type');
          const href = a.getAttribute('href');
          if (t && href) typeOf.set(resolve(navBase, href).file, t);
        }
      }
    }
  }
  if (!toc.length) {
    const ncxItem = manifest.get(spineEl?.getAttribute('toc') ?? '') ?? [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
    const ncxSrc = ncxItem ? text(ncxItem.href) : null;
    if (ncxItem && ncxSrc) {
      const ncxBase = dirOf(ncxItem.href);
      const walk = (parent: Element, depth: number) => {
        for (const np of Array.from(parent.children).filter((c) => c.localName === 'navPoint')) {
          const label = all(np, 'text')[0]?.textContent ?? '';
          const src = all(np, 'content')[0]?.getAttribute('src');
          if (src) toc.push({ title: cleanText(label).replace(/\s+/g, ' ').trim(), ...resolve(ncxBase, src), depth, order: toc.length });
          walk(np, depth + 1);
        }
      };
      const navMap = all(xml(ncxSrc), 'navMap')[0];
      if (navMap) walk(navMap, 0);
    }
  }
  for (const ref of all(opf, 'reference')) {
    const href = ref.getAttribute('href');
    const type = ref.getAttribute('type');
    if (href && type && !typeOf.has(resolve(base, href).file)) typeOf.set(resolve(base, href).file, type);
  }

  const tocByFile = new Map<string, TocEntry[]>();
  for (const e of toc) {
    const list = tocByFile.get(e.file) ?? [];
    list.push(e);
    tocByFile.set(e.file, list);
  }

  type Draft = { title: string; paras: Para[]; type: string | null; file: string; aux: boolean };
  const drafts: Draft[] = [];
  spine.forEach(({ item, linear }) => {
    const src = text(item.href);
    if (!src) return;
    const doc = parseXhtml(src);
    const body = bodyOf(doc);
    const anchors = new Map<string, number>();
    const isNav = item.props.split(/\s+/).includes('nav');
    const paras = htmlToParas(body, { onAnchor: (id, i) => anchors.has(id) || anchors.set(id, i), keepNav: isNav });
    const bodyType =
      body.getAttributeNS(OPS, 'type') ??
      body.getAttribute('epub:type') ??
      (all(body, 'section')[0]?.getAttributeNS(OPS, 'type') || null);
    const type = typeOf.get(item.href) ?? (isNav ? 'toc' : bodyType);
    const entries = (tocByFile.get(item.href) ?? []).slice().sort((a, b) => a.order - b.order);
    // split a file at the toc entries that point inside it
    const cuts: { at: number; title: string }[] = [];
    for (const e of entries) {
      const at = e.frag ? anchors.get(e.frag) : 0;
      if (at === undefined || cuts.some((c) => c.at === at)) continue;
      cuts.push({ at, title: e.title });
    }
    cuts.sort((a, b) => a.at - b.at);
    if (!cuts.length || cuts[0].at > 0) {
      const head = paras.slice(0, cuts.length ? cuts[0].at : paras.length);
      const heading = head.find((p) => p.h && p.h <= 3);
      const prev = drafts[drafts.length - 1];
      // a file without its own toc entry or heading continues the previous chapter (split files)
      if (prev && !heading && !type && !prev.aux && head.length) prev.paras.push(...head);
      else if (head.length) drafts.push({ title: heading?.t ?? '', paras: head, type: type ?? null, file: item.href, aux: !linear });
    }
    cuts.forEach((c, i) => {
      const slice = paras.slice(c.at, i + 1 < cuts.length ? cuts[i + 1].at : paras.length);
      if (slice.length) drafts.push({ title: c.title, paras: slice, type: type ?? null, file: item.href, aux: !linear });
    });
  });

  const sections = drafts
    .filter((d) => d.paras.length)
    .map((d, i) => {
      let tag: SkipTag | null = classify({ title: d.title, type: d.type, file: d.file, paras: d.paras });
      if (!tag && d.aux) tag = 'notes';
      if (!tag && tagFromType(d.type) === null && i === 0 && countWords(d.paras) < 40) tag = 'credits';
      const firstHeading = d.paras.find((p) => p.h)?.t;
      const meta: SectionMeta = {
        title: d.title || firstHeading || d.paras[0].t.slice(0, 60),
        tag,
        skip: false,
        words: countWords(d.paras),
      };
      return { meta, paras: d.paras };
    });
  if (!sections.length) throw new Error(`epub: "${fileName}" contains no readable text`);
  return { title, author, lang, kind: 'epub', sections, suggestedSkipPages: '' };
}
