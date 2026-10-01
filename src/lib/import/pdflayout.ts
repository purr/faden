import type { Emph, Para } from '../types';
import { cleanText } from './html';
import { tagFromLines } from './classify';
import { collapseSpacing, offsetMapper } from './spacing';

// one text run from pdf.js getTextContent(); x/y in pdf user space (y grows upward)
export interface Run {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  eol: boolean;
}

interface Line {
  text: string;
  em: Emph[];
  x0: number;
  x1: number;
  y: number;
  // size of most of the line's letters: a big initial letter must not turn a line into a heading
  h: number;
  hmax: number;
}

export interface Layout {
  paras: Para[];
  // per page: what the page looks like (table of contents, index), for skip suggestions
  pageTags: (string | null)[];
  bodySize: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const RE_PAGE_NO = /^\s*(page\s*|seite\s*)?([0-9]{1,4}|[ivxlcdm]{1,7})(\s*(\/|of|von)\s*[0-9]{1,4})?\s*$/i;
// "1. Kapitel", "Kapitel 3", "Chapter IV", "Zweiter Band": chapter starts set no larger than body text
const RE_CHAPTER =
  /^((\d{1,3}|[ivxlc]{1,6})\.?\s+(kapitel|chapter|teil|abschnitt|buch|book|part)|(kapitel|chapter|teil|part|buch|book)\s+(\d{1,3}|[ivxlc]{1,6})|(erster|zweiter|dritter|vierter|first|second|third|fourth)\s+(band|teil|buch|book|part|volume))\b.{0,50}$/iu;

function buildLines(runs: Run[], bodySize: number): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  let sizes = new Map<number, number>();
  let lastEnd = 0;
  let lastEol = false;
  const finish = () => {
    if (!cur) return;
    let best = cur.hmax;
    let most = -1;
    for (const [size, n] of sizes) if (n > most) [best, most] = [size, n];
    cur.h = best;
    // letters spaced across separate runs ("D", "i", "e") are only visible once the line is whole
    const joined = collapseSpacing(cur.text);
    if (joined.t !== cur.text) {
      const m = offsetMapper(cur.text, joined.t);
      cur.em = [...cur.em.map((r) => ({ ...r, s: m.start(r.s), e: m.end(r.e) })), ...joined.spans.map(([s, e]) => ({ s, e, k: 1 as const }))];
      cur.text = joined.t;
    }
    const lead = cur.text.length - cur.text.trimStart().length;
    cur.text = cur.text.trim();
    cur.em = cur.em
      .map((r) => ({ ...r, s: Math.max(0, r.s - lead), e: Math.min(cur!.text.length, r.e - lead) }))
      .filter((r) => r.e > r.s);
    if (cur.text) lines.push(cur);
  };
  for (const r of runs) {
    const h = Math.abs(r.h) || bodySize;
    if (!r.str) {
      if (r.eol) lastEol = true;
      continue;
    }
    // footnote markers: small raised digits glued to the word before
    if (cur && h < 0.75 * cur.hmax && r.y > cur.y + 0.2 * cur.hmax && /^[\d*†‡,\s]+$/.test(r.str)) continue;
    // a soft hyphen ending a run is a line-break hyphen; anywhere else it is only a layout hint
    const cleaned = cleanText(r.str.replace(/\u{ad}$/u, '-')).replace(/\s+/g, ' ');
    const { t, spans } = collapseSpacing(cleaned, true);
    const newLine = !cur || lastEol || Math.abs(r.y - cur.y) > 0.5 * Math.max(h, cur.hmax);
    if (newLine) {
      finish();
      cur = { text: '', em: [], x0: r.x, x1: r.x + r.w, y: r.y, h, hmax: h };
      sizes = new Map();
    }
    const line = cur!;
    const gap = r.x - lastEnd;
    let piece = t;
    // a run that starts left of the previous one (out of reading order, e.g. a page number) is a new word too
    if (line.text && Math.abs(gap) > 0.18 * h && !line.text.endsWith(' ') && !piece.startsWith(' ')) piece = ' ' + piece;
    if (line.text.endsWith(' ') && piece.startsWith(' ')) piece = piece.slice(1);
    const at = line.text.length + (piece.length - t.length);
    for (const [a, b] of spans) line.em.push({ s: at + a, e: at + b, k: 1 });
    line.text += piece;
    line.x1 = Math.max(line.x1, r.x + r.w);
    line.hmax = Math.max(line.hmax, h);
    const letters = t.replace(/\s/g, '').length;
    if (letters) sizes.set(Math.round(h * 2) / 2, (sizes.get(Math.round(h * 2) / 2) ?? 0) + letters);
    lastEnd = r.x + r.w;
    lastEol = r.eol;
  }
  finish();
  return lines;
}

const normRepeat = (t: string) => t.toLowerCase().replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').trim();
// a printed page number stands alone at either end of a header line ("72 Der Politiker", "Der Politiker 72");
// "1. Kapitel" is not one
const numbersIn = (t: string) => {
  const toks = t.split(' ');
  return [toks[0], toks[toks.length - 1]].filter((x) => /^\d{1,4}$/.test(x)).map(Number);
};

// running headers and footers: lines at the page edges that repeat on many pages, lone page numbers,
// and short edge lines that carry the printed page number (found as a constant offset from the pdf page)
function stripFurniture(pages: Line[][]): Line[][] {
  const sorted = pages.map((ls) => [...ls].sort((a, b) => b.y - a.y));
  const edges = sorted.map((ls) => new Set([...ls.slice(0, 2), ...ls.slice(-2)]));
  const outer = sorted.map((ls) => new Set(ls.length ? [ls[0], ls[ls.length - 1]] : []));
  const counts = new Map<string, number>();
  const offsets = new Map<number, number>();
  pages.forEach((_, i) => {
    for (const k of new Set([...edges[i]].map((l) => normRepeat(l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const l of outer[i]) for (const n of new Set(numbersIn(l.text))) offsets.set(i + 1 - n, (offsets.get(i + 1 - n) ?? 0) + 1);
  });
  let offset: number | null = null;
  let seen = 0;
  for (const [o, n] of offsets) if (n > seen) [offset, seen] = [o, n];
  if (seen < Math.max(3, pages.length * 0.3)) offset = null;
  const limit = Math.max(3, pages.length * 0.05);
  return pages.map((ls, i) =>
    ls.filter((l) => {
      if (!edges[i].has(l)) return true;
      if (RE_PAGE_NO.test(l.text) || (counts.get(normRepeat(l.text)) ?? 0) >= limit) return false;
      return !(offset !== null && outer[i].has(l) && l.text.length <= 80 && numbersIn(l.text).includes(i + 1 - offset));
    }),
  );
}

const endsSentence = (t: string) => /[.!?:"”»)\]]$/.test(t);

// joins the next line onto a paragraph; returns the text and where the next line starts in it
function joinLine(prev: string, next: string): { t: string; at: number } {
  // "infor-" + "mation" → "information"; "Nord-" + "Süd" keeps the hyphen
  if (/\p{L}[-‐]$/u.test(prev) && /^\p{Ll}/u.test(next)) return { t: prev.slice(0, -1) + next, at: prev.length - 1 };
  if (/\p{L}[-‐]$/u.test(prev)) return { t: prev + next, at: prev.length };
  return { t: prev + ' ' + next, at: prev.length + 1 };
}

export function layoutPdf(pagesRuns: Run[][]): Layout {
  const heights: number[] = [];
  for (const runs of pagesRuns) for (const r of runs) if (r.str.trim()) for (let i = 0; i < Math.min(r.str.length, 40); i++) heights.push(Math.abs(r.h));
  const bodySize = median(heights) || 10;

  const pages = stripFurniture(pagesRuns.map((runs) => buildLines(runs, bodySize)));
  const pageTags = pages.map((ls) => tagFromLines(ls.map((l) => l.text)));
  // a single unrecognised page inside a run of index (or contents) pages belongs to that run
  for (let i = 1; i + 1 < pageTags.length; i++) if (!pageTags[i] && pageTags[i - 1] && pageTags[i - 1] === pageTags[i + 1]) pageTags[i] = pageTags[i - 1];

  const body = (l: Line) => Math.abs(l.h - bodySize) < 0.2 * bodySize;
  // typical distance between consecutive body lines
  const steps: number[] = [];
  for (const ls of pages)
    for (let i = 1; i < ls.length; i++) {
      const d = ls[i - 1].y - ls[i].y;
      if (d > 0 && d < 3 * bodySize && body(ls[i])) steps.push(d);
    }
  const step = median(steps) || bodySize * 1.2;
  const left = median(pages.flat().filter(body).map((l) => l.x0));
  const right = median(pages.flat().filter(body).map((l) => l.x1));

  // chapter lines recognised by their wording only count outside tables of contents and indexes
  const headingLevel = (l: Line, page: number) => {
    if (l.text.length > 160) return 0;
    const r = l.h / bodySize;
    const bySize = r >= 1.6 ? 1 : r >= 1.3 ? 2 : r >= 1.15 ? 3 : 0;
    if (!pageTags[page] && r >= 0.95 && /^[\p{Lu}\d]/u.test(l.text) && RE_CHAPTER.test(l.text)) return bySize ? Math.min(bySize, 2) : 2;
    return bySize;
  };

  const paras: Para[] = [];
  let cur: Para | null = null;
  let prev: Line | null = null;
  const push = () => {
    if (!cur) return;
    if (!cur.em?.length) delete cur.em;
    paras.push(cur);
  };
  pages.forEach((ls, pi) => {
    ls.forEach((l, li) => {
      const h = headingLevel(l, pi);
      let start = !cur || !prev;
      if (cur && prev) {
        const firstOnPage = li === 0;
        const gap = prev.y - l.y;
        const sizeChange = Math.abs(l.h - prev.h) > 0.2 * bodySize;
        const continues = !endsSentence(cur.t) && /^\p{Ll}/u.test(l.text);
        if (h !== (cur.h ?? 0) || sizeChange || (h === 2 && RE_CHAPTER.test(l.text))) start = true;
        else if (firstOnPage || gap < -0.5 * step) start = !continues; // new page or new column
        // heading lines sit further apart than body lines: measure their gap against their own size
        else if (gap > 1.6 * (h ? l.h * 1.25 : step)) start = true;
        else if (endsSentence(prev.text) && (l.x0 > left + 0.8 * bodySize || prev.x1 < right - 4 * bodySize)) start = true;
      }
      if (start) {
        push();
        cur = { t: l.text, pg: pi + 1, em: l.em.map((r) => ({ ...r })) };
        if (h) cur.h = h;
      } else if (cur) {
        const { t, at } = joinLine(cur.t, l.text);
        cur.em = [...(cur.em ?? []).map((r) => ({ ...r, e: Math.min(r.e, t.length) })), ...l.em.map((r) => ({ ...r, s: r.s + at, e: r.e + at }))];
        cur.t = t;
      }
      prev = l;
    });
  });
  push();
  return { paras: paras.filter((p) => !RE_PAGE_NO.test(p.t)), pageTags, bodySize };
}

// "3-5, 9" from a sorted list of 1-based pages
export function pagesToRanges(pages: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < pages.length; ) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(i === j ? `${pages[i]}` : `${pages[i]}-${pages[j]}`);
    i = j + 1;
  }
  return out.join(', ');
}

export function parseRanges(s: string, max = Infinity): Set<number> {
  const set = new Set<number>();
  for (const part of s.replace(/\s*[-–]\s*/g, '-').split(/[,;\s]+/)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Math.min(Number(m[2] ?? m[1]), max);
    for (let p = a; p <= b && p - a < 100000; p++) set.add(p);
  }
  return set;
}
