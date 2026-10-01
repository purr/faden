import type { Emph, Para } from '../types';

const BLOCK = new Set(
  'p div h1 h2 h3 h4 h5 h6 li dt dd blockquote pre td th tr caption figcaption section article header footer aside main ol ul dl table tbody thead tfoot hr address center details summary body html'.split(' '),
);
const SKIP = new Set('script style svg math img video audio iframe object canvas rt rp noscript template head title nav button input select textarea'.split(' '));
const ITALIC = new Set('em i cite dfn var'.split(' '));
const BOLD = new Set('strong b'.split(' '));
const NOTE_TYPES = /\b(footnote|endnote|rearnote|note|noteref|annoref)\b/;

export function cleanText(s: string): string {
  return (
    s
      .normalize('NFC')
      // soft hyphens and zero-width spaces are layout hints, not text
      .replace(/[\u{ad}\u{200b}\u{feff}]/gu, '')
      // typographic ligatures (fi, fl, ff …) back to letters
      .replace(/[\u{fb00}-\u{fb06}]/gu, (c) => c.normalize('NFKC'))
      // fraktur transcriptions: long s reads as s, the double oblique hyphen is a plain hyphen
      .replace(/\u{17f}/gu, 's')
      .replace(/\u{2e17}/gu, '-')
  );
}

interface Builder {
  t: string;
  em: Emph[];
}

export interface HtmlOptions {
  // called for every element id, with the index of the paragraph that comes next
  onAnchor?: (id: string, paraIndex: number) => void;
  // keep <nav> content (for documents that are only a table of contents)
  keepNav?: boolean;
}

// block structure of an (x)html body as paragraphs, with headings and italic/bold ranges
export function htmlToParas(root: Element, opts: HtmlOptions = {}): Para[] {
  const out: Para[] = [];
  let b: Builder = { t: '', em: [] };
  let heading = 0;

  const flush = () => {
    const t = b.t.replace(/\s+$/, '');
    if (t) {
      const em = b.em.filter((r) => r.s < t.length).map((r) => ({ ...r, e: Math.min(r.e, t.length) }));
      const p: Para = { t };
      if (heading) p.h = heading;
      if (em.length) p.em = em;
      out.push(p);
    }
    b = { t: '', em: [] };
  };

  const append = (s: string) => {
    let t = cleanText(s).replace(/\s+/g, ' ');
    if (!b.t || b.t.endsWith(' ')) t = t.replace(/^ /, '');
    b.t += t;
  };

  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      append(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.localName.toLowerCase();
    // role="navigation" is a <nav> by another name (wikipedia's "see also" notes and navigation boxes)
    const nav = tag === 'nav' || el.getAttribute('role') === 'navigation';
    if (nav ? !opts.keepNav : SKIP.has(tag)) return;
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return;
    const type = el.getAttribute('epub:type') ?? el.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? el.getAttribute('role') ?? '';
    // footnote markers and footnote bodies interrupt the sentence they sit in
    if (NOTE_TYPES.test(type) || /doc-(noteref|footnote|endnote)/.test(type)) return;
    // reference markers: "1", "*", "†" in books, "[1]" on wikipedia
    if (tag === 'sup' && /^[\s\d*†‡§,–[\]-]*$/.test(el.textContent ?? '')) return;
    if (tag === 'br') {
      append(' ');
      return;
    }
    const id = el.getAttribute('id');
    const block = BLOCK.has(tag);
    if (block) flush();
    if (id && opts.onAnchor) opts.onAnchor(id, out.length);
    const h = /^h([1-6])$/.exec(tag);
    const prevHeading = heading;
    if (h) heading = Number(h[1]);
    const k = ITALIC.has(tag) ? 1 : BOLD.has(tag) ? 2 : 0;
    const start = b.t.length;
    for (const c of Array.from(el.childNodes)) walk(c);
    if (k && b.t.length > start) {
      const s = b.t[start] === ' ' ? start + 1 : start;
      b.em.push({ s, e: b.t.replace(/\s+$/, '').length, k });
    }
    if (block) flush();
    if (h) heading = prevHeading;
  };

  walk(root);
  flush();
  return out;
}

// parse an xhtml document leniently: strict xml first (keeps epub namespaces), html as fallback
export function parseXhtml(src: string): Document {
  const strict = new DOMParser().parseFromString(src, 'application/xhtml+xml');
  if (!strict.getElementsByTagName('parsererror').length) return strict;
  return new DOMParser().parseFromString(src, 'text/html');
}

export function bodyOf(doc: Document): Element {
  return doc.getElementsByTagName('body')[0] ?? doc.documentElement;
}
