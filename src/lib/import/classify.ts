import type { Para, SkipTag } from '../types';

// section titles that mark material most readers skip, in the languages books commonly come in
const TITLES: [SkipTag, RegExp][] = [
  ['contents', /^(table of contents|contents|content|inhalt|inhaltsverzeichnis|inhaltsübersicht|übersicht|sommaire|table des matières|índice|indice|sommario|inhoud|inhoudsopgave|spis treści|目次|目录|оглавление|содержание|list of (figures|tables|illustrations)|abbildungsverzeichnis|tabellenverzeichnis)$/],
  ['index', /^(index|indices|register|((personen|namen|orts|sach)-? und )?(personen|namen|orts|sach|stichwort|schlagwort)verzeichnis|stichwortverzeichnis|sachregister|personenregister|namensregister|ortsregister|schlagwortverzeichnis|subject index|name index|índice alfabético|indice analitico|索引|указатель|предметный указатель)$/],
  ['glossary', /^(glossary|glossar|glossaire|glosario|glossario|wörterverzeichnis|begriffserklärungen?|abkürzungen|abkürzungsverzeichnis|abbreviations|list of abbreviations|用語集|术语表|глоссарий)$/],
  ['references', /^(bibliography|references|works cited|literature|literatur|literaturverzeichnis|literaturliste|quellen|quellenverzeichnis|sources|further reading|weiterführende literatur|bibliographie|bibliografía|bibliografia|参考文献|литература|список литературы)$/],
  ['credits', /^(copyright|copyright page|impressum|imprint|colophon|kolophon|acknowledg(e)?ments?|danksagung|dank|about the authors?|about this book|über den autor|über die autorin|über die autoren|über das buch|zum autor|zur autorin|zum buch|der autor|die autorin|also by .*|other (books|titles) by .*|weitere (bücher|titel) .*|dedication|widmung|title page|titelseite|titel|half title|credits|praise for .*|(the )?project gutenberg.*|.*project gutenberg.*licen[cs]e.*)$/],
  ['notes', /^(notes|endnotes|anmerkungen|endnoten|fußnoten|footnotes|notes and references|annotations|注|注释|примечания)$/],
  ['intro', /^(introduction|einleitung|einführung|preface|vorwort|vorbemerkung|foreword|geleitwort|préface|avant-propos|introducción|prefacio|prefazione|introduzione|voorwoord|inleiding|まえがき|はじめに|序言|前言|предисловие|введение)$/],
  ['cover', /^(cover|cover page|umschlag|titelbild|front cover)$/],
];

// epub 3 landmarks / epub 2 guide types
const TYPES: Record<string, SkipTag> = {
  toc: 'contents',
  loi: 'contents',
  lot: 'contents',
  index: 'index',
  glossary: 'glossary',
  bibliography: 'references',
  'copyright-page': 'credits',
  colophon: 'credits',
  acknowledgments: 'credits',
  acknowledgements: 'credits',
  dedication: 'credits',
  titlepage: 'credits',
  'title-page': 'credits',
  halftitlepage: 'credits',
  imprint: 'credits',
  contributors: 'credits',
  'other-credits': 'credits',
  endnotes: 'notes',
  footnotes: 'notes',
  rearnotes: 'notes',
  notes: 'notes',
  preface: 'intro',
  foreword: 'intro',
  introduction: 'intro',
  cover: 'cover',
};

export function tagFromType(type: string | null | undefined): SkipTag | null {
  if (!type) return null;
  for (const t of type.toLowerCase().split(/\s+/)) {
    const k = t.replace(/^.*:/, '');
    if (TYPES[k]) return TYPES[k];
  }
  return null;
}

export function normTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[\u{ad}\u{200b}]/gu, '')
    // "1 introduction", "chapter 2: notes", "ii. preface"
    .replace(/^(chapter|kapitel|teil|part|section|abschnitt)?\s*([0-9]+|[ivxlc]+)?\s*[.:)\-–—]?\s+/i, '')
    .replace(/[^\p{L}\p{N}\s.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tagFromTitle(title: string): SkipTag | null {
  const t = normTitle(title);
  if (!t) return null;
  for (const [tag, re] of TITLES) if (re.test(t)) return tag;
  return null;
}

const RE_TOC_LINE = /(\.{2,}|…|·{2,}|\s)\s*([0-9]{1,4}|[ivxlc]{1,6})$/i;
const RE_PAGE_LIST = /\b\d{1,4}(\s*ff?\.)?\s*[,;]\s*\d{1,4}\b/;
const RE_MID_NUMBER = /\p{L}[)"“”»]?:?\s+\d{1,4}\s*(ff?\.)?[.,;]?\s+[\p{L}–-]/u;
const RE_INDEX_LINE = /^[\p{L}][^,;]{0,60}[,;]\s*\d+([-–,;\s]+\d+)*\.?$/u;

// a page or section whose lines mostly end in page numbers is a table of contents; "term, 12, 45" lines make an index
export function tagFromLines(lines: string[]): SkipTag | null {
  const ls = lines.map((l) => l.trim()).filter((l) => l.length > 1);
  if (ls.length < 5) return null;
  // index lines carry lists of pages ("204, 579, 582 f."); checked first, since they also end in numbers
  const lists = ls.filter((l) => RE_PAGE_LIST.test(l)).length;
  // "Grundlage der Nation 151. – Schwächung …": page numbers in the middle of the line, not only at its end
  const mid = ls.filter((l) => RE_MID_NUMBER.test(l)).length;
  if ((lists >= 5 && lists / ls.length >= 0.4) || (mid >= 8 && mid / ls.length >= 0.35)) return 'index';
  const toc = ls.filter((l) => l.length < 140 && RE_TOC_LINE.test(l)).length;
  if (toc >= 5 && toc / ls.length >= 0.45) return 'contents';
  const idx = ls.filter((l) => l.length < 120 && RE_INDEX_LINE.test(l)).length;
  if (idx >= 5 && idx / ls.length >= 0.5) return 'index';
  return null;
}

export function classify(opts: { title?: string; type?: string | null; file?: string; paras?: Para[] }): SkipTag | null {
  const byType = tagFromType(opts.type);
  if (byType) return byType;
  if (opts.title) {
    const byTitle = tagFromTitle(opts.title);
    if (byTitle) return byTitle;
  }
  if (opts.paras) {
    const first = opts.paras.find((p) => p.h);
    if (first) {
      const byHeading = tagFromTitle(first.t);
      if (byHeading) return byHeading;
    }
    const byLines = tagFromLines(opts.paras.map((p) => p.t));
    if (byLines) return byLines;
  }
  if (opts.file) {
    const f = opts.file.toLowerCase().replace(/^.*\//, '');
    if (/(^|[^a-z])(toc|contents|nav)([^a-z]|$)/.test(f)) return 'contents';
    if (/copyright|colophon|imprint|impressum|titlepage|title-page|dedication|acknowledg/.test(f)) return 'credits';
    if (/(^|[^a-z])cover([^a-z]|$)/.test(f)) return 'cover';
  }
  return null;
}

export function countWords(paras: Para[]): number {
  let n = 0;
  for (const p of paras) {
    const cjk = p.t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
    const rest = p.t.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' ');
    n += (rest.match(/\S+/g)?.length ?? 0) + cjk / 1.6;
  }
  return Math.round(n);
}
