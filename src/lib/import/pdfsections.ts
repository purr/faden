import type { Para, SectionMeta } from '../types';
import { classify, countWords, normTitle } from './classify';

// an outline (bookmark) entry, resolved to a 0-based page
export interface Mark {
  title: string;
  page: number;
}

type Cut = { at: number; title: string };

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

function outlineCuts(paras: Para[], marks: Mark[]): Cut[] {
  const cuts: Cut[] = [];
  let from = 0;
  for (const m of marks) {
    const at = findStart(paras, from, m.page + 1, m.title);
    if (at >= paras.length) break;
    if (cuts.length && at <= cuts[cuts.length - 1].at) continue;
    cuts.push({ at, title: m.title });
    from = at;
  }
  return cuts;
}

// sections at large headings; a heading right after another ("Erster Band", "EINE ABRECHNUNG") joins it,
// and a smaller subtitle that follows ("1. Kapitel", "Im Elternhaus") completes the title
function headingCuts(paras: Para[]): Cut[] {
  const cuts: (Cut & { end: number })[] = [];
  paras.forEach((p, i) => {
    if (!p.h || p.h > 2) return;
    const last = cuts[cuts.length - 1];
    if (last && i - last.end <= 1) {
      last.title += `: ${p.t}`;
      last.end = i;
    } else cuts.push({ at: i, title: p.t, end: i });
  });
  for (const c of cuts) {
    const sub = paras[c.end + 1];
    if (sub?.h && sub.h > 2 && sub.t.length < 90) c.title += `: ${sub.t}`;
  }
  return cuts.map(({ at, title }) => ({ at, title }));
}

// no structure at all: ten-page parts keep each part's text view light
function pageCuts(paras: Para[], numPages: number): Cut[] {
  const cuts: Cut[] = [];
  for (let i = 0; i < paras.length; i++) {
    const pg = paras[i].pg ?? 1;
    if (i === 0 || Math.floor((pg - 1) / 10) !== Math.floor(((paras[i - 1].pg ?? 1) - 1) / 10)) {
      const a = Math.floor((pg - 1) / 10) * 10 + 1;
      cuts.push({ at: i, title: `Pages ${a}–${Math.min(a + 9, numPages)}` });
    }
  }
  return cuts;
}

// pages that look like a table of contents or an index become sections of their own, so they can be skipped
function pageTagCuts(paras: Para[], pageTags: (string | null)[], cuts: Cut[]): Cut[] {
  const out = [...cuts];
  const titleAt = (i: number) => [...cuts].reverse().find((c) => c.at <= i)?.title ?? 'Opening pages';
  for (let i = 0; i < paras.length; i++) {
    const tag = pageTags[(paras[i].pg ?? 1) - 1];
    const prevTag = i ? pageTags[(paras[i - 1].pg ?? 1) - 1] : null;
    if (tag && tag !== prevTag) out.push({ at: i, title: tag === 'index' ? 'Index' : 'Table of contents' });
    else if (!tag && prevTag && !cuts.some((c) => c.at === i)) out.push({ at: i, title: titleAt(i) });
  }
  const seen = new Set<number>();
  return out.sort((a, b) => a.at - b.at).filter((c) => !seen.has(c.at) && !!seen.add(c.at));
}

export function buildPdfSections(paras: Para[], pageTags: (string | null)[], marks: Mark[], numPages: number): { meta: SectionMeta; paras: Para[] }[] {
  let cuts = marks.length >= 2 ? outlineCuts(paras, marks) : [];
  if (cuts.length < 2) {
    const heads = headingCuts(paras);
    cuts = heads.length >= 3 && heads.length <= 400 && paras.length / heads.length >= 6 ? heads : pageCuts(paras, numPages);
  }
  cuts = pageTagCuts(paras, pageTags, cuts);
  const groups: { title: string; paras: Para[] }[] = [];
  if (cuts.length && cuts[0].at > 0) groups.push({ title: 'Opening pages', paras: paras.slice(0, cuts[0].at) });
  cuts.forEach((c, i) => {
    const slice = paras.slice(c.at, i + 1 < cuts.length ? cuts[i + 1].at : paras.length);
    if (slice.length) groups.push({ title: c.title, paras: slice });
  });
  return groups.map(({ title, paras: ps }) => {
    const first = ps[0].pg ?? 1;
    const last = ps[ps.length - 1].pg ?? first;
    const pageWords = new Array(last - first + 1).fill(0);
    for (const p of ps) pageWords[(p.pg ?? first) - first] += countWords([p]);
    const meta: SectionMeta = {
      title,
      tag: classify({ title, paras: ps }),
      skip: false,
      words: countWords(ps),
      pages: [first, last],
      pageWords,
    };
    return { meta, paras: ps };
  });
}
