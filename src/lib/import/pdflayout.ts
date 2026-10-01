import type { Para } from '../types';
import { cleanText } from './html';
import { tagFromLines } from './classify';

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
  x0: number;
  x1: number;
  y: number;
  h: number;
}

export interface Layout {
  paras: Para[];
  // per page: lines kept after header/footer removal (for skip suggestions)
  pageTags: (string | null)[];
  bodySize: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const RE_PAGE_NO = /^\s*(page\s*)?([0-9]{1,4}|[ivxlcdm]{1,7})(\s*(\/|of)\s*[0-9]{1,4})?\s*$/i;

function buildLines(runs: Run[], bodySize: number): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  let lastEnd = 0;
  let lastEol = false;
  for (const r of runs) {
    const h = Math.abs(r.h) || bodySize;
    if (!r.str) {
      if (r.eol) lastEol = true;
      continue;
    }
    // footnote markers: small raised digits glued to the word before
    if (cur && h < 0.75 * cur.h && r.y > cur.y + 0.2 * cur.h && /^[\d*†‡,\s]+$/.test(r.str)) continue;
    const newLine = !cur || lastEol || Math.abs(r.y - cur.y) > 0.5 * Math.max(h, cur.h);
    if (newLine) {
      if (cur) lines.push(cur);
      cur = { text: r.str, x0: r.x, x1: r.x + r.w, y: r.y, h };
    } else if (cur) {
      const gap = r.x - lastEnd;
      const space = gap > 0.18 * h && !cur.text.endsWith(' ') && !r.str.startsWith(' ');
      cur.text += (space ? ' ' : '') + r.str;
      cur.x1 = Math.max(cur.x1, r.x + r.w);
      cur.h = Math.max(cur.h, h);
    }
    lastEnd = r.x + r.w;
    lastEol = r.eol;
  }
  if (cur) lines.push(cur);
  for (const l of lines) l.text = cleanText(l.text).replace(/\s+/g, ' ').trim();
  return lines.filter((l) => l.text);
}

const normRepeat = (t: string) => t.toLowerCase().replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').trim();

// running headers/footers repeat on many pages; lone page numbers sit at the top or bottom
function stripFurniture(pages: Line[][]): Line[][] {
  const counts = new Map<string, number>();
  const edges = (ls: Line[]) => {
    const byY = [...ls].sort((a, b) => b.y - a.y);
    return [...byY.slice(0, 2), ...byY.slice(-2)];
  };
  for (const ls of pages) for (const k of new Set(edges(ls).map((l) => normRepeat(l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1);
  const limit = Math.max(3, pages.length * 0.25);
  return pages.map((ls) => {
    const edge = new Set(edges(ls));
    return ls.filter((l) => !(edge.has(l) && (RE_PAGE_NO.test(l.text) || (counts.get(normRepeat(l.text)) ?? 0) >= limit)));
  });
}

const endsSentence = (t: string) => /[.!?:"”»)\]]$/.test(t);

function joinLine(prev: string, next: string): string {
  // "infor-" + "mation" → "information"; "Nord-" + "Süd" keeps the hyphen
  if (/\p{L}-$/u.test(prev) && /^\p{Ll}/u.test(next)) return prev.slice(0, -1) + next;
  if (/\p{L}-$/u.test(prev)) return prev + next;
  return prev + ' ' + next;
}

export function layoutPdf(pagesRuns: Run[][]): Layout {
  const heights: number[] = [];
  for (const runs of pagesRuns) for (const r of runs) if (r.str.trim()) for (let i = 0; i < Math.min(r.str.length, 40); i++) heights.push(Math.abs(r.h));
  const bodySize = median(heights) || 10;

  const pages = stripFurniture(pagesRuns.map((runs) => buildLines(runs, bodySize)));
  const pageTags = pages.map((ls) => tagFromLines(ls.map((l) => l.text)));

  // typical distance between consecutive body lines
  const steps: number[] = [];
  for (const ls of pages)
    for (let i = 1; i < ls.length; i++) {
      const d = ls[i - 1].y - ls[i].y;
      if (d > 0 && d < 3 * bodySize && Math.abs(ls[i].h - bodySize) < 0.2 * bodySize) steps.push(d);
    }
  const step = median(steps) || bodySize * 1.2;
  const left = median(pages.flat().filter((l) => Math.abs(l.h - bodySize) < 0.2 * bodySize).map((l) => l.x0));
  const right = median(pages.flat().filter((l) => Math.abs(l.h - bodySize) < 0.2 * bodySize).map((l) => l.x1));

  const headingLevel = (l: Line) => {
    if (l.text.length > 160) return 0;
    const r = l.h / bodySize;
    return r >= 1.6 ? 1 : r >= 1.3 ? 2 : r >= 1.15 ? 3 : 0;
  };

  const paras: Para[] = [];
  let cur: Para | null = null;
  let prev: Line | null = null;
  pages.forEach((ls, pi) => {
    ls.forEach((l, li) => {
      const h = headingLevel(l);
      let start = !cur || !prev;
      if (cur && prev) {
        const firstOnPage = li === 0;
        const gap = prev.y - l.y;
        const sizeChange = Math.abs(l.h - prev.h) > 0.2 * bodySize;
        const continues = !endsSentence(cur.t) && /^\p{Ll}/u.test(l.text);
        if (h !== (cur.h ?? 0) || sizeChange) start = true;
        else if (firstOnPage || gap < -0.5 * step) start = !continues; // new page or new column
        // heading lines sit further apart than body lines: measure their gap against their own size
        else if (gap > 1.6 * (h ? l.h * 1.25 : step)) start = true;
        else if (endsSentence(prev.text) && (l.x0 > left + 0.8 * bodySize || prev.x1 < right - 4 * bodySize)) start = true;
      }
      if (start) {
        if (cur) paras.push(cur);
        cur = { t: l.text, pg: pi + 1 };
        if (h) cur.h = h;
      } else if (cur) cur.t = joinLine(cur.t, l.text);
      prev = l;
    });
  });
  if (cur) paras.push(cur);
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
