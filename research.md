# rsvp research — 2026-10-01

what this is: everything learned about rsvp (one-word-at-a-time) readers before building one. it combines a code read of the 7 example sites, a catalogue of ~90 other readers, and the reading-science, colour/font, language and timing/ux literature.

source flags: `[ft]` full text read · `[abs]` abstract only · `[code]` source code read · `[sec]` known only through a secondary source · `[snip]` search snippet only.

---

## tl;dr

- **speed claims are false.** rsvp does not give 2–3× speed at equal comprehension. comprehension matches normal reading up to about 300–350 wpm and drops above that (di nocera 2018 `[abs]`, kosch 2020 `[ft]`, rayner et al. 2016 `[ft]`). build for comfort, control and honesty.
- **the "middle letter" (orp) is spritz's patented table.** count letters only: 1 → 1st letter, 2–5 → 2nd, 6–9 → 3rd, 10–13 → 4th, 14+ → 5th (US8903174B2). it agrees with where eyes land in words. the only controlled rsvp test found no benefit over plain centring (kosch 2020). keep it as a harmless convention; don't sell it as a comprehension gain.
- **what protects comprehension:**
  - pauses at sentence and clause ends (masson 1983, castelhano & muter 2001)
  - one-tap going back (schotter et al. 2014)
  - more time for long and rare words (e-z reader data, spritz patent)
- **the speed slider overstates on most readers.** at a set 300 wpm the 7 example sites deliver 228–300 wpm. only snowfluke rescales so set = delivered.
- **colour:**
  - no study shows red is the best orp colour, and pure red loses contrast for red-weak colour-blind users.
  - light mode reads slightly faster (palmén 2023, n=459), but people prefer dark.
- **font:**
  - monospace makes alignment exact and costs nothing in rsvp. proportional fonts only win by saving eye movements, which rsvp removes (arditi et al. 1990).
  - dyslexia fonts: no effect (meta-analysis g = −0.04).
- **languages:**
  - chinese needs word units, japanese bunsetsu (phrase) chunks, hebrew/arabic a mirrored pivot.
  - always count the orp in grapheme clusters (what the reader sees as one character), never in utf-16 code units (`string.length`, which splits emoji and some letters).
- **patent:** google patents lists US8903174B2 as "active, expires 2033-07-09" (google's estimate, not a legal ruling). the claims were not read. check them before shipping a commercial copy of the exact orp table + fixed position + timing scheme.

---

## 1. the seven example sites

all seven split the current word into three parts: text before the focal letter, the coloured focal letter, and text after it. the focal letter stays at one screen position.

### 1.1 which letter gets highlighted

1-based letter position by word length:

| length | n0name = thomaskolmans | readrrr | rush | snowfluke | readanythingfast | mindfasting |
|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 2 | 1 | 2 | 1 | 2 | 1 | 1 |
| 3 | 1 | 2 | 1 | 2 | 2 | 2 |
| 4 | 2 | 2 | 2 | 3 | 2 | 2 |
| 5 | 2 | 2 | 2 | 3 | 3 | 3 |
| 6 | 3 | 3 | 3 | 4 | 3 | 3 |
| 7–8 | 3 | 3 | 3 | 4 | 4 | 4 |
| 9 | 3 | 3 | 3 | 4 | 5 | 5 |
| 10 | 4 | 4 | 4 | 5 | 5 | 5 |
| 11–12 | 4 | 4 | 4 | 5 | 6 | 6 |
| 13 | 5 | 4 | 4 | 5 | 7 | 7 |
| 17 | 6 | 5 | 5 | 5 | 9 | 9 |
| 20 | 6 | 5 | 5 | 5 | 10 | 10 |
| what is counted | letters only (`\p{L}`), skips leading quotes | every character, punctuation too | ascii `[a-zA-Z0-9]` only | every character | every character (after its odd tokenizer) | every character |

### 1.2 per site

**rsvp.n0name.eu** — a deployment of [thomaskolmans/rsvp-reading](https://github.com/thomaskolmans/rsvp-reading) (svelte, mit, 412★, last push 2026-01-18). the bundle matches `src/lib/rsvp-utils.js` line for line `[code]`.
- **orp:** `getORPIndex` — letters ≤3 → 0, 4–5 → 1, 6–9 → 2, 10–12 → 3, then `floor(log2(len-1))+1`. `getActualORPIndex` maps the letter count back to a string index, skipping non-letters.
- **timing:** `60000/wpm`.
  - `.!?;:` × multiplier (default 2); `,` × 1.5.
  - "lower wpm for longer words": default 5% per character, applied only from 12 characters up. it counts punctuation, even though the hint says "each letter".
- **settings:**
  - 50–1000 wpm, step 25, default 300; presets 200/300/400/500.
  - 1/3/5/7 words shown at once; 150 ms word fade.
  - pause every n words (off; 500 ms when on).
  - hebrew/arabic detection regex.
- **layout:** focal letter `position:absolute; left:50%`; before/after offset by `0.5ch`. exact only because the font is monospace (sf mono, monaco …). red `#f44` with glow; red gradient tick marks top and bottom.
- **i/o:** pdf (pdf.js; worker loaded from unpkg) and epub (epub.js); session in localstorage.
- **keys:** space, esc, ↑↓ ±25 wpm, ←→ step, g jump, ctrl+s save.
- **bug:** `word[orpIndex]` indexes utf-16 code units, so an emoji or astral letter is cut in half.

**readrrr.app** — a single html file with an inline script; also an ios app ("readrrr focus reader", id6757683148) `[code]`. the narration is app-only; the web version has no text-to-speech.
- **orp:** the spritz table on the raw length, punctuation included: ≤1 → 0, ≤5 → 1, ≤9 → 2, ≤13 → 3, else 4.
- **position:** focal letter at **35% of the stage width** (`STAGE_FOCAL_RATIO = 0.35`), not 50%. this leaves room for the longer tail after the pivot.
  - the font is proportional (bold times new roman), so it measures the real letter with `getBoundingClientRect` each word and shifts by the difference.
  - long words are scaled down. if a word would need less than 60% scale, it is centred and shrunk instead.
- **timing:**
  - length multiplier on the stripped word: ≤2 → 0.7, ≤5 → 1.0, ≤8 → 1.3, ≤12 → 1.6, else 2.0.
  - any trailing `.!?,;:` × 2.0, so a comma counts the same as a full stop.
  - floor 30 ms.
  - never rescaled, so the delivered speed is lower than the slider (1.4). the "time left" uses the same formula, so that number is honest.
- **other:**
  - 3-second countdown before start.
  - 100–1000 wpm, step 10, default 250; ↑↓ ±50.
  - colours: `#070707` background, `#FFFFFF` text, `#FF0000` focal.
  - import: `.txt .md .html .pdf`; text capped at 2,000,000 characters.

**rush.silicorb.com** — svelte + pdf.js; the most features of the seven `[code]`.
- **orp:** spritz table, but counting only `[a-zA-Z0-9]`. **bug:** cyrillic, greek and other non-latin words always highlight the first letter.
- **timing:** sentence end × 2, comma × 1.5, word longer than 8 characters × 1.2 (an else-if chain, so these never stack).
  - headings are shown whole for `max(1.5 × base × words, 1500 ms)` + 50 ms per character over 20.
- **pdf structure:**
  - detects headings and figure/table references; auto-pauses on tables; page previews.
  - "rewind to sentence start" key.
- **ai, through your own openrouter key** (`meta-llama/llama-3.3-70b-instruct:free`):
  - explain this figure
  - recap of recent pages when resuming (prompt asks for a detailed, order-preserving recap)
  - summary
- **security note:** the api key is aes-gcm encrypted in localstorage, but the encryption key sits in the same localstorage. this hides the key from casual view; it does not protect it.
- **display and settings:**
  - lexend 500, focal bold `#e07a5f` on `#e8eaed`.
  - css grid `1fr auto 1fr`, which centres the focal column exactly in any font.
  - font size 24–96 (default 48); 100–1000 wpm (default 300).
- **"focus report":** session time, words read, longest and average session.

**snowfluke.github.io/rsvp-speed-reader** — [snowfluke/rsvp-speed-reader](https://github.com/snowfluke/rsvp-speed-reader) (react/typescript, mit, 19★) `[code]`.
- **orp:** raw length ≤1 → 0, ≤3 → 1, ≤5 → 2, ≤9 → 3, else 4. this is the latest pivot of all seven: "that" highlights the `a`.
- **timing — the best of the seven:**
  - length multiplier `1 + (letters+digits − 5) × 0.08`, clamped to [0.7, 1.5].
  - `.!?` × 2, `,;:` × 1.5.
  - it then divides by the text's mean multiplier, so the average delivered speed equals the slider exactly (`calculateVariabilityNormalizer`).
- **settings:**
  - gradual increase: linear from `initialWpm` 300 to `targetWpm` 600 across the whole text; slider step 50.
  - font mono/sans/serif (jetbrains mono per readme); weight normal/bold.
  - "side opacity": non-focal letters dimmed to 0.8.
  - background music, video export, and `#text=` deep links to preload text.
- **layout:** the focal letter sits in a `1ch`-wide box between two `flex-1` halves.

**readanythingfast.com** — react, accounts via clerk `[code]`.
- **orp:** the exact middle: odd length → `floor(n/2)`, even length → `n/2 − 1`.
- **timing:** a plain `setInterval(60000/wpm)` — no pauses, no length scaling.
- **tokenizer bug:** `.split(/(\s+|[.,!?;:()\[\]{}"'`-])/)` keeps every punctuation mark as its own flash:
  - `Don't` → `Don` / `'` / `t`
  - `e.g.` → 4 flashes
  - `3.14` → 3 flashes
  - `well-known` → 3 flashes

  so punctuation does get a pause, but as a full blank word slot.
- **other:**
  - import `.txt .pdf .docx` (docx via jszip, reading `word/document.xml`).
  - full-text view, 250 words per page.
  - 100–1000 wpm, step 10, default 300.
  - signed-in sync and wpm history.
- **display:** monospace light, focal `text-red-500` semibold.

**mindfasting.com/online-rsvp-reader** — a wordpress plugin, `mindfasting-rsvp-reader/assets/js/rsvp-reader.js` `[code]`.
- **orp:** `floor((len-1)/2)` on the raw string, punctuation included.
- **timing:**
  - `60000/wpm`, plus a flat +140 ms after `. : ; — –`. note: not after `?`, `!` or `,`.
  - × 1.1 for words of 9+ characters; floor 45 ms.
- **settings:** 100–1200 wpm, default 350; 2,500-character cap; fullscreen button.
- **layout:** proportional font. the focal letter is centred and the before/after spans are positioned against its measured width plus a 0.04 em gap. separating the spans breaks kerning between the pieces. focal `#cc0000`.

### 1.3 speed set vs speed delivered

each site's own timing rules (copied from its bundle), run on two texts at a set speed. texts: pride and prejudice, 40,000 words; rayner et al. 2016, 25k words. the rayner text was pdf-extracted, so its sentence ends are approximate.

| site | set 300 → pride & prejudice | set 300 → rayner 2016 | set 600 → pride & prejudice |
|---|---|---|---|
| snowfluke | 300 (100%) | 300 (100%) | 600 (100%) |
| mindfasting | 283 (94%) | 280 (93%) | 540 (90%) — its +140 ms is fixed, so the gap grows with speed |
| n0name / thomaskolmans | 273 (91%) | 266 (89%) | 546 (91%) |
| rush | 273 (91%) | 264 (88%) | 547 (91%) |
| readanythingfast | 251 (84%) | 234 (78%) | 502 (84%) |
| readrrr | 240 (80%) | 228 (76%) | 479 (80%) |

the same gap shows across the wider field (same method, applied to each reader’s rules). at a set 300 wpm:

| reader | delivered wpm |
|---|---|
| glance | 158 / 137 |
| openspritz | 197 / 177 |
| squirt | 231 / 225 |
| sprint reader (basic) | 234 / 230 |
| pasky speedread | 248 / 239 |
| spritz patent | 270 / 264 |
| readest | 278 / 272 |

benedetto et al. 2015 measured real spritz set to 250 wpm running at about 225 wpm `[ft]`.

---

## 2. the wider field (~90 readers)

for about 70 of these the source or the shipped bundle was read.

### 2.1 focal-letter formula families (0-based index, l = length)

1. **spritz patent table** — 1 → 0, 2–5 → 1, 6–9 → 2, 10–13 → 3, 14+ → 4.
   - source: US8903174B2, table 1 and fig. 7. it counts letters only.
   - closed form `floor((l+2)/4)`, exact up to l = 17.
   - openspritz adopted it on 2014-03-13 (commit `79eb8d9`, "use spritz official weightings").
   - used by: spritz, openspritz/glance, pasky speedread, speed_read (ruby), spray.el, jetzt, reedy, dashreader, fasterthansight "magic", rsvp-bookmarklet, fast, zotero-rsvp, claude-speed-reader, agent-rsvp, rsvp.nvim (kivanceski), readkinetic, punctum, seshat, readrrr.
2. **short words pushed left** — ≤2 → 0, then the spritz table: tspreed, cadence, lesefluss, speed-read-black, kairo. rush and thomaskolmans use ≤3 → 0.
3. **other band variants:**
   - rsvp-timing/velo: ≤3 → 0, 4–5 → 1, 6–9 → 2, 10–11 → 3, 12–14 → 4, 15–17 → 5, 18+ → 6.
   - focalread: ≤3 → 0, 4–5 → 1, 6–8 → 2, 9–12 → 3, 13+ → 4.
   - quickreader: ≤2 → 0, 3–6 → 1, 7–9 → 2, 10+ → 3.
   - rsvp-term: 0–3 → 0, 4–6 → 1, 7–9 → 2, 10+ → 3.
   - ledor: its own table, then `floor(0.35·n)`.
4. **capped at the 4th letter** — speeedy, obsidian-speed-reading.
5. **off by one from spritz** — sprint reader, stutter, splashreader, snowfluke.
6. **near middle** — squirt `floor(l/2)-1` for l ≥ 4; glancereader (≥7 → fixed 4th letter); koreader rsvp `ceil(l/2)-1` capped at 4; null.
7. **exact middle** — readanythingfast, mindfasting, cfastread, readstr, flash-read, react.spritz, letoreader.
8. **proportional:**
   - sprits-it `round((l+1)×0.4)-1`
   - spritz-cmd `ceil(0.35·l)` (1-based, cap 5)
   - skilldrills `floor((l-1)/3)`
   - spritz's pixel method: offset = 0.265 × word width + 0.5 × average character width
   - spedread: the grapheme nearest 0.5 em from the word start
9. **letter-scored:**
   - jsreader: vowel value × position curve.
   - readily: letter priority ÷ distance to the middle, doubled letters × 4.
   - zethos: nearest vowel left of the middle.
   - kairo: shifts ±1 by word frequency.
10. **fixed word start** — vim-rsvp keeps the word's first letter fixed (focus column 5).
11. **no focal letter** — spreeder, accelareader, librera, uniread. 瞬間速読 drops it deliberately for japanese: the eye goes to kanji anyway.
12. **selectable** — fasterthansight lets the user pick magic / middle / quarter / sqrt / cbrt / log2. useful for a/b testing.

### 2.2 timing families

- **fixed interval:**
  - openspritz (but repeats tricky words 3× and inserts 3 blank slots after sentences)
  - zotero-rsvp, koreader, spedread, readanythingfast
- **multiplicative factors** — most tools. typical values: sentence end 2–3×, comma 1.5–2×, long word 1.2–1.5×.
- **additive:**
  - pasky: `(0.9 + 0.04√l) × 60/wpm`; × 2 after `,:;`; × 3 after `.?!`
  - rsvp-term: ms scaled by 300/wpm
  - librera: + l²/2 ms
- **information-based:**
  - sprint reader: `-log2 p(word)` from subtlex-us, mapped linearly from 4.5 bits → 40 ms to 25.6 bits → 300 ms. it ignores wpm.
  - kairo: letter-surprisal plus syllables.
- **rescaled so the slider is true:**
  - spritz patent: `dut = ut/awdr`, but sentence blanks sit outside the budget
  - spritz sdk: `floor(6e4/(wpm×1.21))`
  - sprint reader word-length mode, spreeder/accelareader `speedVar`, readkinetic, snowfluke
- **ramps:**
  - reedy: starts at 0.5× target, or 0.6× on resume, sine-shaped.
  - stutter: first words ×4, ×3, ×2, ×1. rsvp-bookmarklet: first 5 words × (5 − i).
  - speedread-skill: from 0.3× with ease-out over 25 words. lesefluss: 2.0× falling 0.1 per word.
  - speeedy: linear over 30 words.
  - kairo: ramp up and down, with the resume ramp scaled by how long you paused.
  - throughline: warm-up and cool-down.

### 2.3 ideas worth copying

1. **rescale weights so set wpm = delivered wpm** (spritz patent; readkinetic; snowfluke). readkinetic even measures delivered wpm against the clock.
2. **sentence pause grows with sentence length:** blank of 1.0 / 2.2 (more than 7 words) / 3.3 (more than 22 words) (spritz patent).
3. **word-frequency timing** (sprint reader; ericsson patent WO2002037256A2). kairo does it without a dictionary.
4. **smaller punctuation pauses on short words; stacked pauses take the max instead of multiplying** (rsvp-timing `shortWordScale`).
5. **keep enclosing quotes and brackets visible around the current word** (jetzt "wraps"), so you never lose track of being inside a quote.
6. **when paused, show the rest of the current sentence in low contrast** (reedy).
7. **resume ramp scaled by pause length; ramp down at the end** (kairo, throughline).
8. **brief blank between two identical consecutive words** (uniread: 15% of the slot, max 60 ms). this fixes repetition blindness ("going, going, gone"), which spray.el lists as a known bug.
9. **extra time on negations:** "not"/"не" × 1.8 (readily). one reader's idea; no study behind it.
10. **japanese bunsetsu chunking** (openspritz-ja with `Intl.Segmenter`; 瞬間速読 with mecab; 集中読書).
11. **chunk pause:** every ~300 words, snapped back to the nearest sentence end, wait for a tap (cadence). gives a natural blink/break point.
12. **markdown/structure-aware pacing:** headings, bold, code and list items get their own factors; code blocks and tables stop playback (speedread-skill, dashreader).
13. **drift-free scheduling against an absolute next-due time** (dashreader `nextDueMs`, pasky `next_word_time`).
14. **entity parsing:** keep urls, phone numbers, initials, `что-то` and `30-е` as one token (reedy).
15. **ai recap on resume and figure explanation** (rush).

### 2.4 catalogue

**commercial / closed**

| name | link | orp | timing | notes |
|---|---|---|---|---|
| spritz | spritz.com; patent US8903174B2 | patent table; pixel method ratio 0.265 | ×1.3 if more than 7 letters, ×1.6 if more than 13; sentence blank 1.0/2.2/3.3; rescaled; ramp | sdk js still served; api host unreachable |
| swiftread (ex-spreed) | swiftread.com | not found in bundle; bracket focus mark | default 350 wpm; pause levels none/short/medium/long/extra-long | tts, pdf/epub/kindle/libby import |
| spreeder (free) | spreeder.com/app.php | none, chunk centred | optional chunk-length variation; ×1.3 on chunks with `.?!` | chunk size, stop-word skipping |
| accelareader | accelareader.com | none | as spreeder; default 300 | each cjk character = one word |
| kindle word runner | — | unknown | "dynamic pacing" | removed from kindle (per punctum blog, 2026-09-04) |
| instapaper speed reading | instapaper.com | unreadable (js-only page) | — | 10 free articles/month |
| reedy android | play: azagroup.reedy | "closer to beginning" | "smart slowing"; up to 3000 wpm | fb2/epub, tts; chrome version is open source |
| velo | veloreader.com | rsvp-timing table | rsvp-timing | — |
| focalread | focalread.com | ≤3 → 0, ≤5 → 1, ≤8 → 2, ≤12 → 3, else 4 | — | — |
| cadence | readwithcadence.com | ≤2 → 0, then spritz | chunk pause after 300 words | bionic mode |
| flash-read | flash-read.com | `floor(l/2)` | fixed | — |
| null. | appnull.com | right of middle for long words | — | marketed for adhd |
| readkinetic | readkinetic.com | spritz on core letters + leading punctuation | weights 3/2/1, rescaled | measures delivered wpm |
| punctum | punctumreader.com | spritz + first-letter offset | fixed (demo) | starts at 300, warns above 400; rtl |
| throughline | ios app store | not public | warm-up and cool-down | ai summary, apple watch |
| 瞬間速読 (jp) | qiita youwht | deliberately none | mecab bunsetsu chunks | 250k downloads (2018) |
| 集中読書 (jp) | sokudoku.net | — | particles merged, punctuation waits | vertical text, aozora bunko |
| skilldrills (jp) | skilldrills.online | `floor((l-1)/3)` | — | — |
| outread, readquick, acceleread, spurtz | — | not inspected | — | — |

**open source**

| name | repo | orp | timing | notes |
|---|---|---|---|---|
| openspritz / glance | Miserlou/Glance-Bookmarklet (mit, 1566★) | spritz table, raw length | fixed; triples tricky words; 3 blanks after sentences | dormant 2017 |
| speedread | pasky/speedread (mit, 1259★) | spritz table | `(0.9+0.04√l)·60/wpm`; ×2 after `,:;`, ×3 after `.?!` | true-wpm stats, context on pause |
| squirt | cameron/squirt (apache-2.0, 1225★) | `floor(l/2)-1` | `.!?` 3, `,;:` 2, paragraph 3.5, l<4 1.2, l>11 1.5 | — |
| jetzt | ds300/jetzt (apache-2.0, 502★) | spritz table, trailing punctuation stripped | length 1.2–2.0; sentence end 2.2; paragraph end 2.8; max wins | quote "wraps", long-word split |
| glancereader | OnlyInAmerica/GlanceReader (518★) | fixed 4th letter for ≥7 | ×3 if l≥6 or punctuation | android |
| thomaskolmans rsvp-reading | thomaskolmans/rsvp-reading (mit, 412★) | see §1 | see §1 | = rsvp.n0name.eu |
| letoreader | Axym-Labs/LetoReader (gpl-3.0, 314★) | middle-left | fixed | dimmed peripheral words |
| uniread | nemanjan00/uniread (mit, 275★) | caret, centred | ×2 on punctuation; optional blank flash | epub/pdf/fb2 |
| sprint reader | anthonynosek/sprint-reader-chrome (267★) | off-by-one table; canvas-measured; rtl | basic / length-rescaled / word-frequency; +250/450/700 ms | hyphenation |
| zethos | Zolmeister/zethos (mit, 247★) | nearest vowel left of middle | +25% if l>6; comma +50%; `.?!` +150% | — |
| spritzertextview | andrewgiang (215★) | as glancereader | ×3 rule | android library |
| reedy for chrome | olegcherr/Reedy-for-Chrome (gpl-2.0, 190★) | spritz table + punctuation nudge | complexity-based; sine ramp from 0.5× | entity parser, sentence preview |
| shirah-reader | Hallicopter (188★) | `min(4, round(l/2))` | syllable-based | epub tui |
| stutter | jamestomasino/stutter (gpl-3.0, 182★) | off-by-one table | sentence 2.5, punctuation 1.5, short 1.3, long 1.4, numbers 1.8; slow start | — |
| tspreed | n-ivkovic/tspreed (gpl-3.0, 105★) | ≤2 → 0, then spritz | × l/5 option | posix sh |
| fasterthansight | VioletGiraffe (mit, 91★) | 6 selectable methods | `pow(1.13, l-6)` for l>6, pause table | qt |
| spedread | Darazaki/Spedread (gpl-3.0, 90★) | 0.5 em from the start, pixel-based | fixed | gtk |
| cfastread | radiofreejohn (82★) | `strlen/2` | ×2 on punctuation | c |
| sprits-it | the-happy-hippo (mit, 77★) | `round((l+1)·0.4)-1`, rtl-inverted | blank token after `.!?` | hebrew/arabic |
| older forks and ports | spray (jeffp123, buggy pivot), speed-readerff, spray.el, speed_read, spritz-cmd, readgood, react.spritz, react-speed-reader, rsvp-bookmarklet, OpenQpritz | see §2.1 | — | mostly dormant 2014–2019 |
| speeedy | sami-29/speeedy (mit, 60★) | capped table ±1; pivot 10–20% left of centre | smart speed: common words faster, long slower; ramp 30 words | pdf/epub/docx pwa |
| koreader rsvp | karpushchenko (mit, 42★) | `ceil(l/2)-1` cap 4 | fixed | e-ink |
| jsreader, readily, kairo | royha / syniuhin / Steadyx | letter-scored | see §2.2 | — |
| dashreader | inattendu/dashreader (mit) | reedy's rule | heading/bullet/callout factors; drift-free | obsidian |
| ledor, lesefluss, quickreader, rsvp-term, rapid-reader, seshat, speedreadnotch, agent-rsvp, claude-speed-reader, speedread-skill, zotero-rsvp, rsvp.nvim ×2, vim-rsvp, splashreader, librera reader (4860★), rsvp-timing, openspritz-ja | various | see §2.1 | see §2.2 | 2024–2026 crop, mostly alive |

found but not analysed: lumingyin/speedreader, vanniktech/speedreader, gnomersvp, warp-reader-android, primusread, fb-ospritz, afspritz, kpritz, and about 20 more small repos and apps.

---

## 3. reading science

### 3.1 speed vs comprehension

- **rayner, schotter, masson, potter & treiman 2016**, "so much to read, so little time", psychological science in the public interest 17(1) `[ft]`.
  - there is a speed–accuracy trade-off. going from about 250 to 500–750 wpm without losing comprehension is "unlikely".
  - language skill, not eye movement, limits reading speed. saccades (eye jumps) are about 10% of reading time, not the 80% spritz claimed.
  - rsvp removes parafoveal preview (seeing the next word before you look at it) and regressions (looking back).
  - centring at the optimal viewing position "may be an improvement" over left-justified rsvp.
- **benedetto et al. 2015**, spritz vs page, n=60 french readers, *1984* chapter 1 `[ft]`.

  | measure | spritz | page |
  |---|---|---|
  | literal comprehension | 60% | 72% (ηp² = .12) |
  | inferential comprehension | 44% | 48% (not significant) |
  | blinks per minute | 4.67 | 8.5 |
  | workload (rtlx) | 59 | 46 |

  subjective fatigue did not differ. spritz set to 250 wpm ran at about 225.
- **acklin & papesh 2017**, american journal of psychology 130(2) `[abs]`: static text beat rsvp at both 700 and 1000 wpm.
- **di nocera, ricciardi & juola 2018**, n=209 `[abs]`: no comprehension loss at 250/300/350 wpm; significantly lower at 400 and 450.
- **boo & conklin 2015**, 15 native + 15 l2 readers `[ft]`. native readers, own pace / 500 / 1000 wpm: 81% / 57% / 51%.
- **kosch et al. chi 2020**, 200/350/500 wpm, n=18 `[ft]`. speed hurt comprehension (p = .04) and raised workload (p < .001). participants' own baseline was 293 wpm.
- **schotter, tran & rayner 2014** `[ft-part]`: blocking look-backs cut comprehension. 84% normal with a regression, 78% without, 71% when the look-back was blocked.
- **masson 1983** `[ft-part]`: rsvp without inter-sentence pauses did worse than skimming the same text for the same time. short pauses between sentences restored performance. potter's studies used a sentence pause of two word durations.
- **castelhano & muter 2001** `[ft]`: normal page and sentence-by-sentence formats still beat rsvp. punctuation pauses were the one rsvp change users liked.
- **context matters:**
  - smartwatch (gannon 2016, n=20) `[ft-part]`: no comprehension difference, higher workload; 18/20 preferred normal text.
  - smart glasses (rzayev 2018) `[ft-part]`: rsvp better sitting, line-by-line better walking. centre and bottom-centre positions beat top-right.
  - öquist & goldstein 2003 `[snip]`: short texts +33% speed with no cost; long texts no gain.
- **special populations:**
  - adhd (moussaoui 2025) `[abs]`: rsvp gave the best comprehension for the adhd group. one study.
  - central vision loss (akthar 2021) `[abs]`: rsvp worst, scrolling best.
  - low vision without central loss: rsvp 1.5–2.1× faster (rubin & turano 1994) `[abs]`.
- **speed ceilings:**
  - decoding alone reaches about 1,171 wpm read aloud (rubin & turano 1992 `[abs]`); minimum word duration about 69 ms.
  - masking by neighbouring words costs about 200 wpm (primativo 2016 `[ft]`: 604 → 420 wpm).

### 3.2 where the eye should land (the orp question)

- **where eyes land:** first fixations land between the word start and its middle (rayner 1979; mcconkie et al. 1988 `[abs]`).
- **where recognition is fastest (optimal viewing position):** slightly left of centre. each letter away from it costs about 20 ms in isolated words (o'regan 1984). in running text the cost is "greatly attenuated or absent" (rayner 1998 `[ft]`).
- **long words:** the optimum moves further left, and readers refixate toward the end (brysbaert & nazir 2005 `[sec]`).
- **in rsvp:** kosch 2020 tested centred vs orp-aligned vs orp + red letter. no effect on comprehension (p = .44), workload (p = .26) or eeg (p = .13) `[ft]`.
- **verdict:** the spritz table (about 20–33% into the word) fits the eye-movement data. its benefit in rsvp is unproven and small at best. keep it because it is cheap. skip the marketing claims ("you can't read a word until you find its orp").
- **other scripts:** see §7.

### 3.3 timing the evidence supports

- **word frequency:** e-z reader data (reichle et al. 1998 `[ft]`):

  | frequency per million words | gaze duration |
  |---|---|
  | 1–10 | 293 ms |
  | 11–100 | 272 ms |
  | 101–1,000 | 256 ms |
  | 1,001–10,000 | 234 ms |
  | 10,001+ | 214 ms |

  so about 80 ms separates the rarest from the commonest words. e-z reader 10's parameters give about 10.8 ms per tenfold frequency step, about 4% of a 250 ms fixation `[sec]`.
- **wrap-up:** readers look longer at sentence- and clause-final words. the order is period > comma > none, and it is independent of text difficulty (warren, white & reichle 2009 `[sec]`). so make punctuation pauses keyed to the punctuation, not scaled by difficulty.
- **pauses protect comprehension:** masson 1983; busler & lazarte 2017 (clause and sentence pauses improved recall) `[abs]`. most studies used 200–500 ms blanks between sentences (castelhano & muter 2001 `[ft]`).
- **short common words:** castelhano & muter halved them (115 ms); users rated it neutral. öquist's frequency mode got complaints that "the variations were too large". mcian's patent says short words need "nearly the same" time or they are missed. → keep the frequency range small.
- **repeated words:** above about 5 words/s (300 wpm) a repeated word is often not seen at all (kanwisher 1987 `[ft]`).
  - detection was 8% at 117 ms/word and 72% at 250 ms/word.
  - a change of letter case does not prevent it.
  - fix: give a repeated word a brief blank before it, or extra time.
- **attentional blink:** for about 180–450 ms after an attention-grabbing word, the next items are easily missed (raymond et al. 1992 `[abs]`). a blank after the target removes it.
- **training:** practice "helps slowly". one speed course went from 280 to 400 wpm, but comprehension fell from 81% to 74% (calef 1999 via rayner 2016). rsvp training raises rsvp speed but did not transfer to page reading (chung 2021 `[abs]`).

---

## 4. colour

- **why red?** spritz's patent gives no reason; it just says "a colored font, such as a red font" `[ft]`. no study compares orp colours.
- **colour vs brightness cue** (ducrot et al. 2025, jemr, n=25 adults + 24 children `[ft]`):
  - a brighter letter sped recognition (1021 ms vs 1143 neutral). a coloured letter did not differ significantly from neutral (1095 ms).
  - 97% never noticed the brightness cue; everyone noticed the colour.
  - the authors suggest colour may break the perception of the word as a whole. pinna & deiana 2018 `[ft-part]` agree: colouring parts of a word slowed reading, colouring whole words did not.
- **colour blindness** (computed with machado 2009 simulation + wcag contrast):
  - `#FF0000` on black: 5.3:1 normal → 3.3:1 for protans, below the 4.5:1 text minimum.
  - `#FF0000` on white: 4.0:1 → 3.2:1 for deutans.
  - robust picks:
    - light theme `#B8460B`: ≥ 4.5:1 in every simulation.
    - dark theme `#FFB000`: ≥ 9.0:1 in every simulation.
  - also mark the orp with something that isn't colour (reticle ticks), per wcag 1.4.1.
- **light vs dark (polarity):**
  - dark on light reads slightly better (buchner & baumgartner 2007; piepenbrock 2013/2014 `[abs]`).
  - the cause is overall screen brightness (smaller pupil, sharper image), not polarity itself (buchner et al. 2009 `[abs]`). the advantage grows as text gets smaller.
  - palmén et al. chi 2023, n=459: light mode "read reliably faster", yet readers did not prefer it `[ft-part]`.
  - fatigue studies: no difference (sengsoon 2025 `[abs]`).
  - at large rsvp-like sizes, polarity barely matters (legge 1985, 1987 `[abs]`).
- **dark-mode details:** use `#121212`, not pure black (material design `[snip]`). on oled screens, pixels switching on from fully off react slowly ("black smear"), and every word swap switches pixels on `[snip]`. red text causes the most fatigue in dark mode, yellow the least (fan 2024 `[abs]`).
- **contrast:**
  - reading speed peaks around 350 wpm for letters 0.25–2°. a 10× contrast drop costs less than half that speed at 1° (legge, rubin & luebker 1987 `[abs]`).
  - low contrast shrinks the rsvp visual span from about 10 characters to under 2, so long words suffer most (legge 1997 `[abs]`).
  - wcag: 4.5:1 aa, 7:1 aaa.
- **tinted overlays and backgrounds:**
  - effects are "small and/or similar to … placebo" (griffiths 2016 systematic review `[abs]`). aap/aao: not endorsed.
  - rello & bigham 2017 found peach/orange backgrounds faster than blue-grey, but tested no white control `[ft]`.
- **blue light:** no evidence of eye damage (aao). evening screen light does delay sleep (chang et al. 2015, pnas `[abs]`).

---

## 5. font, size, spacing

- **serifs:** no effect in rsvp or continuous reading (arditi & cho 2005 `[abs]`).
- **monospace vs proportional** (mansfield, legge & bane 1996: courier vs times `[abs]`):
  - courier gave better acuity and a smaller critical print size.
  - times was 5% faster at best for normal readers, but 10% slower for low-vision readers and up to 50% slower at small sizes.
  - arditi et al. 1990: the proportional advantage comes from fewer eye movements, which rsvp removes.
  - → monospace by default. it also makes `ch`-unit orp alignment exact.
- **size:**
  - fluent reading needs an x-height of 0.2–2° of visual angle (legge & bigelow 2011 `[abs]`).
  - rsvp critical print size is 0.16° (chung 1998).
  - older adults read as fast as young adults at 0.3–1.0° (akutsu 1991).
  - a 32 px font gives an x-height of about 0.40–0.48° at 50–60 cm on a 96 ppi screen.
  - 0.2° is about 15–19 px font size; 0.4° about 29–38 px.
- **letter spacing:**
  - normal readers gain nothing beyond standard spacing in rsvp (chung 2002 `[abs]`).
  - dyslexic children read ~20% faster with about half the errors at extra spacing (zorzi 2012, pnas `[sec]`).
  - dyslexie font's gain vanished once arial's spacing was matched (marinus 2016 `[abs]`): spacing is the active ingredient.
- **dyslexia fonts:** meta-analysis of 15 studies, n=688: g = −0.04 (azzarello 2026 `[abs]`).
  - opendyslexic: no gain (wery & diliberto 2017). dyslexie: no gain (kuster 2018); children preferred arial or times.
- **atkinson hyperlegible, lexend:** designed with care, but no independent peer-reviewed study. atkinson hyperlegible mono exists (2025) and covers latin + latin-ext only.
- **personalisation** (wallace et al. 2022, acm tochi, n=352 `[ft]`):
  - each person's fastest of 5 fonts was 35% faster than their slowest (314 vs 232 wpm), and 14% faster than their preferred font.
  - "preference does not predict speed."
  - caveat: taking max minus min of five noisy runs inflates the gap.
  - → a short "find your font" test is a defensible feature.
- **case and style:**
  - uppercase helps only near the acuity limit (arditi & cho 2007).
  - letter-by-letter reading beats "word shape" (sheedy 2005; larson, microsoft).
  - italics were the worst in rello 2013.
- **bold:** helps legibility only for the thinnest strokes (sheedy 2005). a heavier grade helped in light mode only (palmén 2023).

---

## 6. layout, motion, flashing, frame timing

- **horizontal position of the pivot:** no study.
  - practice varies: readrrr 35% from the left, speeedy 10–20% left of centre, visual pass recommends ~40%.
  - reason for left of centre: the pivot sits ~25% into the word, so most of the word is to its right.
  - → ~40%, and shrink or split words that still don't fit.
- **vertical position:** centre of the reading box.
  - avoid the top of tall screens: looking up exposes more eye surface and evaporates tears faster (tsubota & nakamori 1995 `[abs]`).
  - osha: screen centre 15–20° below eye level.
- **blinking:** rsvp halves blink rate (benedetto 2015: 4.67 vs 8.5/min) → break reminders or periodic pauses (e.g. cadence's 300-word chunk pause).
- **context words** (faint previous/next words):
  - no study shows they help.
  - parafoveal vision is "insufficient for semantic integration" in rsvp (schotter 2023 `[abs]`).
  - → off by default. offer a "show sentence when paused" view instead (reedy, readest, pasky).
- **transitions:**
  - hard cut by default. no study compares cut vs fade vs blank.
  - neighbouring words mask each other (primativo 2016), so don't stack effects.
  - exception: insert a brief blank before an identical repeated word (kanwisher; uniread's 15% ≤ 60 ms).
- **completion meter:** doesn't interfere and is usually preferred (rahman & muter 1999 `[sec]`).
- **photosensitivity:** wcag 2.3.1 limits flashing area to 25% of a 10° field (341×256 css px; about 21,824 px²). a single word is well under that. full-screen inversions or blanks at more than 3/s are not.
- **frame quantisation:** word durations snap to display frames.

  | wpm | ms per word | frames at 60 hz | frames at 120 hz |
  |---|---|---|---|
  | 300 | 200 | 12 | 24 |
  | 400 | 150 | 9 | 18 |
  | 500 | 120 | 7.2 | 14.4 |
  | 600 | 100 | 6 | 12 |
  | 700 | 85.7 | 5.14 | 10.29 |
  | 1000 | 60 | 3.6 | 7.2 |

  at 60 hz the error is ±8.3 ms per word, about ±10% at 700 wpm. absolute deadlines make it average out (§10.1).

---

## 7. languages and tokenisation

### 7.1 per script

- **chinese:** words, not characters, are the unit (bai et al. 2008).
  - chen & chien 2007, rsvp `[ft]`: word-by-word 0.84 comprehension vs character-by-character 0.78. 171–350 characters/min was fine; 430 dropped to 0.74. day 1 was worse (learning curve).
  - pivot: first character for 2-character words, second character for 3–4 (liu & li 2013; liu et al. 2015).
  - segmenters, tested on node 24 / icu 78:
    - `Intl.Segmenter('zh')` over-segments (人工|智能, 中国|科|学院).
    - jieba-wasm 2.4.0 got all five test words right, but costs 2.8 mb gzip.
    - budoux is built for line breaking and is worse for words.
- **japanese:** use bunsetsu (phrase) chunks.
  - optimal landing is at or slightly before the bunsetsu centre, pulled toward kanji (kobayashi & kawashima 2025 `[sec]`).
  - budoux 0.9.3 (apache-2.0, ~9 kb gzip) produced correct bunsetsu: 今日は｜東京大学で｜人工知能に｜関する｜セミナーに｜参加しました。
  - `Intl.Segmenter('ja')` and tinysegmenter give morphemes (too small). kuromoji's dictionary is ~17.8 mb gzip.
  - 瞬間速読 and ishimori & kiriya 2024 suggest no fixation guide for japanese narrative.
- **korean:** one eojeol (space-separated unit) per frame; `Intl.Segmenter('ko')` keeps them intact. no korean study on where to fixate was found.
- **hebrew / arabic:**
  - eyes land right of centre, i.e. at the word beginning (deutsch & rayner 1999 `[sec]`; paterson 2015 `[abs]`).
  - recognition is fastest near the centre (jordan 2011; farid & grainger 1996 `[abs]`).
  - → count the pivot in logical order and put it nearer the centre than for latin.
  - colouring one arabic letter:
    - chrome since 76 keeps joining across elements; safari only since 26.2 (dec 2025).
    - older safari needs u+200d (zero-width joiner) on both sides of the span.
    - better: the css custom highlight api (`CSS.highlights`) — no dom change, no layout change. caveat: safari ignores it under `user-select:none`.
  - lam-alef `لا` is 2 graphemes but 1 glyph — highlight both.
  - vocalised words take longer (hermena 2021) → small extra time.
- **german / dutch / finnish compounds:** don't split compounds that fit.
  - when forced, split at the main part boundary and lower-case the continuation (bertram 2011; deilen 2022 `[sec]`).
  - hyphenopoly 6.1.0 (mit) gives syllable break points. wasm sizes: de 85 kb, ru 29 kb, en-us 21 kb.
  - keep soft hyphens (u+00ad) as author-chosen split points.
- **thai / lao / khmer / burmese:** `Intl.Segmenter` gives dictionary words. thai readers land at or just left of the word centre (kasisopa 2013/2016 `[abs]`).
- **devanagari / indic:** a conjunct like `न्दी` is one grapheme cluster. colouring part of a syllable breaks its shape (w3c bengali gap analysis).
- **emoji:** 👨‍👩‍👧‍👦 is 11 utf-16 units but 1 grapheme.

**rule:** compute length and orp over `Intl.Segmenter(lang,{granularity:'grapheme'})`, never `.length`.

### 7.2 tokeniser traps

- `Intl.Segmenter` word mode breaks:
  - urls, emails, iso dates
  - `e.g.`, `C++`, `well-known`
  - russian `1 000,50`

  → split on whitespace first, recognise entities, then peel punctuation.
- sentence mode does not know abbreviations (`Dr.`, `Fig.`) → per-language abbreviation lists.
- **pdf:**
  - rejoin `infor-⏎mation` only when both sides are letters.
  - normalise ligatures (ﬁ ﬀ); pdf.js does nfkc on those ranges by default.
  - re-glue `di ﬀerences`.
  - drop footnote superscripts by geometry.
  - strip repeated headers and footers; handle columns.
- **quotes and brackets:** shown but excluded from the orp count. locale sets: „“ « » 「」 《》. hebrew ׳ ״ are letters.
- **dashes:**
  - spaced dash attaches to the next word with a clause pause.
  - dialogue dashes at line start (ru/fr/es) attach to the next word.
  - unspaced `a—b` splits after the dash.
- **numbers:** keep `1,000.50`, `1.000,50`, `1 000,50`, `-30°C`, `1990–2000` and number+unit (`9 feet`, spritz) together.
- **long tokens:** split above 13 graphemes or box width.
  - priority: explicit hyphen > soft hyphen > hyphenation point nearest the middle.
  - parts of at least 4 graphemes; trailing `-` on non-final parts.
  - about two-thirds of spritz users preferred hyphen splitting (patent, unpublished).
- **sentence punctuation in all scripts:** `。！？ ，、；：` `؟ ، ؛` `। ॥` `။ ၊` `។ ៕` `። ፣`.
- **code, maths, tables:** don't rsvp them. show a static card or pause.

### 7.3 default speeds per language

silent reading rates from brysbaert 2019, table 5 `[ft]` (english non-fiction 238 wpm, fiction 260):

| language | wpm | language | wpm |
|---|---|---|---|
| en | 240 | de | 260 |
| nl | 230 | fr | 215 |
| es | 275 | it | 285 |
| sv | 220 | fi | 195 |
| he | 225 | ar | 180 |
| ru | ≈200 (unverified) | ko | 210–225 eojeol/min |

- chinese: 300 characters/min (chen & chien 2007).
- japanese: normal reading averages 653 characters/min, so ~500 for rsvp is a guess.
- for cjk, time per character (60000/cpm) works better than per "word".

---

## 8. features, prioritised

**must**
1. **pause anywhere and resume** — space, tap or button. required by wcag 2.2.2.
2. **punctuation and sentence pauses** — masson; castelhano & muter; warren.
3. **rescaled timing so set wpm = delivered wpm, with an exact "time left"** — §1.3.
4. **replay sentence / previous sentence** in one tap or key — schotter 2014. muter 1988 `[sec]`: sentence start was the most-used go-back target.
5. **context view when paused** — the sentence or paragraph with the current word highlighted; tap any word to start there.
6. **progress meter + time left.**
7. **live speed control.**
   - a range at least 10× the default (wcag 2.2.1), plus a manual word-step mode.
   - honest defaults: measure the user's own speed first; warn above ~350 wpm.
8. **pause when the tab is hidden; save position persistently.**
9. **split very long words** (more than 13 letters).
10. **remappable shortcuts; no key capture inside text fields** — wcag 2.1.4.
11. **screen wake lock while playing.**
12. **start countdown or focus cue.**

**should**
1. word-frequency timing with a strength slider (including off).
2. warm-up ramp on start and resume.
3. rewind to sentence start on resume (setting: off / 3 words / sentence).
4. sentence/paragraph skip, chapter list, scrubber — each with a tap alternative (wcag 2.5.1 / 2.5.7).
5. per-session effective wpm (counting pauses and replays) and a chapter-end summary.
6. import:
   - paste
   - epub via foliate-js
   - pdf via pdf.js + cleanup
   - url via readability.js through a proxy, sanitised with dompurify
7. offline pwa. share target only works in chromium/android.
8. hold-to-read as an option. conventions conflict (strobe: hold to read; word runner: hold to brake), so pick one default and say so.
9. break reminders or a chunk pause every ~300 words (blink rate).
10. one-tap switch to normal/scrolling text. rsvp is best for short texts and small screens; scrolling is better when walking or with central vision loss.
11. language-aware segmentation and pivot (§7).

**nice**
1. synced text-to-speech, with tts as the clock (readest).
   - forced-pace text + audio helps: g = .41 (clinton-lisell 2023 meta-analysis `[ft]`).
   - caveats: chrome's google voices and android don't fire word-boundary events; speech caps speed around 150–250 wpm.
2. media-session controls (headphone buttons) — audio mode only.
3. a short topic preview before starting. advance organisers d ≈ .2. never replace the text: ai summaries instead of reading hurt strong readers (etkin 2025 `[abs]`).
4. optional comprehension checks (testing effect, roediger & karpicke 2006). a quiz-driven speed controller is unvalidated.
5. "find your fastest font" test (wallace 2022).
6. training mode with a staircase — raise speed after ≥80% correct (chung 2021). tell users it doesn't transfer to page reading.
7. streaks and goals: small, partly unstable effects (sailer & homner 2020 meta-analysis `[abs]`).
8. ai recap on resume and figure explanation (rush).

---

## 9. browser pitfalls

1. **chained `setTimeout` drifts,** and is clamped to 4 ms after 5 nested calls. fix: absolute deadlines from one anchor, presented on `requestAnimationFrame`.
2. **frame quantisation.** fix: measure the frame interval from raf timestamps; show a word when its deadline falls within half a frame; never two words in one frame.
3. **long tasks, gc pauses, waking from sleep** cause bursts of skipped words. fix: if more than ~250 ms late, re-anchor and count the gap as a stall.
4. **background throttling.**
   - chrome: hidden tabs run timers once per second; after 5 minutes hidden, once per minute.
   - firefox android: 15 minutes. raf stops entirely.
   - fix: auto-pause on `visibilitychange`.
5. **screen sleeps mid-chapter.** fix: `navigator.wakeLock.request('screen')`; re-request when the page becomes visible again.
6. **storage loss.**
   - safari can wipe script-written storage after 7 days without interaction; localstorage is capped at 5 mib.
   - fix: indexeddb + `navigator.storage.persist()` + export; key positions by text offset plus word text.
7. **layout thrash from measuring every word.** fix: wait for `document.fonts.ready`, cache `measureText` per word form, move with `transform`.
8. **screen readers flooded by a live region** updating 5–15×/s. fix: `aria-hidden` on the flashing word; one polite status region for state changes; a full-text view for screen-reader users.
9. **hold gesture stuck on** when the pointer is released outside. fix: `pointerup`/`pointercancel` on `window`.
10. **web speech:** boundary events missing on chrome's google voices and android; a rate change needs stop/restart. fix: sentence-level sync fallback.
11. **share target missing on safari, ios and firefox.** fix: paste, file picker, bookmarklet, extension.
12. **readability.js modifies the dom you pass it; epubs can carry scripts; url import hits cors.** fix: clone the dom, sanitise with dompurify, set a csp, use a server-side fetch.
13. **utf-16 indexing** (`word[i]`, `.length`) cuts emoji and indic clusters. fix: grapheme segmentation (§7).
14. **span-wrapping one letter** breaks arabic joining in old safari and indic shaping. fix: css custom highlight api.

---

## 10. recommended spec

### 10.1 timing algorithm

```
// weights per token; durations are only fixed at plan time, so the set wpm is exactly delivered
LEN_FREE   = 6     // words up to ~6 letters get the same time (mcian US6130968A: short words need "nearly the same")
LEN_SLOPE  = 0.06  // per letter above 6 — a smoothed version of spritz's 1.3 (>7) / 1.6 (>13) steps
LEN_CAP    = 1.6   // spritz maximum
FREQ_BETA  = 0.04  // per zipf unit, from e-z reader 10's ~10.8 ms per log10 step at a 250 ms fixation
F_MIN, F_MAX = 0.94, 1.12   // deliberately narrow: öquist's 0.6–1.2 range felt "too large"
COMMA      = +1.0 slot      // castelhano & muter: punctuated word shown 2×
SENTENCE(n)= n<=7 ? 1.0 : n<=22 ? 2.2 : 3.3   // spritz blank by words in sentence
PARAGRAPH  = +1.0 slot      // tool convention (squirt 3.5 vs 3; sprint reader 700 vs 450 ms)
REPEAT_GAP = 15% of slot, max 60 ms blank before an identical repeated word   // kanwisher 1987; uniread
MIN_WORD   = max(2 frames, ~40 ms)                                            // painted at least twice
RAMP       = first 8 words from 0.6× to 1.0× speed, also after resume          // spritz, reedy: convention, untested

weight(tok)  = L(tok.graphemes) × F(tok.zipf, seenBefore)    // F decays toward 1 for words already seen (ericsson patent)
pause(tok)   = comma? + sentence end? + paragraph end?        // added, not multiplied (warren 2009); max if stacked
plan(section, wpm):
  budget = section.words × 60000 / wpm                        // the promise shown to the user
  scale  = budget / Σ(weight + pause)                         // rescale, with floors fixed first ("water-filling")
  d[i]   = scale × (weight[i] + pause[i])
  start[i] = prefix sum of d                                   // time-left = start[end] − start[cur], exact
play: on each requestAnimationFrame(ts):
  presentAt = ts + frameMs
  if presentAt + frameMs/2 ≥ anchor + start[next] − start[first]: show(next)   // nearest frame, max one per frame
  if late by > 250 ms: re-anchor, count as stall                               // never burst-skip
resume: from sentence start (or last 3 words), with ramp
```

pause display: keep the last word visible during a pause (castelhano & muter). a blank-gap option is how spritz, masson and glance did it; neither has been tested against the other.

### 10.2 visual defaults

| setting | default | why |
|---|---|---|
| font | `"Atkinson Hyperlegible Mono", "Noto Sans Mono", "Cascadia Mono", Consolas, Menlo, monospace` + `font-size-adjust: ex-height 0.5` | monospace = exact alignment, no rsvp cost; size-adjust keeps fallbacks the same height |
| size | 32 css px (x-height ≈ 0.4–0.48° at 50–60 cm) | 2–3× the rsvp critical print size; inside 0.3–1.0° where older readers match young |
| weight | 400 dark / 450–500 light | palmén 2023 |
| tracking | font default (0) | chung 2002; offer + spacing for dyslexia (zorzi) |
| theme | follow `prefers-color-scheme` | light reads faster, dark is preferred; serve both |
| light | bg `#FAFAF7`, text `#1A1A1A` (16.6:1), orp `#B8460B` (5.1:1, cvd-safe), reticle `#8C8C8C` | |
| dark | bg `#121212`, text `#E6E6E6` (15.0:1), orp `#FFB000` (10.2:1, cvd-safe), reticle `#6A6A6A` | avoids oled smear; avoids red-in-dark fatigue |
| orp marking | subtle colour + two short reticle ticks above/below the orp column | colour never the only cue (wcag 1.4.1); ducrot/pinna: keep colour subtle; allow off |
| pivot position | ~40% from the left of the reading box, vertical centre | room for the word tail; avoid looking up |
| transition | hard cut; blank only before repeated words; blank-free sentence pauses | primativo masking; kanwisher repeats |
| context | off while playing; sentence view while paused | no evidence for ghost words |
| breaks | prompt every ~10 min or chunk pause every ~300 words | blink rate halves |

### 10.3 options worth exposing

- **speed and timing**
  - wpm, with live ±
  - sentence-pause strength
  - frequency-timing strength (0 = off)
  - ramp on/off
  - resume rewind: off / 3 words / sentence
  - long-word split length: 10–20 or off
- **display**
  - theme: light / dark / cream `#FBF5E9` / custom held to ≥ 7:1
  - font: mono default; proportional via measured alignment
  - size: 18–96 px
  - weight: 300–700
  - tracking: 0 to +0.15 em
  - orp style: colour / bold / none, plus reticle on/off
  - alignment: orp / centred
  - words per frame: 1–3
- **reading and accessibility**
  - writing direction / vertical for japanese
  - reduced motion
  - tts on/off

### 10.4 tokeniser pipeline

1. **ingest**
   - pdf.js text + `hasEOL`: rejoin hyphens, drop footnote superscripts, strip repeated headers/footers.
   - epub dom.
   - normalise to nfc, plus nfkc on ligature ranges only.
   - record soft-hyphen positions.
2. **detect script/language per run:** `lang` attribute, otherwise `\p{Script=…}`.
3. **segment**
   - latin/cyrillic/greek/rtl/ko/indic: whitespace.
   - zh: `Intl.Segmenter` words, merged into 2–4-character chunks (jieba-wasm optional).
   - ja: budoux bunsetsu.
   - th/lo/km/my: `Intl.Segmenter`.
4. **recognise entities on whitespace tokens:** urls, emails, phone numbers, numbers with locale grouping, dates, abbreviations (per-language lists), initials, acronyms, ellipses, dashes.
5. **peel edge punctuation:** display it, exclude it from length and orp.
6. **split long tokens** (§7.2).
7. **graphemes → orp index**
   - latin: spritz table.
   - rtl: `floor((n-1)/2)`, or `floor((n-1)×0.4)` for n ≥ 9.
   - zh: 1–2 → 0, 3–4 → 1.
   - ja: centre, nudged to a kanji; highlight off by default.
   - thai/indic: centre.
   - extend over following combining-mark clusters.
8. **render:** `dir` + `unicode-bidi: isolate`; css custom highlight on the orp cluster; translate so the cluster centre sits on the fixation mark.

---

## 11. myths (no evidence or contradicted)

1. "read 500–1000+ wpm with full comprehension" — rayner 2016; acklin & papesh 2017; boo & conklin; di nocera 2018.
2. "80% of reading time is eye movement" (spritz) — about 10% (rayner 2016).
3. "you can't recognise a word until you find its orp" — words are recognised away from the optimum, just a few ms slower.
4. "a red orp letter boosts comprehension" — null (kosch 2020); red is not special (ducrot 2025).
5. "rsvp reduces eye strain" — blink rate drops ~45%, workload rises (benedetto 2015; gannon 2016).
6. "dark mode reads better" — light mode is slightly faster; fatigue results are null or mixed.
7. "pure black on white is too much contrast" — no evidence.
8. bionic reading — null or negative in four studies from 2024–2026 (snell 2024; spear 2025; beelders 2025; zhang 2026).
9. beeline colour gradients — one child study, mixed to negative; nothing peer-reviewed for adults.
10. dyslexia fonts — null (g = −0.04). coloured overlays and irlen lenses — placebo-sized.
11. lexend / atkinson "proven" — only creator or vendor data.
12. "serifs guide the eye"; "we read word shapes" — no.
13. "your preferred font is your fastest" — preference does not predict speed (wallace 2022).
14. subvocalisation suppression and peripheral "eye-span" training — harmful or ineffective (rayner 2016).
15. rsvp for macular degeneration — scrolling did better (akthar 2021).
16. "wider letter spacing always helps" — only for dyslexia; slows fast normal readers on pages (korinth 2020).

---

## 12. risks, conflicts, open questions

- **patent.** US8903174B2, "serial text display for optimal recognition", google patents status "active, expires 2033-07-09". google's status is an assumption, not a legal conclusion. related: US9483109, US10332313, US9552596.
  - not read: the claims themselves, so the scope is unknown.
  - dozens of open-source readers ship the same table openly, but that is no legal shield.
  - before a commercial release that copies the exact table + fixed-position + timing scheme, have the claims checked.
- **conflicts between sources and the pick:**
  - **light vs dark default** — evidence says light; preference and every example site say dark → follow the os setting.
  - **shorten common short words?** castelhano 0.5× rated neutral; mcian says no → don't go below ~0.94×.
  - **blank between words?** masking says no; repetition blindness says yes for repeats → hard cut, blank only before repeats.
  - **orp for japanese** → off by default (瞬間速読; ishimori & kiriya 2024).
  - **pivot x-position** — 35% (readrrr) vs 40% (visual pass) vs 10–20% left of centre (speeedy). no study → ~40%.
- **unverified / not read:**
  - o'regan & jacobs 1992; brysbaert & nazir 2005; juola 1982; deutsch & rayner 1999; the per-language irest table; full text of öquist & goldstein 2003.
  - russian rsvp studies — yandex was captcha-walled.
  - firefox/safari support for indic grapheme rule gb9c.
  - whether speechSynthesis counts as audible for background throttling.
  - jieba vs icu quality — judged on five sentences only.
- **measurement caveats:**
  - the §1.3 numbers apply each site's rules to whitespace-split text. readanythingfast uses its own tokenizer; the others split on whitespace too, so this matches them.
  - the rayner pdf text's sentence ends are approximate.

---

## 13. key sources

- rayner et al. 2016, pspi — http://faculty.cas.usf.edu/eschotter/papers/Rayner_Schotter_Masson_Potter_Treiman_2016_PSPI.pdf
- benedetto et al. 2015 (spritz) — https://www.tsw.it/wp-content/uploads/Rapid-serial-visual-presentation-in-reading-The-case-of-Spritz-1.pdf
- kosch et al. 2020 — https://hcistudio.org/publication/kosch2020one/kosch2020one.pdf
- castelhano & muter 2001 — http://cogprints.org/1934/3/castelhano_muter2001.pdf
- schotter, tran & rayner 2014 — doi:10.1177/0956797614531148
- masson 1983 — https://dspace.library.uvic.ca/bitstreams/f099dfc9-83d4-49b2-8ae2-b0b75d027d69/download
- e-z reader (reichle et al. 1998) — http://andrewd.ces.clemson.edu/courses/cpsc881/papers/reading/Reichle98_ReadingModel.pdf
- spritz patent — https://patents.google.com/patent/US8903174B2/en
- ericsson/goldstein patent — https://patents.google.com/patent/WO2002037256A2/en
- mcian patent — https://patents.google.com/patent/US6130968A/en
- öquist thesis (adaptive rsvp formulas) — http://www.diva-portal.org/smash/get/diva2:169379/FULLTEXT01.pdf
- ducrot et al. 2025 — doi:10.3390/jemr18040025
- palmén et al. 2023 — https://thereadabilityconsortium.org/wp-content/uploads/2023/07/How-bold-can-we-be-The-impact-of-adjusting-font-grade-on-readability-in-light-and-dark-polarities-1.pdf
- wallace et al. 2022 — https://shaunwallace.org/files/Readability__TOCHI.pdf
- rello & bigham 2017 — https://www.cs.cmu.edu/~jbigham/pubs/pdfs/2017/colors.pdf
- primativo et al. 2016 — doi:10.1371/journal.pone.0153786
- brysbaert 2019 (reading rates) — doi:10.1016/j.jml.2019.104047
- chen & chien 2007 (chinese rsvp) — https://www.ijdesign.org/index.php/IJDesign/article/view/36/8
- delgado et al. 2018 (screen vs paper) — https://www.uv.es/lasalgon/papers/Delgado%202018%20dont%20throw%20away%20your%20printed%20books.pdf
- clinton-lisell 2023 (text + audio) — https://files.eric.ed.gov/fulltext/EJ1403866.pdf
- wcag 2.2 — https://www.w3.org/TR/WCAG22/
- chrome timer throttling — https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- safari 26.2 cross-element shaping — https://webkit.org/blog/17640/webkit-features-for-safari-26-2/
- open-source readers: github.com/{Miserlou/Glance-Bookmarklet, pasky/speedread, cameron/squirt, ds300/jetzt, anthonynosek/sprint-reader-chrome, olegcherr/Reedy-for-Chrome, thomaskolmans/rsvp-reading, snowfluke/rsvp-speed-reader, kegbenk/rsvp-timing, Steadyx/Kairo, readest/readest, jamestomasino/stutter, VioletGiraffe/FasterThanSight}
