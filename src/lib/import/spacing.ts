// letter-spaced emphasis (german "sperrsatz") comes out of pdf text layers as "G l e i c h e s": every
// letter separated by a space. these helpers join such runs back into words.

const RE_SPACED = /^[\p{L}\p{N},.;:!?'’"“”„»«()]$/u;
const isSpaced = (t: string) => t !== '' && [...t].length === 1 && RE_SPACED.test(t);
// letters and digits count; spaced punctuation alone ("- - -") is not a word
const isLetter = (t: string) => /^[\p{L}\p{N}]$/u.test(t);

// inside a joined run the word gaps are lost; put them back where the text itself shows a boundary:
// after punctuation, between letters and digits, and before a capital that follows a small letter
function rejoin(chars: string[]): string {
  return chars
    .join('')
    .replace(/([,;:!?])(?=[\p{L}\p{N}])/gu, '$1 ')
    .replace(/(\p{L})(?=\p{N})|(\p{N})(?=\p{L})/gu, '$1$2 ')
    .replace(/(\p{Ll})(?=\p{Lu})/gu, '$1 ');
}

export interface Collapsed {
  t: string;
  // ranges of `t` that were letter-spaced, i.e. emphasised
  spans: [number, number][];
}

// `whole`: the string is one pdf text run; when every token is a single character, even two of them form a
// word ("i n" → "in"). inside longer strings three single characters in a row are needed, so ordinary
// one-letter words ("a", "I", "à") stay untouched.
export function collapseSpacing(s: string, whole = false): Collapsed {
  if (!s.includes(' ')) return { t: s, spans: [] };
  const toks = s.split(' ');
  const solid = toks.filter((t) => t !== '');
  if (whole && solid.length >= 2 && solid.every(isSpaced) && solid.filter(isLetter).length >= 2) {
    const lead = s.startsWith(' ') ? ' ' : '';
    const tail = s.endsWith(' ') ? ' ' : '';
    const word = rejoin(solid);
    return { t: lead + word + tail, spans: [[lead.length, lead.length + word.length]] };
  }
  const out: string[] = [];
  const spans: [number, number][] = [];
  let len = 0;
  const emit = (w: string, spaced: boolean) => {
    if (out.length) len += 1;
    if (spaced) spans.push([len, len + w.length]);
    out.push(w);
    len += w.length;
  };
  let i = 0;
  let changed = false;
  while (i < toks.length) {
    let j = i;
    while (j < toks.length && isSpaced(toks[j])) j++;
    const run = toks.slice(i, j);
    if (run.length >= 3 && run.filter(isLetter).length >= 2) {
      emit(rejoin(run), true);
      changed = true;
      i = j;
    } else {
      // empty tokens come from double spaces: a word gap, nothing to print
      if (toks[i] !== '') emit(toks[i], false);
      i++;
    }
  }
  if (!changed) return { t: s, spans: [] };
  const lead = s.startsWith(' ') ? ' ' : '';
  const tail = s.endsWith(' ') ? ' ' : '';
  return { t: lead + out.join(' ') + tail, spans: spans.map(([a, b]) => [a + lead.length, b + lead.length]) };
}

// maps offsets in `a` to offsets in `b`, where `b` is `a` with spaces removed or added (letters unchanged)
export function offsetMapper(a: string, b: string) {
  const at = new Int32Array(a.length).fill(-1);
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === ' ') continue;
    while (j < b.length && b[j] !== a[i]) j++;
    at[i] = j++;
  }
  return {
    start(i: number) {
      for (let k = i; k < a.length; k++) if (at[k] >= 0) return at[k];
      return b.length;
    },
    end(i: number) {
      for (let k = i - 1; k >= 0; k--) if (at[k] >= 0) return at[k] + 1;
      return 0;
    },
  };
}
