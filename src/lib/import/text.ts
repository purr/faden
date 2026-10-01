import type { Emph, Para, ParsedBook, SectionMeta } from '../types';
import { guessLang } from '../lang';
import { bodyOf, cleanText, htmlToParas } from './html';
import { classify, countWords } from './classify';

// a link target: no spaces, parentheses only in pairs ("wiki/Faust_(Goethe)"), and an optional quoted title.
// stopping at the first ")" would leave the rest of such a target in the text as words
const TARGET = String.raw`\((?:[^()\s]|\([^()\s]*\))*(?:\s+(?:"[^"]*"|'[^']*'))?\)`;
const RE_IMAGE = new RegExp(String.raw`!\[[^\]]*\]${TARGET}`, 'g');
const RE_LINK = new RegExp(String.raw`\[([^\]]*)\]${TARGET}`, 'g');

// markdown inline marks to plain text with italic/bold ranges
function inlineMd(src: string): { t: string; em: Emph[] } {
  let s = src
    .replace(RE_IMAGE, '')
    // links keep their text; an empty one ("[](url)", a heading anchor) leaves nothing
    .replace(RE_LINK, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '');
  const em: Emph[] = [];
  let out = '';
  // emphasis must not start or end on a space ("2 * 3 * 4" stays text); written without lookbehind for older safari
  const re = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.*?\S)\3/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    out += s.slice(last, m.index);
    const inner = m[2] ?? m[4];
    em.push({ s: out.length, e: out.length + inner.length, k: m[2] ? 2 : 1 });
    out += inner;
    last = m.index + m[0].length;
  }
  out += s.slice(last);
  s = out;
  return { t: s, em };
}

function markdownParas(src: string): Para[] {
  const paras: Para[] = [];
  let buf: string[] = [];
  let fence = false;
  const flush = () => {
    if (!buf.length) return;
    const { t, em } = inlineMd(buf.join(' ').replace(/\s+/g, ' ').trim());
    if (t) paras.push(em.length ? { t, em } : { t });
    buf = [];
  };
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      paras.push({ t: inlineMd(h[2]).t, h: h[1].length });
      continue;
    }
    if (!line.trim() || /^\s*([-*_]\s*){3,}$/.test(line)) {
      flush();
      continue;
    }
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      buf.push(item[1]);
      continue;
    }
    buf.push(line.replace(/^\s*>\s?/, ''));
  }
  flush();
  return paras;
}

const RE_CHAPTER = /^(chapter|kapitel|teil|part|book|buch|section|abschnitt|prolog(ue)?|epilog(ue)?)\b[\s\dIVXLC.:–-]*.{0,60}$/i;

function plainParas(src: string): Para[] {
  const blocks = src.split(/\n\s*\n/);
  // without blank lines every line is its own paragraph
  const parts = blocks.length > 1 ? blocks : src.split('\n');
  const paras: Para[] = [];
  for (const b of parts) {
    const t = b.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    // short lines that read like chapter headings ("CHAPTER IV", "Kapitel 3")
    const heading = t.length < 70 && (RE_CHAPTER.test(t) || (/^[\p{Lu}\d\s.,:'’-]+$/u.test(t) && /\p{Lu}{3}/u.test(t)));
    paras.push(heading ? { t, h: 2 } : { t });
  }
  return paras;
}

// sections from headings; long unstructured texts are cut into parts of ~3000 words
function sectionize(paras: Para[]): { meta: SectionMeta; paras: Para[] }[] {
  const levels = paras.filter((p) => p.h).map((p) => p.h!);
  // the level that structures a text occurs more than once; a lone title above it (often added from <title>) does not
  // set it, or a page with only ### headings would lose all its sections
  const repeated = levels.filter((h, i) => levels.indexOf(h) !== i);
  const top = Math.min(...(repeated.length ? repeated : levels), 9);
  const cuts = paras.map((p, i) => (p.h && p.h <= Math.max(top, 2) ? i : -1)).filter((i) => i >= 0);
  const groups: Para[][] = [];
  if (cuts.length >= 2) {
    if (cuts[0] > 0) groups.push(paras.slice(0, cuts[0]));
    cuts.forEach((c, k) => groups.push(paras.slice(c, cuts[k + 1] ?? paras.length)));
  } else {
    let cur: Para[] = [];
    let n = 0;
    for (const p of paras) {
      cur.push(p);
      n += countWords([p]);
      if (n >= 3000) {
        groups.push(cur);
        cur = [];
        n = 0;
      }
    }
    if (cur.length) groups.push(cur);
  }
  return groups
    .filter((g) => g.length)
    .map((g, i) => {
      const heading = g[0].h ? g[0].t : groups.length > 1 ? `Part ${i + 1}` : 'Text';
      return { meta: { title: heading, tag: classify({ title: heading, paras: g }), skip: false, words: countWords(g) }, paras: g };
    });
}

export function parseText(src: string, fileName: string, title?: string): ParsedBook {
  const text = cleanText(src.replace(/\r\n?/g, '\n'));
  const isMd = /\.(md|markdown)$/i.test(fileName) || /^#{1,6}\s/m.test(text);
  const paras = isMd ? markdownParas(text) : plainParas(text);
  if (!paras.length) throw new Error(`text: "${fileName}" is empty`);
  const name = title || paras.find((p) => p.h)?.t || fileName.replace(/\.[^.]+$/, '') || 'Untitled';
  return { title: name, author: '', lang: guessLang(text.slice(0, 20000)), kind: 'text', sections: sectionize(paras), suggestedSkipPages: '' };
}

// a web page's own text sits in <main>, or in its one <article>; menus, sidebars and footers around it are not part of it
function mainOf(doc: Document): Element {
  const main = doc.querySelector('main, [role="main"]');
  if (main) return main;
  const articles = doc.getElementsByTagName('article');
  return articles.length === 1 ? articles[0] : bodyOf(doc);
}

export function parseHtml(src: string, fileName: string): ParsedBook {
  const doc = new DOMParser().parseFromString(src, 'text/html');
  let paras = htmlToParas(mainOf(doc));
  // an empty or hidden landmark (a skip-link target, a placeholder) is not the page: then the whole page is read
  if (!paras.length) paras = htmlToParas(bodyOf(doc));
  if (!paras.length) throw new Error(`html: "${fileName}" has no readable text`);
  const title = cleanText(doc.title || '').trim() || fileName.replace(/\.[^.]+$/, '');
  // pages that keep their headline only in <title> (wikipedia's api) start with it, so the first section is named and read
  if (!paras.some((p) => p.h === 1)) paras.unshift({ t: title, h: 1 });
  const lang = doc.documentElement.lang || guessLang(paras.slice(0, 100).map((p) => p.t).join(' '));
  return { title, author: '', lang, kind: 'text', sections: sectionize(paras), suggestedSkipPages: '' };
}
