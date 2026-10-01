import type { Emph, Para, ParsedBook, SectionMeta } from '../types';
import { guessLang } from '../lang';
import { bodyOf, cleanText, htmlToParas } from './html';
import { classify, countWords } from './classify';

// markdown inline marks to plain text with italic/bold ranges
function inlineMd(src: string): { t: string; em: Emph[] } {
  let s = src
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
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
  const top = Math.min(...paras.filter((p) => p.h).map((p) => p.h!), 9);
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

export function parseHtml(src: string, fileName: string): ParsedBook {
  const doc = new DOMParser().parseFromString(src, 'text/html');
  const paras = htmlToParas(bodyOf(doc));
  if (!paras.length) throw new Error(`html: "${fileName}" has no readable text`);
  const title = cleanText(doc.title || '').trim() || fileName.replace(/\.[^.]+$/, '');
  const lang = doc.documentElement.lang || guessLang(paras.slice(0, 100).map((p) => p.t).join(' '));
  return { title, author: '', lang, kind: 'text', sections: sectionize(paras), suggestedSkipPages: '' };
}
