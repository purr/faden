import { isHan, type Script } from './lang';

const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// below u+0300 there are no combining marks, surrogates or joiners: one code unit is one grapheme
function isSimple(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) >= 0x300) return false;
  return true;
}

// user-perceived characters; utf-16 indexing would cut emoji and indic conjuncts in half
export function graphemes(s: string): string[] {
  if (isSimple(s)) return s.split('');
  const out: string[] = [];
  for (const g of seg.segment(s)) out.push(g.segment);
  return out;
}

// index of the focus grapheme in a word of n graphemes
export function orpIndex(gs: string[], script: Script, lang: string): number {
  const n = gs.length;
  if (n <= 1) return 0;
  switch (script) {
    case 'latin':
      // spritz's length table (1→0, 2–5→1, 6–9→2, 10–13→3, 14+→4) in closed form,
      // continued every 4 letters so long german compounds keep the pivot about a quarter in
      return Math.floor((n + 2) / 4);
    case 'rtl':
      // hebrew/arabic: recognition is best near the centre; long words a bit toward their start
      return n < 9 ? Math.floor((n - 1) / 2) : Math.floor((n - 1) * 0.4);
    case 'cj': {
      if (lang.startsWith('ja')) {
        // bunsetsu: centre, pulled to a neighbouring kanji when there is one
        const c = Math.floor((n - 1) / 2);
        if (isHan(gs[c])) return c;
        if (c > 0 && isHan(gs[c - 1])) return c - 1;
        if (c + 1 < n && isHan(gs[c + 1])) return c + 1;
        return c;
      }
      // chinese: first character of 2-character words, second of 3–4 (liu & li 2013)
      return n <= 2 ? 0 : n <= 4 ? 1 : Math.floor((n - 1) / 2);
    }
    default:
      return Math.floor((n - 1) / 2);
  }
}

// utf-16 [start, end) of the focus grapheme inside `core`, widened over clusters that only hold
// combining marks (burmese vowel signs) and over the lam-alef ligature
export function orpRange(core: string, script: Script, lang: string): [number, number] {
  const gs = graphemes(core);
  if (gs.length === 0) return [0, 0];
  let i = orpIndex(gs, script, lang);
  let j = i + 1;
  while (j < gs.length && /^\p{M}/u.test(gs[j])) j++;
  if (gs[i] === '\u{644}' && gs[j] && /^[\u{622}\u{623}\u{625}\u{627}]/u.test(gs[j])) j++;
  else if (i > 0 && gs[i - 1] === '\u{644}' && /^[\u{622}\u{623}\u{625}\u{627}]/u.test(gs[i])) i--;
  let start = 0;
  for (let k = 0; k < i; k++) start += gs[k].length;
  let end = start;
  for (let k = i; k < j; k++) end += gs[k].length;
  return [start, end];
}
