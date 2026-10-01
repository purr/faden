import type { Frame, Section } from './tokenize';

export interface TimingOpts {
  wpm: number;
  // multipliers, 1 = default strength, 0 = off
  pauses: number;
  longWords: number;
  // true: pauses come out of the wpm budget, so the speed shown is the speed delivered
  honest: boolean;
}

// a frame is never shorter than this: ~2.5 refreshes at 60 hz; decoding needs ~40 ms (rubin & turano 1992)
export const MIN_MS = 40;

// extra slots after a sentence, by its length in words (spritz patent us8903174b2)
function sentencePause(n: number): number {
  return n <= 7 ? 1.0 : n <= 22 ? 2.2 : 3.3;
}

// display weight of one frame in "word slots" before rescaling
export function frameUnits(f: Frame, sec: Section, o: TimingOpts): { word: number; pause: number } {
  const w = sec.words[f.w1];
  // grouped function words are mostly skipped by the eye in normal reading (e-z reader skip rates)
  let word = (f.w1 - f.w0) * 0.35;
  if (w.script === 'cj') {
    word += Math.max(0.6, f.g / 1.6);
  } else {
    // longer words need longer: +7% per letter past 6, capped; german compounds hit the cap late
    const lf = f.g <= 6 ? 1 : Math.min(2.6, 1 + 0.07 * (f.g - 6));
    let hw = 1 + (lf - 1) * o.longWords;
    // numbers and acronyms are decoded symbol by symbol (tool convention: stutter, dashreader)
    if (w.num || w.acronym) hw *= 1.3;
    else if (w.name) hw *= 1.06;
    // a missed "not" flips the meaning (convention from readily)
    if (w.neg) hw *= 1.15;
    // an ungrouped common word gets a little less, kept small on purpose (öquist 2003)
    if (f.w0 === f.w1 && w.func) hw *= 0.94;
    if (w.head) hw *= 1.3;
    word += hw;
  }
  let pause = 0;
  if (f.part === f.parts) {
    if (w.sentEnd) {
      const [a, b] = sec.sentences[w.sent];
      pause = sentencePause(b - a + 1);
    } else if (w.clause === 2) pause = 1.1;
    else if (w.clause === 1) pause = 0.8;
    if (w.paraEnd) pause += w.head ? 2.0 : 1.2;
  }
  return { word, pause: pause * o.pauses };
}

// milliseconds per frame. with `honest`, all frames are rescaled so the section takes exactly
// words × 60000 / wpm; frames that would fall under MIN_MS are pinned there and the rest rescaled
export function durations(sec: Section, o: TimingOpts): Float64Array {
  const n = sec.frames.length;
  const units = new Float64Array(n);
  let total = 0;
  let src = 0;
  sec.frames.forEach((f, i) => {
    const u = frameUnits(f, sec, o);
    units[i] = u.word + u.pause;
    total += units[i];
    src += f.src;
  });
  const base = 60000 / o.wpm;
  const d = new Float64Array(n);
  if (!o.honest || total === 0) {
    for (let i = 0; i < n; i++) d[i] = Math.max(MIN_MS, units[i] * base);
    return d;
  }
  const budget = src * base;
  const pinned = new Uint8Array(n);
  let pinnedMs = 0;
  let free = total;
  let scale = budget / total;
  for (let round = 0; round < 8; round++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (!pinned[i] && units[i] * scale < MIN_MS) {
        pinned[i] = 1;
        pinnedMs += MIN_MS;
        free -= units[i];
        changed = true;
      }
    }
    if (!changed || free <= 0) break;
    scale = (budget - pinnedMs) / free;
  }
  // past ~1000 wpm the floor wins: the section then runs slower than asked, never faster
  if (scale <= 0 || free <= 0) scale = 0;
  for (let i = 0; i < n; i++) d[i] = pinned[i] ? MIN_MS : Math.max(MIN_MS, units[i] * scale);
  return d;
}

// time to read `words` source words at `wpm`, the promise the honest mode keeps
export const minutesFor = (words: number, wpm: number) => words / wpm;
