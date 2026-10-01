import { describe, expect, it } from 'vitest';
import { tokenize, type Section } from './tokenize';
import { durations } from './timing';
import { orpRange } from './orp';

const run = (t: string, lang = 'en', group = true) => tokenize([{ t }], { lang, group, splitHyphens: true });
const texts = (s: Section) => s.frames.map((f) => f.text);
const ends = (s: Section) => s.words.filter((w) => w.sentEnd).map((w) => w.text);
const focus = (s: Section, i: number) => s.frames[i].text.slice(s.frames[i].o0, s.frames[i].o1);

describe('grouping', () => {
  it('reads an article with its noun', () => {
    expect(texts(run('He saw a house in the city.'))).toEqual(['He saw', 'a house', 'in the city.']);
  });
  it('keeps negations and punctuated words alone', () => {
    expect(texts(run('Do not go, and the end.'))).toEqual(['Do', 'not', 'go,', 'and the end.']);
  });
  it('groups german function words', () => {
    expect(texts(run('Die Katze sitzt auf dem Dach.', 'de'))).toEqual(['Die Katze', 'sitzt', 'auf dem Dach.']);
  });
  it('can be switched off', () => {
    expect(texts(run('a house', 'en', false))).toEqual(['a', 'house']);
  });
  it('puts the focus letter on the content word', () => {
    expect(focus(run('a house'), 0)).toBe('o');
  });
});

describe('sentence ends', () => {
  it('skips abbreviations and initials', () => {
    expect(ends(run('Dr. Smith met J. Doe at 5 p.m. today. Then he left.'))).toEqual(['today.', 'left.']);
  });
  it('skips german ordinals and abbreviations', () => {
    expect(ends(run('Am 3. Mai kam er, z.B. mit Hut. Dann ging er.', 'de'))).toEqual(['Hut.', 'er.']);
  });
  it('does not end at a period followed by lower case', () => {
    expect(ends(run('Apples, pears etc. and more.'))).toEqual(['more.']);
  });
  it('keeps decimals whole', () => {
    expect(texts(run('Pi is 3.14 exactly.', 'en', false))).toEqual(['Pi', 'is', '3.14', 'exactly.']);
  });
});

describe('punctuation', () => {
  it('attaches quotes to their word and marks the comma', () => {
    const s = run('“Hello,” she said.', 'en', false);
    expect(texts(s)).toEqual(['“Hello,”', 'she', 'said.']);
    expect(s.words[0].clause).toBe(1);
    expect(focus(s, 0)).toBe('e');
  });
  it('keeps a spaced dash with the word before', () => {
    const s = run('wait — then go', 'en', false);
    expect(texts(s)).toEqual(['wait —', 'then', 'go']);
    expect(s.words[0].clause).toBe(2);
  });
  it('splits an unspaced dash between words', () => {
    expect(texts(run('house—then', 'en', false))).toEqual(['house—', 'then']);
  });
});

describe('long words', () => {
  it('keeps the focus a quarter into long german compounds', () => {
    const w = 'Donaudampfschifffahrtsgesellschaft';
    const [a] = orpRange(w, 'latin', 'de');
    expect(a).toBe(Math.floor((w.length + 2) / 4));
  });
  it('splits only at written hyphens', () => {
    expect(texts(run('Nord-Süd-Verbindungsstraße', 'de'))).toEqual(['Nord-Süd-', 'Verbindungsstraße']);
    expect(texts(run('Donaudampfschifffahrtsgesellschaft', 'de'))).toEqual(['Donaudampfschifffahrtsgesellschaft']);
  });
});

describe('scripts', () => {
  it('never cuts an emoji or a conjunct', () => {
    expect(focus(run('👨\u{200d}👩\u{200d}👧\u{200d}👦'), 0)).toBe('👨\u{200d}👩\u{200d}👧\u{200d}👦');
    expect(focus(run('हिन्दी'), 0)).toBe('हि');
  });
  it('chunks chinese into short words', () => {
    const s = run('我们今天去北京大学。', 'zh');
    expect(s.frames.every((f) => [...f.text.replace(/。/, '')].length <= 4)).toBe(true);
    expect(s.frames.map((f) => f.text).join('')).toBe('我们今天去北京大学。');
  });
});

describe('timing', () => {
  it('delivers exactly the chosen speed', () => {
    const s = run('One two three, four five. Six seven eight nine ten eleven twelve. End.');
    const d = durations(s, { wpm: 300, pauses: 1, longWords: 1, honest: true });
    const total = d.reduce((a, b) => a + b, 0);
    const words = s.frames.reduce((n, f) => n + f.src, 0);
    expect(total).toBeCloseTo((words * 60000) / 300, 6);
  });
  it('gives sentence ends and long words more time', () => {
    const s = run('Kurz Donaudampfschifffahrtsgesellschaft kurz kurz.', 'de', false);
    const d = durations(s, { wpm: 300, pauses: 1, longWords: 1, honest: true });
    expect(d[1]).toBeGreaterThan(d[0] * 1.8);
    expect(d[3]).toBeGreaterThan(d[2] * 1.8);
  });
});
