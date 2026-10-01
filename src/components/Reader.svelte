<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Trail from './Trail.svelte';
  import PageView from './PageView.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import ContentsPanel from './ContentsPanel.svelte';
  import { icons } from '../lib/icons';
  import { getBook, getFile, loadSection, putBook, replaceContent } from '../lib/db';
  import { FONT_STACKS, autoSize, settings } from '../lib/settings.svelte';
  import { tokenize, type Section } from '../lib/tokenize';
  import { durations } from '../lib/timing';
  import { Player } from '../lib/player';
  import { Stage } from '../lib/stage';
  import { parseRanges } from '../lib/import/pdflayout';
  import { baseLang } from '../lib/lang';
  import { PARSER_VERSION, bookFrom, parseFile } from '../lib/import';
  import { refreshBooks } from '../lib/app.svelte';
  import { formatDuration } from '../lib/format';
  import type { Book, Para, SectionMeta } from '../lib/types';

  let { bookId, onexit }: { bookId: string; onexit: () => void } = $props();

  let book = $state<Book | null>(null);
  let sIdx = $state(0);
  let paras = $state.raw<Para[]>([]);
  let sec = $state.raw<Section | null>(null);
  let dur = $state.raw<Float64Array>(new Float64Array(0));
  let fi = $state(0);
  let playing = $state(false);
  let carding = $state(false);
  let finished = $state(false);
  let error = $state('');
  let sheet = $state<'settings' | 'contents' | null>(null);
  let width = $state(window.innerWidth);
  let session = $state({ ms: 0, words: 0 });
  let stageEl: HTMLElement;
  let stage: Stage | null = null;
  let pausedAt = 0;
  let playStart = 0;
  let maxShown = -1;
  let savedAt = 0;
  let lock: WakeLockSentinel | null = null;

  const player = new Player({
    show: (i) => onShow(i),
    blank: () => stage?.blank(),
    end: () => void onEnd(),
  });

  const noFocus = $derived(book ? baseLang(book.lang) === 'ja' : false);
  const isPdf = $derived(book?.kind === 'pdf');
  // the panel beside the stage shows the text, or for pdfs optionally the printed page
  const view = $derived(isPdf ? settings.view : 'text');
  // on phones an open sheet leaves room only for the stage
  const panelVisible = $derived(
    !!sec &&
      !carding &&
      !(sheet && width < 900) &&
      (settings.trail === 'always' || (settings.trail === 'pause' && !playing)),
  );
  // pdf page of the current word: the paragraph's first page, moved on by how far into the paragraph it is
  const readingPage = $derived.by(() => {
    if (!sec || !paras.length) return 1;
    const w = sec.words[sec.frames[fi]?.w0 ?? 0];
    if (!w) return 1;
    const start = paras[w.p].pg ?? 1;
    const next = paras.slice(w.p + 1).find((p) => p.pg)?.pg ?? start;
    if (next <= start) return start;
    return Math.min(next, start + Math.floor((w.s / Math.max(1, paras[w.p].t.length)) * (next - start + 1)));
  });
  const cum = $derived.by(() => {
    const c = new Float64Array(dur.length + 1);
    for (let i = 0; i < dur.length; i++) c[i + 1] = c[i] + dur[i];
    return c;
  });
  const secSrc = $derived(sec ? sec.frames.reduce((n, f) => n + f.src, 0) : 0);

  function sectionWords(m: SectionMeta): number {
    if (!book || m.skip) return 0;
    if (book.kind === 'pdf' && book.skipPages && m.pages && m.pageWords) {
      const skip = parseRanges(book.skipPages);
      return m.pageWords.reduce((n, w, i) => n + (skip.has(m.pages![0] + i) ? 0 : w), 0);
    }
    return m.words;
  }

  const chapterLeftMs = $derived(dur.length ? cum[dur.length] - cum[Math.min(fi, dur.length)] : 0);
  const bookLeftMs = $derived.by(() => {
    if (!book || !sec) return 0;
    const base = 60000 / settings.wpm;
    // later sections are assumed to run at the current section's real pace
    const ratio = secSrc ? cum[dur.length] / (secSrc * base) : 1;
    let rest = 0;
    book.sections.forEach((m, k) => {
      if (k > sIdx) rest += sectionWords(m);
    });
    return chapterLeftMs + rest * base * ratio;
  });
  const progress = $derived.by(() => {
    if (!book || !sec || !sec.frames.length) return 0;
    let total = 0;
    let before = 0;
    book.sections.forEach((m, k) => {
      const w = sectionWords(m);
      total += w;
      if (k < sIdx) before += w;
    });
    const here = sectionWords(book.sections[sIdx]) * (fi / sec.frames.length);
    return total ? Math.min(1, (before + here) / total) : 0;
  });
  // the pace this section really runs at; differs from the slider when pauses and long words can't all
  // be paid for by the other words (or with "speed includes pauses" off)
  const realWpm = $derived(secSrc && dur.length ? Math.round((secSrc * 60000) / cum[dur.length]) : settings.wpm);
  const showReal = $derived(Math.abs(realWpm - settings.wpm) >= settings.wpm * 0.03);
  const sectionTitle = $derived(book?.sections[sIdx]?.title ?? '');
  const readable = $derived(book ? book.sections.filter((m) => !m.skip).length : 0);
  const sessionNote = $derived.by(() => {
    if (session.ms < 30000) return '';
    const wpm = Math.round(session.words / (session.ms / 60000));
    return `This session: ${formatDuration(session.ms)}, ${Math.round(session.words).toLocaleString()} words, ${wpm} wpm on average.`;
  });
  const status = $derived(playing ? '' : finished ? 'Finished the book.' : sec ? `Paused in ${sectionTitle}.` : '');

  function nextReadable(from: number): number {
    if (!book) return -1;
    for (let k = Math.max(0, from); k < book.sections.length; k++) if (!book.sections[k].skip && sectionWords(book.sections[k]) > 0) return k;
    return -1;
  }

  function stageOptions() {
    const size = settings.size || autoSize(width);
    return {
      wordFont: FONT_STACKS[settings.font],
      size,
      weight: settings.weight,
      focus: settings.focus,
      reticle: settings.reticle,
      context: settings.context,
      contextGap: settings.contextGap,
      contextScale: settings.contextScale,
      motion: settings.motion,
      pivot: settings.pivot,
      ctxFont: FONT_STACKS[settings.font],
    };
  }

  function render(i: number, animate = true) {
    if (!sec || !stage || !sec.frames[i]) return;
    stage.render(sec, i, dur[i], noFocus && sec.frames[i].script === 'cj', animate);
  }

  function retime() {
    if (!sec) return;
    dur = durations(sec, { wpm: settings.wpm, pauses: settings.pauses, longWords: settings.longWords, honest: settings.honest });
    player.retime(dur);
  }

  function retokenize(word: number) {
    if (!book) return;
    sec = tokenize(paras, { lang: book.lang, group: settings.group, splitHyphens: settings.splitHyphens });
    dur = durations(sec, { wpm: settings.wpm, pauses: settings.pauses, longWords: settings.longWords, honest: settings.honest });
    const w = Math.max(0, Math.min(word, sec.words.length - 1));
    fi = Math.max(0, sec.wordFrame[w] ?? 0);
    maxShown = fi;
    player.load(dur, sec.frames.map((f) => f.text), fi);
    render(fi, false);
  }

  async function loadAt(s: number, word: number, autoplay: boolean): Promise<void> {
    if (!book) return;
    player.pause();
    const target = nextReadable(s);
    if (target < 0) {
      finish();
      return;
    }
    const raw = await loadSection(book.id, target);
    const skip = book.kind === 'pdf' && book.skipPages ? parseRanges(book.skipPages) : null;
    const kept = skip ? raw.filter((p) => !skip.has(p.pg ?? 0)) : raw;
    if (!kept.length) return loadAt(target + 1, 0, autoplay);
    sIdx = target;
    paras = kept;
    finished = false;
    retokenize(target === s ? word : 0);
    savePosition();
    if (autoplay) start(true);
  }

  async function reparse(b: Book): Promise<Book> {
    const file = await getFile(b.id);
    if (!file) throw new Error(`library: the original file of "${b.title}" is missing, so it cannot be re-read`);
    const parsed = await parseFile(file.data, file.name, file.type);
    const { book: fresh, contents } = bookFrom(parsed, { name: file.name, size: b.size });
    const next: Book = { ...fresh, id: b.id, addedAt: b.addedAt, skipPages: b.skipPages, pos: { s: Math.min(b.pos.s, contents.length - 1), w: b.pos.w } };
    await replaceContent(next, b.sections.length, contents);
    return next;
  }

  async function open() {
    try {
      let b = await getBook(bookId);
      if (!b) throw new Error('This book is no longer in the library.');
      if (b.parser !== PARSER_VERSION) b = await reparse(b);
      b.openedAt = Date.now();
      book = b;
      await document.fonts?.ready;
      stage?.setOptions(stageOptions());
      await loadAt(b.pos.s, b.pos.w, false);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function savePosition() {
    if (!book || !sec) return;
    book.pos = { s: sIdx, w: sec.frames[fi]?.w0 ?? 0 };
    savedAt = fi;
    void putBook(book);
  }

  function onShow(i: number) {
    if (!sec) return;
    if (carding) carding = false;
    fi = i;
    render(i);
    if (i > maxShown) {
      for (let k = maxShown + 1; k <= i; k++) session.words += sec.frames[k].src;
      maxShown = i;
    }
    if (Math.abs(i - savedAt) >= 40) savePosition();
  }

  async function wake(on: boolean) {
    try {
      if (on && !lock && 'wakeLock' in navigator) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => (lock = null));
      } else if (!on && lock) {
        await lock.release();
        lock = null;
      }
    } catch {
      // refused (low power mode, or ios before 18.4 in home screen apps): reading still works, the screen may dim
    }
  }

  // where reading continues after a pause: unchanged for a glance away, back a little for a short
  // interruption, from the sentence start after a long one (going back to the sentence start is the
  // most used regression in rsvp, muter 1988)
  function resumeFrame(pauseMs: number): number {
    if (!sec) return fi;
    const sentStart = sec.wordFrame[sec.sentences[sec.words[sec.frames[fi].w0].sent][0]];
    switch (settings.resume) {
      case 'exact':
        return fi;
      case 'sentence':
        return sentStart;
      case 'words':
        return Math.max(0, fi - 3);
      default:
        if (pauseMs < 2000) return fi;
        if (pauseMs < 20000) return Math.max(sentStart, fi - 3);
        return sentStart;
    }
  }

  function start(withCard = false) {
    if (!sec || !book || playing) return;
    // read again from the first section after finishing the book
    if (finished) {
      void loadAt(0, 0, true);
      return;
    }
    if (!withCard && pausedAt) {
      const to = resumeFrame(Date.now() - pausedAt);
      if (to !== fi) {
        fi = to;
        player.seek(to);
        render(to, false);
      }
    }
    pausedAt = 0;
    let leadIn = 0;
    if (withCard && stage) {
      carding = true;
      stage.card(sectionTitle, `Section ${book.sections.slice(0, sIdx + 1).filter((m) => !m.skip).length} of ${readable}`);
      leadIn = 1600;
    }
    playing = true;
    playStart = performance.now();
    void wake(true);
    player.play({ ramp: settings.ramp, leadInMs: leadIn });
  }

  function pause() {
    player.pause();
    if (!playing) return;
    playing = false;
    session.ms += performance.now() - playStart;
    pausedAt = Date.now();
    if (carding) {
      carding = false;
      stage?.hideCard();
      render(fi, false);
    }
    void wake(false);
    savePosition();
  }

  function toggle() {
    if (playing) pause();
    else start();
  }

  function finish() {
    player.pause();
    if (playing) session.ms += performance.now() - playStart;
    playing = false;
    finished = true;
    stage?.card('Finished', book?.title ?? '');
    void wake(false);
  }

  async function onEnd() {
    if (playing) session.ms += performance.now() - playStart;
    playing = false;
    const next = nextReadable(sIdx + 1);
    if (next < 0) {
      if (book && sec) {
        book.pos = { s: sIdx, w: sec.words.length - 1 };
        void putBook(book);
      }
      finish();
      return;
    }
    await loadAt(next, 0, true);
  }

  function seek(i: number) {
    if (!sec) return;
    const to = Math.max(0, Math.min(i, sec.frames.length - 1));
    fi = to;
    pausedAt = 0;
    finished = false;
    player.seek(to);
    if (!playing) render(to, false);
    savePosition();
  }

  const sentOf = (i: number) => (sec ? sec.words[sec.frames[i].w0].sent : 0);
  const sentFrame = (s: number) => (sec ? sec.wordFrame[sec.sentences[s][0]] : 0);

  function prevSentence() {
    if (!sec) return;
    const cur = sentOf(fi);
    const startF = sentFrame(cur);
    if (fi - startF > 1 || cur === 0) seek(startF);
    else seek(sentFrame(cur - 1));
  }

  function nextSentence() {
    if (!sec) return;
    const cur = sentOf(fi);
    if (cur + 1 < sec.sentences.length) seek(sentFrame(cur + 1));
    else {
      const next = nextReadable(sIdx + 1);
      if (next >= 0) void loadAt(next, 0, playing);
    }
  }

  function jumpTo(p: number, offset: number) {
    if (!sec) return;
    let w = sec.words.findIndex((x) => x.p === p && x.e > offset);
    if (w < 0) w = sec.words.findIndex((x) => x.p > p);
    if (w < 0) return;
    seek(sec.wordFrame[w]);
  }

  async function jumpSection(s: number) {
    const wasPlaying = playing;
    pause();
    if (width < 900) sheet = null;
    await loadAt(s, 0, wasPlaying);
  }

  // skip toggles or skipped pages changed in the contents panel
  async function contentsChanged() {
    if (!book) return;
    await putBook(book);
    const here = book.sections[sIdx];
    if (here?.skip || book.kind === 'pdf') await loadAt(sIdx, sec?.frames[fi]?.w0 ?? 0, playing);
  }

  function bump(delta: number) {
    settings.wpm = Math.max(100, Math.min(1000, Math.round((settings.wpm + delta) / 10) * 10));
  }

  async function exit() {
    pause();
    savePosition();
    await refreshBooks();
    onexit();
  }

  // opening a panel pauses reading: nobody reads the word while looking at a list
  function toggleSheet(which: 'settings' | 'contents') {
    if (sheet !== which) pause();
    sheet = sheet === which ? null : which;
  }

  // "read from here" on a pdf page: find the section holding that page, then its first paragraph there
  async function readFromPage(page: number) {
    if (!book) return;
    pause();
    const s = book.sections.findIndex((m) => !m.skip && m.pages && m.pages[0] <= page && page <= m.pages[1]);
    if (s < 0) return;
    if (s !== sIdx) await loadAt(s, 0, false);
    const p = paras.findIndex((x) => (x.pg ?? 0) >= page);
    if (p >= 0) jumpTo(p, 0);
  }

  // tap the stage to read or pause; swipe right to go back a sentence, left to go ahead; a swipe that
  // starts at the left screen edge goes back to the library, like the ios back gesture
  let down: { x: number; y: number } | null = null;
  function pointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY };
  }
  function pointerUp(e: PointerEvent) {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const fromEdge = down.x < 24;
    down = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (fromEdge && dx > 80) void exit();
      else if (dx > 0) prevSentence();
      else nextSentence();
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) toggle();
  }

  function onKey(e: KeyboardEvent) {
    if (!settings.keys || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (t.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        toggle();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (e.shiftKey) seek(fi - 1);
        else prevSentence();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey) seek(fi + 1);
        else nextSentence();
        break;
      case 'ArrowUp':
        e.preventDefault();
        bump(e.shiftKey ? 50 : 10);
        break;
      case 'ArrowDown':
        e.preventDefault();
        bump(e.shiftKey ? -50 : -10);
        break;
      case 'Escape':
        if (sheet) sheet = null;
        else if (playing) pause();
        else void exit();
        break;
      case 'c':
        toggleSheet('contents');
        break;
      case 'o':
        toggleSheet('settings');
        break;
    }
  }

  onMount(() => {
    stage = new Stage(stageEl);
    stage.setOptions(stageOptions());
    void open();
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    const onResize = () => (width = window.innerWidth);
    const onFonts = () => stage?.setOptions(stageOptions());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('pagehide', savePosition);
    document.fonts?.addEventListener?.('loadingdone', onFonts);
    return () => {
      pause();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', savePosition);
      document.fonts?.removeEventListener?.('loadingdone', onFonts);
      stage?.destroy();
      stage = null;
    };
  });

  // look settings apply to the stage at once, also while a sheet is open
  $effect(() => {
    const o = stageOptions();
    stage?.setOptions(o);
  });

  // speed and rhythm: same frames, new durations
  $effect(() => {
    void [settings.wpm, settings.pauses, settings.longWords, settings.honest];
    untrack(() => sec && retime());
  });

  // grouping and splitting change the frames themselves; keep the reading position by word
  let tokenKey = '';
  $effect(() => {
    const key = `${settings.group}:${settings.splitHyphens}`;
    untrack(() => {
      if (tokenKey && key !== tokenKey && sec) {
        const w = sec.frames[fi]?.w0 ?? 0;
        const was = playing;
        pause();
        retokenize(w);
        if (was) start();
      }
    });
    tokenKey = key;
  });
</script>

<div
  class="reader"
  class:playing
  class:paused={!playing}
  class:sheet-open={sheet !== null}
  class:panel-on={panelVisible}
  class:panel-above={settings.trailPos === 'above'}
>
  <header class="top">
    <button class="icon-btn" onclick={exit} aria-label="Back to library"><Icon svg={icons.library} /></button>
    <div class="where">
      <span class="title">{sectionTitle || book?.title || ''}</span>
      {#if sec}
        <span class="sub">{formatDuration(chapterLeftMs)} left in this section</span>
      {/if}
    </div>
    <button class="icon-btn" class:active={sheet === 'contents'} onclick={() => toggleSheet('contents')} aria-label="Contents and skipping">
      <Icon svg={icons.contents} />
    </button>
  </header>

  <main class="main">
    <div
      class="stage-wrap"
      bind:this={stageEl}
      onpointerdown={pointerDown}
      onpointerup={pointerUp}
      onpointercancel={() => (down = null)}
      role="button"
      tabindex="-1"
      aria-label={playing ? 'Pause' : 'Read'}
    ></div>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    {#if sec && book}
      <section class="panel" aria-label={view === 'page' ? 'Printed page' : 'Text you have read'} inert={!panelVisible}>
        {#if isPdf}
          <div class="tabs" role="tablist" aria-label="Panel">
            <button role="tab" aria-selected={view === 'text'} class:on={view === 'text'} onclick={() => (settings.view = 'text')}>Text</button>
            <button role="tab" aria-selected={view === 'page'} class:on={view === 'page'} onclick={() => (settings.view = 'page')}>Page</button>
          </div>
        {/if}
        <div class="panel-body">
          {#if view === 'page'}
            <PageView bookId={book.id} page={readingPage} visible={panelVisible} onread={readFromPage} />
          {:else}
            <Trail
              {paras}
              {sec}
              {fi}
              visible={panelVisible}
              note={sessionNote}
              onjump={jumpTo}
              anchor={settings.trailPos === 'above' ? 0.62 : 0.3}
            />
          {/if}
        </div>
      </section>
    {/if}
  </main>

  <div class="progress" aria-hidden="true"><div class="bar" style:transform="scaleX({progress})"></div></div>

  <footer class="controls">
    <div class="speed">
      <button class="icon-btn small" onclick={() => bump(-10)} aria-label="Slower"><Icon svg={icons.minus} /></button>
      <button class="wpm" onclick={() => toggleSheet('settings')} aria-label="Speed {settings.wpm} words per minute, open settings">
        <span class="num">{settings.wpm}</span><span class="unit">wpm</span>
        {#if showReal}<span class="real" title="Real pace of this section with the current timing settings">{realWpm} real</span>{/if}
      </button>
      <button class="icon-btn small" onclick={() => bump(10)} aria-label="Faster"><Icon svg={icons.plus} /></button>
    </div>
    <div class="transport">
      <button class="icon-btn" onclick={prevSentence} aria-label="Back one sentence"><Icon svg={icons.back} /></button>
      <button class="play" class:on={playing} onclick={toggle} aria-label={playing ? 'Pause' : 'Read'}>
        <span class="glyph play-glyph"><Icon svg={icons.play} /></span>
        <span class="glyph pause-glyph"><Icon svg={icons.pause} /></span>
      </button>
      <button class="icon-btn" onclick={nextSentence} aria-label="Next sentence"><Icon svg={icons.forward} /></button>
    </div>
    <div class="extra">
      <span class="booktime">{sec ? `${formatDuration(bookLeftMs)} in book` : ''}</span>
      <button class="icon-btn" class:active={sheet === 'settings'} onclick={() => toggleSheet('settings')} aria-label="Reading settings">
        <Icon svg={icons.tune} />
      </button>
    </div>
  </footer>

  <Sheet open={sheet === 'settings'} title="Reading settings" onclose={() => (sheet = null)}>
    <SettingsPanel />
  </Sheet>
  <Sheet open={sheet === 'contents'} title="Contents" onclose={() => (sheet = null)}>
    {#if book}
      <ContentsPanel {book} current={sIdx} onjump={jumpSection} onchange={contentsChanged} {sectionWords} />
    {/if}
  </Sheet>
  <div class="sr-only" role="status" aria-live="polite">{status}</div>
</div>

<style>
  .reader {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
    transition: padding-right 0.32s var(--ease);
  }

  .top {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 56px;
    padding: 6px 8px;
    transition: opacity 0.4s var(--ease);
  }

  .where {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .title {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 15px;
    font-weight: 600;
  }

  .sub {
    font-size: 13px;
    color: var(--haze);
    font-variant-numeric: tabular-nums;
  }

  /* while reading, everything but the word steps back */
  .reader.playing .top,
  .reader.playing .controls .speed,
  .reader.playing .controls .extra {
    opacity: 0.28;
  }

  .reader.playing .top:hover,
  .reader.playing .controls:hover .speed,
  .reader.playing .controls:hover .extra,
  .reader.playing .top:focus-within,
  .reader.playing .controls:focus-within .speed,
  .reader.playing .controls:focus-within .extra {
    opacity: 1;
  }

  .main {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .stage-wrap {
    position: absolute;
    inset: 0;
    transition: transform 0.45s var(--ease);
    outline: none;
  }

  /* the panel (text or printed page) takes one part of the screen; the stage moves to the other.
     both move on the compositor, so showing and hiding the panel stays smooth */
  .panel {
    position: absolute;
    left: 0;
    right: 0;
    top: 40%;
    bottom: 0;
    display: flex;
    flex-direction: column;
    opacity: 0;
    transform: translateY(18px);
    pointer-events: none;
    transition:
      opacity 0.35s var(--ease),
      transform 0.5s var(--ease);
  }

  .reader.panel-above .panel {
    top: 0;
    bottom: 42%;
    transform: translateY(-18px);
  }

  .reader.panel-on .panel {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }

  .reader.panel-on .stage-wrap {
    transform: translateY(-30%);
  }

  .reader.panel-on.panel-above .stage-wrap {
    transform: translateY(29%);
  }

  .panel-body {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .tabs {
    align-self: center;
    display: flex;
    gap: 2px;
    margin: 6px 0 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--raised);
  }

  .reader.panel-above .tabs {
    order: 1;
    margin: 2px 0 6px;
  }

  .tabs button {
    padding: 5px 14px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
    color: var(--haze);
  }

  .tabs button.on {
    background: var(--ink);
    color: var(--paper);
    box-shadow: 0 0 0 1px var(--edge);
  }

  .error {
    position: absolute;
    left: 20px;
    right: 20px;
    top: 40%;
    margin: 0;
    text-align: center;
    color: var(--danger);
  }

  .progress {
    height: 2px;
    margin: 0 20px;
    background: var(--edge);
    border-radius: 1px;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: var(--lamp);
    opacity: 0.7;
    transform-origin: 0 0;
    transition: transform 0.6s linear;
  }

  .controls {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
  }

  .speed,
  .extra {
    display: flex;
    align-items: center;
    gap: 2px;
    transition: opacity 0.4s var(--ease);
  }

  .extra {
    justify-content: flex-end;
    gap: 8px;
  }

  .transport {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .icon-btn {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--paper);
  }

  .icon-btn.small {
    width: 36px;
    height: 36px;
  }

  .icon-btn.active {
    background: var(--raised);
  }

  @media (hover: hover) {
    .icon-btn:hover,
    .wpm:hover {
      background: var(--raised);
    }

    .play:hover {
      box-shadow: 0 8px 28px rgb(0 0 0 / 0.28);
      transform: scale(1.04);
    }

    .tabs button:not(.on):hover {
      color: var(--paper);
    }
  }

  .wpm {
    border-radius: 10px;
  }

  .play {
    position: relative;
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    border: 0;
    border-radius: 50%;
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
  }

  /* play and pause cross-fade and turn instead of swapping */
  .glyph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    transition:
      opacity 0.22s var(--ease),
      transform 0.32s var(--ease);
  }

  .pause-glyph,
  .play.on .play-glyph {
    opacity: 0;
    transform: scale(0.6) rotate(-90deg);
  }

  .play.on .pause-glyph {
    opacity: 1;
    transform: none;
  }

  .real {
    margin-left: 2px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--lamp-soft);
    color: var(--lamp);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .wpm {
    display: flex;
    align-items: baseline;
    gap: 4px;
    padding: 6px 4px;
    border: 0;
    background: transparent;
  }

  .num {
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .unit,
  .booktime {
    font-size: 13px;
    color: var(--haze);
  }

  .booktime {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* phones: a sheet covers the lower half, the stage shrinks into the space above it */
  @media (max-width: 899px) {
    .reader.sheet-open .main {
      flex: none;
      height: calc(42dvh - 56px - env(safe-area-inset-top));
    }

    .reader.sheet-open .stage-wrap,
    .reader.sheet-open.panel-above .stage-wrap {
      transform: none;
    }

    .booktime {
      display: none;
    }
  }

  @media (min-width: 900px) {
    .reader.sheet-open {
      padding-right: 400px;
    }

    .controls {
      padding-inline: 24px;
    }
  }
</style>
