export type Script = 'latin' | 'rtl' | 'cj' | 'ko' | 'sea' | 'indic';

const RE_RTL = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const RE_JOINING = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}]/u;
const RE_CJ = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const RE_KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const RE_HAN = /\p{Script=Han}/u;
const RE_KO = /\p{Script=Hangul}/u;
const RE_SEA = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const RE_INDIC =
  /[\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Tibetan}]/u;

// scripts written without spaces between words need a word segmenter
export const RE_NO_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

export function scriptOf(s: string): Script {
  if (RE_RTL.test(s)) return 'rtl';
  if (RE_CJ.test(s)) return 'cj';
  if (RE_KO.test(s)) return 'ko';
  if (RE_SEA.test(s)) return 'sea';
  if (RE_INDIC.test(s)) return 'indic';
  return 'latin';
}

export const isJoiningScript = (s: string) => RE_JOINING.test(s);
export const isKana = (s: string) => RE_KANA.test(s);
export const isHan = (s: string) => RE_HAN.test(s);

export function baseLang(lang: string): string {
  return (lang || 'und').toLowerCase().split(/[-_]/)[0];
}

// abbreviations that end in a period without ending the sentence (lower case, without the final period)
const ABBR: Record<string, Set<string>> = {
  en: new Set(
    'mr mrs ms dr prof sr jr st vs etc e.g i.e cf fig figs no nos vol vols p pp ch chap ed eds approx dept est inc ltd co corp jan feb mar apr jun jul aug sep sept oct nov dec mt ave a.m p.m u.s u.k gen col capt lt sgt rev hon op cit ibid al'.split(' '),
  ),
  de: new Set(
    'z.b d.h u.a usw bzw ca vgl s ggf evtl inkl nr bd hrsg dr prof hr fr str abs art kap jh mio mrd tsd u.ä o.ä u.v.m etc sog bspw zb dh ua ff f anm bzgl ggü i.d.r d.i v.a jan feb märz apr jun jul aug sep sept okt nov dez st'.split(' '),
  ),
  fr: new Set('m mme mlle dr p ex etc cf av apr j.-c env'.split(' ')),
  es: new Set('sr sra srta dr dra etc p ej pág ud uds'.split(' ')),
};

const MONTHS_DE = new Set(
  'januar februar märz april mai juni juli august september oktober november dezember jänner'.split(' '),
);

export function isAbbreviation(core: string, lang: string): boolean {
  const lc = core.toLowerCase();
  // "u.s", "e.g", "z.b": letters joined by periods
  if (/^(\p{L}\.)+\p{L}$/u.test(lc)) return true;
  const set = ABBR[baseLang(lang)] ?? ABBR.en;
  return set.has(lc) || ABBR.en.has(lc);
}

// german "am 3. Mai" or "der 2. Weltkrieg": a number with a period is an ordinal when a month or a lower-case word follows
export function isOrdinal(core: string, next: string | undefined, lang: string): boolean {
  if (!/^\d{1,4}$/.test(core) || !next) return false;
  if (/^\p{Ll}/u.test(next)) return true;
  return baseLang(lang) === 'de' && MONTHS_DE.has(next.toLowerCase().replace(/[^\p{L}]/gu, ''));
}

// function words that are read together with the word after them ("a house", "in der Stadt")
const FUNC: Record<string, Set<string>> = {
  en: new Set(
    'a an the of to in on at by for with from as and or but nor so if is am are was were be been it its i he she we they you me him her us them my his our your their this that these those than then into onto upon over under about after before up out off via per like'.split(' '),
  ),
  de: new Set(
    'der die das den dem des ein eine einen einem einer eines und oder aber auch als wie wenn ob so zu zum zur im in an am ans auf aus bei beim mit nach von vom vor für über unter um bis durch gegen ohne seit es er sie wir ihr ich du man sich mir mich dir dich uns euch ihm ihn ihnen sein seine seinen seinem seiner ihre ihren ihrem ihrer dass daß ist sind war waren hat haben wird werden'.split(' '),
  ),
};

const NEG: Record<string, Set<string>> = {
  en: new Set('not no never none nor nothing nobody nowhere neither cannot'.split(' ')),
  de: new Set('nicht kein keine keinen keinem keiner keines nie niemals nichts niemand nirgends weder'.split(' ')),
};

export function isNegation(core: string, lang: string): boolean {
  const lc = core.toLowerCase();
  if (/n['’]t$/.test(lc)) return true;
  return (NEG[baseLang(lang)] ?? NEG.en).has(lc) || NEG.en.has(lc);
}

export function isFunctionWord(core: string, lang: string, graphemes: number): boolean {
  const lc = core.toLowerCase();
  const set = FUNC[baseLang(lang)];
  if (set) return set.has(lc);
  // languages without a list: short lower-case words are mostly articles and prepositions
  return graphemes <= 3 && core === lc && /^\p{L}+$/u.test(core);
}

// rough language guess for pasted text and plain files, by counting very common words
export function guessLang(sample: string): string {
  const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
  const score: Record<string, number> = { en: 0, de: 0, fr: 0, es: 0 };
  const probes: Record<string, string[]> = {
    en: ['the', 'and', 'of', 'to', 'is', 'that', 'with'],
    de: ['der', 'die', 'und', 'das', 'ist', 'nicht', 'mit', 'ich'],
    fr: ['le', 'la', 'et', 'les', 'des', 'est', 'une'],
    es: ['el', 'la', 'y', 'los', 'que', 'es', 'una'],
  };
  for (const w of words.slice(0, 4000)) for (const l in probes) if (probes[l].includes(w)) score[l]++;
  let best = 'und';
  let max = 4;
  for (const l in score) if (score[l] > max) [best, max] = [l, score[l]];
  if (best === 'und') {
    const s = scriptOf(sample.slice(0, 2000));
    if (s === 'cj') return isKana(sample.slice(0, 2000)) ? 'ja' : 'zh';
    if (s === 'ko') return 'ko';
  }
  return best;
}
