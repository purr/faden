# faden

an offline reader that shows a book one word at a time (rsvp), with the rest of the sentence running faintly beside the word. it installs from the browser on iphone, android, mac and windows, keeps every book on the device, and needs no network after the first visit.

the design choices come from the research in [research.md](research.md).

## install on an iphone

1. open the app's address in **safari** while online (see "hosting" below).
2. tap **share**, then **add to home screen**.
3. open faden from the home screen once while still online, so it finishes caching itself. the library footer then says "works offline".
4. import your books **inside the home screen app**. safari and the home screen app keep separate libraries.

after that the app starts, imports and reads in flight mode. the home screen app gets persistent storage (up to about 60% of the disk) and is exempt from safari's 7-day storage cleanup. the screen stays awake while reading on ios 18.4 and later.

## reading

- tap the stage (or press space) to read or pause. swipe right for the previous sentence, left for the next.
- while paused, the text you have read appears under the word, with unread text dimmed. tap any word there to continue from it.
- the contents button lists all sections. sections that look like a table of contents, index, glossary, references, copyright pages or notes are skipped automatically; switch any section or kind on or off there. for pdfs you can also skip page ranges ("1-12, 240-260"), and pages that look like a table of contents or index are suggested.
- reading settings open as a panel beside or below the stage, so every change shows on the word right away.

### keyboard

| key | action |
| --- | --- |
| space | read or pause |
| ← → | sentence back or ahead |
| shift ← → | one word back or ahead |
| ↑ ↓ | 10 wpm faster or slower (shift: 50) |
| c | contents |
| o | reading settings |
| esc | close a panel, pause, or go back to the library |

shortcuts can be switched off in the settings.

## defaults and why

| setting | default | reason |
| --- | --- | --- |
| speed | 300 wpm | comprehension holds up to ~300–350 wpm and drops above (di nocera 2018, kosch 2020) |
| speed includes pauses | on | pauses take their time from the words around them, so the speed shown is the speed delivered; most readers deliver 76–94% of their slider |
| sentence pauses | +1 / +2.2 / +3.3 word slots by sentence length; commas +0.8; paragraphs +1.2 | pauses between sentences protect comprehension (masson 1983); lengths from the spritz patent |
| long words | +7% per letter past 6, up to 2.6× | long german compounds get time instead of being split |
| short words together | on | "a house", "in der Stadt" show as one frame; the eye skips most short function words in normal reading |
| focus letter | spritz table (`floor((n+2)/4)`), amber `#FFB000` night / `#8F5500` day | stays ≥ 5.2:1 against the background for all colour-blindness types |
| font | atkinson hyperlegible mono | monospace aligns the focus letter exactly and costs nothing in rsvp |
| sentence context | on, 42% of the main size | the words before and after, faint, pushed toward the edges |
| after a pause | smart | where you stopped after a glance away, a few words back after a short break, the sentence start after a long one |
| repeated words | a 15% blank before an identical word | otherwise the second one is often not seen at all (kanwisher 1987) |

chinese is shown in 2–4 character words, japanese in phrase chunks without a focus colour, hebrew and arabic with a mirrored focus point. focus letters are counted in visible characters, so emoji and indic syllables are never cut.

## formats

pdf (with a text layer), epub, markdown, plain text and html, or pasted text. kindle files (mobi, azw3, kfx) need converting to epub first, for example with calibre. scanned pdfs need ocr first.

## development

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests (tokenizer, timing, importers)
npm run check    # svelte and typescript checks
npm run build    # production build into dist/
npm run icons    # regenerate app icons from public/icon.svg
npm run deploy   # build and publish dist/ to the gh-pages branch (github pages)
```

stack: svelte 5, typescript, vite, vite-plugin-pwa (offline cache), indexeddb via idb, pdf.js (legacy build, so older iphones can import pdfs), fflate for epub archives.

## hosting

`dist/` is a static site that works at a domain root or any sub-path. it must be served over https (or from localhost), because service workers, and with them offline use, need a secure origin. any static host works, for example github pages, cloudflare pages or netlify.

books never leave the device: hosting serves only the app itself.
