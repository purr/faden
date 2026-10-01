import type { Para } from './types';
import {
  RE_NO_SPACES,
  baseLang,
  isAbbreviation,
  isFunctionWord,
  isKana,
  isNegation,
  isOrdinal,
  scriptOf,
  type Script,
} from './lang';
import { graphemes, orpRange } from './orp';

export interface Word {
  // paragraph index and utf-16 range of the token in the paragraph text
  p: number;
  s: number;
  e: number;
  // display text; may differ from the paragraph slice when stray punctuation was merged in
  text: string;
  // core (letters and digits, inner punctuation kept) as [cs, ce) inside `text`
  cs: number;
  ce: number;
  g: number;
  script: Script;
  sentEnd: boolean;
  // 1: comma-like, 2: semicolon, colon, dash, ellipsis
  clause: 0 | 1 | 2;
  paraEnd: boolean;
  head: number;
  em: number;
  num: boolean;
  acronym: boolean;
  name: boolean;
  neg: boolean;
  func: boolean;
  sent: number;
  // share of the wpm budget: 1 per word, characters / 1.6 for chinese and japanese
  src: number;
}

export interface Frame {
  w0: number;
  w1: number;
  text: string;
  // focus grapheme as a utf-16 range inside `text`
  o0: number;
  o1: number;
  script: Script;
  em: number;
  head: number;
  // graphemes in the focus word (or in this part of a split word)
  g: number;
  src: number;
  // 0 for whole words; 1..parts for pieces of a hyphen-split word
  part: number;
  parts: number;
}

export interface Section {
  words: Word[];
  frames: Frame[];
  sentences: [number, number][];
  // first frame that shows each word
  wordFrame: Int32Array;
}

export interface TokenizeOpts {
  lang: string;
  group: boolean;
  splitHyphens: boolean;
}

interface Tok {
  s: number;
  e: number;
  t: string;
}

// a frame of grouped words stays short enough to take in at one glance
const GROUP_MAX_CHARS = 14;
const GROUP_MAX_WORDS = 3;
// words longer than this are split, but only at hyphens the author wrote
const SPLIT_OVER = 13;

const RE_LEAD = /^[^\p{L}\p{N}]*/u;
const RE_TRAIL = /[^\p{L}\p{N}]*$/u;
const RE_OPENER = /^[\p{Ps}\p{Pi}"'„‚¿¡«‹「『（【〔]+$/u;
const RE_BULLET = /^[•·▪◦‣*]+$/u;
const RE_DASH = /^[—–―-]+$/u;
const RE_SENT = /[.!?…。！？]/u;
const RE_SYMBOL = /[\p{Extended_Pictographic}\p{Sc}\p{Sm}&§%#@]/u;
const RE_COMMA = /[,，、،]/u;
const RE_CLAUSE = /[;:；：—–…]/u;

const wordSegs = new Map<string, Intl.Segmenter>();
function wordSeg(lang: string): Intl.Segmenter {
  let s = wordSegs.get(lang);
  if (!s) wordSegs.set(lang, (s = new Intl.Segmenter(lang, { granularity: 'word' })));
  return s;
}

const letters = (t: string) => (t.match(/[\p{L}\p{N}]/gu) ?? []).length;

function rawTokens(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const s = m.index;
    const t = m[0];
    // "house—then" and "PRESS:—CHARLES" are two words: split after an unspaced dash before a letter.
    // no lookbehind here: safari before 16.4 rejects the whole script at parse time
    let last = 0;
    for (const d of t.matchAll(/([\p{L}\p{N}][.,;:!?"”’)]*)[—–](?=\p{L})/gu)) {
      const cut = d.index + d[1].length + 1;
      out.push({ s: s + last, e: s + cut, t: t.slice(last, cut) });
      last = cut;
    }
    out.push({ s: s + last, e: s + t.length, t: t.slice(last) });
  }
  return out;
}

// chinese, japanese and thai have no spaces: segment into words, then into readable chunks
function splitNoSpace(tok: Tok, lang: string): Tok[] {
  if (!RE_NO_SPACES.test(tok.t)) return [tok];
  const cj = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(tok.t);
  const ja = cj && (isKana(tok.t) || baseLang(lang) === 'ja');
  const segLang = cj ? (ja ? 'ja' : 'zh') : baseLang(lang) === 'und' ? 'th' : lang;
  const pieces: (Tok & { w: boolean })[] = [];
  for (const sg of wordSeg(segLang).segment(tok.t)) {
    const piece = { s: tok.s + sg.index, e: tok.s + sg.index + sg.segment.length, t: sg.segment, w: !!sg.isWordLike };
    const prev = pieces[pieces.length - 1];
    if (!piece.w && prev) {
      prev.e = piece.e;
      prev.t += piece.t;
      continue;
    }
    pieces.push(piece);
  }
  const out: Tok[] = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    const prevOpen = prev && !/[^\p{L}\p{N}]$/u.test(prev.t);
    const a = prev ? letters(prev.t) : 0;
    const b = letters(p.t);
    // japanese: particles and endings (kana) join the word before them, as a bunsetsu does
    const joinJa = ja && prevOpen && /^[\p{Script=Hiragana}ー]+$/u.test(p.t) && a + b <= 8;
    // chinese and thai: single characters join a neighbour up to 4 characters
    const joinShort = !ja && prevOpen && a + b <= 4 && (a === 1 || b === 1);
    if (prev && (joinJa || joinShort)) {
      prev.e = p.e;
      prev.t += p.t;
    } else out.push({ s: p.s, e: p.e, t: p.t });
  }
  return out;
}

function emphasisAt(para: Para, s: number, e: number): number {
  let k = 0;
  for (const r of para.em ?? []) if (r.s < e && r.e > s) k |= r.k;
  return k;
}

export function tokenize(paras: Para[], opts: TokenizeOpts): Section {
  const words: Word[] = [];
  const lang = opts.lang;
  const de = baseLang(lang) === 'de';

  paras.forEach((para, p) => {
    const toks = rawTokens(para.t).flatMap((t) => splitNoSpace(t, lang));
    const first = words.length;
    let pendingLead: Tok | null = null;
    for (const tok of toks) {
      let { s, e, t } = tok;
      const core0 = t.replace(RE_LEAD, '').replace(RE_TRAIL, '');
      // emoji and symbols like "&" or "€" carry meaning: shown as words of their own
      const symbol = !core0 && RE_SYMBOL.test(t);
      if (!core0 && !symbol) {
        const prev = words.length > first ? words[words.length - 1] : null;
        if (RE_OPENER.test(t) || (!prev && RE_DASH.test(t))) {
          // opening quotes, and dialogue dashes at a paragraph start, go with the next word
          pendingLead = pendingLead ? { s: pendingLead.s, e, t: pendingLead.t + ' ' + t } : tok;
        } else if (prev && !RE_BULLET.test(t)) {
          // dashes, ellipses and closing marks stay with the word before
          prev.text += ' ' + t;
          prev.e = e;
          // a spaced "?" or "!" (french style) is read by the sentence pass from the extended trail
          if (RE_CLAUSE.test(t) || RE_DASH.test(t)) prev.clause = 2;
        }
        continue;
      }
      let leadText = '';
      if (pendingLead) {
        leadText = pendingLead.t.replace(/\s+/g, '');
        s = pendingLead.s;
        pendingLead = null;
      }
      const text = leadText + t;
      const lead = symbol ? 0 : text.match(RE_LEAD)![0].length;
      const trail = symbol ? '' : text.match(RE_TRAIL)![0];
      const cs = lead;
      const ce = text.length - trail.length;
      const core = text.slice(cs, ce);
      const g = graphemes(core).length;
      const script = scriptOf(core);
      words.push({
        p,
        s,
        e,
        text,
        cs,
        ce,
        g,
        script,
        sentEnd: false,
        clause: RE_COMMA.test(trail) ? 1 : RE_CLAUSE.test(trail) ? 2 : 0,
        paraEnd: false,
        head: para.h ?? 0,
        em: emphasisAt(para, s, e),
        num: /\p{N}/u.test(core),
        acronym: g >= 2 && /^[\p{Lu}\p{N}]+$/u.test(core) && /\p{Lu}/u.test(core),
        name: false,
        neg: isNegation(core, lang),
        func: isFunctionWord(core, lang, g),
        sent: 0,
        src: script === 'cj' ? Math.max(0.6, g / 1.6) : 1,
      });
    }
    if (words.length === first) return;
    const last = words[words.length - 1];
    last.paraEnd = true;
    last.sentEnd = true;
  });

  // sentence ends, which need the next word to decide
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.sentEnd) continue;
    const trail = w.text.slice(w.ce);
    if (!RE_SENT.test(trail)) continue;
    const core = w.text.slice(w.cs, w.ce);
    const next = words[i + 1];
    const nextCore = next?.text.slice(next.cs, next.ce);
    const onlyPeriod = !/[!?…。！？]/u.test(trail);
    if (/[。！？]/u.test(trail)) w.sentEnd = true;
    else if (onlyPeriod && isAbbreviation(core, lang)) continue;
    else if (onlyPeriod && /^\p{Lu}$/u.test(core)) continue;
    else if (onlyPeriod && isOrdinal(core, nextCore, lang)) continue;
    else if (nextCore && /^\p{Ll}/u.test(nextCore)) w.clause = Math.max(w.clause, 2) as 2;
    else w.sentEnd = true;
  }

  const sentences: [number, number][] = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    w.sent = sentences.length;
    // a capital inside a sentence usually marks a name; german capitalises every noun, so not there
    const core = w.text.slice(w.cs, w.ce);
    w.name = !de && i > start && w.script === 'latin' && !w.acronym && /^\p{Lu}/u.test(core);
    if (w.sentEnd) {
      sentences.push([start, i]);
      start = i + 1;
    }
  }

  const frames = buildFrames(words, opts);
  const wordFrame = new Int32Array(words.length).fill(-1);
  frames.forEach((f, i) => {
    for (let k = f.w0; k <= f.w1; k++) if (wordFrame[k] < 0) wordFrame[k] = i;
  });
  return { words, frames, sentences, wordFrame };
}

function canAttach(a: Word, b: Word | undefined): b is Word {
  return (
    !!b &&
    a.func &&
    !a.neg &&
    a.clause === 0 &&
    !a.sentEnd &&
    a.ce === a.text.length &&
    b.p === a.p &&
    b.em === a.em &&
    b.head === a.head &&
    a.script !== 'cj' &&
    a.script !== 'sea' &&
    b.script === a.script
  );
}

function frameFor(words: Word[], w0: number, w1: number, lang: string): Frame {
  const text = words
    .slice(w0, w1 + 1)
    .map((w) => w.text)
    .join(' ');
  const h = words[w1];
  const off = text.length - h.text.length;
  const [a, b] = orpRange(h.text.slice(h.cs, h.ce), h.script, lang);
  return {
    w0,
    w1,
    text,
    o0: off + h.cs + a,
    o1: off + h.cs + b,
    script: h.script,
    em: h.em,
    head: h.head,
    g: h.g,
    src: words.slice(w0, w1 + 1).reduce((n, w) => n + w.src, 0),
    part: 0,
    parts: 0,
  };
}

function splitAtHyphens(w: Word, i: number, lang: string): Frame[] | null {
  const core = w.text.slice(w.cs, w.ce);
  if (w.g <= SPLIT_OVER || !/\p{L}-\p{L}/u.test(core)) return null;
  // pieces keep their hyphen: "Nord-", "Süd-", "Verbindung"; then greedily rejoin up to the limit
  const pieces = core.match(/[^-]+-?|-/g) ?? [core];
  const parts: string[] = [];
  for (const piece of pieces) {
    const last = parts[parts.length - 1];
    if (last !== undefined && graphemes(last + piece).length <= SPLIT_OVER) parts[parts.length - 1] = last + piece;
    else parts.push(piece);
  }
  if (parts.length < 2) return null;
  const lead = w.text.slice(0, w.cs);
  const trail = w.text.slice(w.ce);
  return parts.map((part, k) => {
    const pre = k === 0 ? lead : '';
    const text = pre + part + (k === parts.length - 1 ? trail : '');
    const focus = part.replace(/-$/, '');
    const [a, b] = orpRange(focus, w.script, lang);
    return {
      w0: i,
      w1: i,
      text,
      o0: pre.length + a,
      o1: pre.length + b,
      script: w.script,
      em: w.em,
      head: w.head,
      g: graphemes(focus).length,
      src: 1 / parts.length,
      part: k + 1,
      parts: parts.length,
    };
  });
}

function buildFrames(words: Word[], opts: TokenizeOpts): Frame[] {
  const frames: Frame[] = [];
  for (let i = 0; i < words.length; ) {
    const w = words[i];
    const split = opts.splitHyphens ? splitAtHyphens(w, i, opts.lang) : null;
    if (split) {
      frames.push(...split);
      i++;
      continue;
    }
    let j = i;
    if (opts.group && w.func) {
      // function words lean forward onto the next content word; a chain that runs out of room
      // before reaching one ("er sich in …") is not grouped, so every frame ends on a content word
      let k = i;
      let len = w.text.length;
      while (k - i + 1 < GROUP_MAX_WORDS && canAttach(words[k], words[k + 1])) {
        const next = words[k + 1];
        if (len + 1 + next.text.length > GROUP_MAX_CHARS) break;
        len += 1 + next.text.length;
        k++;
        if (!next.func) break;
      }
      if (k > i && !words[k].func) j = k;
    }
    frames.push(frameFor(words, i, j, opts.lang));
    i = j + 1;
  }
  return frames;
}
