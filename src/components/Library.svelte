<script lang="ts">
  import { fade } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { ease, t } from '../lib/motion';
  import { icons } from '../lib/icons';
  import { app, applyUpdate, isIOS, isStandalone, refreshBooks, refreshStorage } from '../lib/app.svelte';
  import { deleteBook, storeBook } from '../lib/db';
  import { ACCEPT, bookFrom, parseFile } from '../lib/import';
  import { parseText } from '../lib/import/text';
  import { fetchBook, type Download } from '../lib/import/url';
  import { settings } from '../lib/settings.svelte';
  import { copyReport, debug, report } from '../lib/debug.svelte';
  import { formatBytes, formatDuration } from '../lib/format';
  import type { Book } from '../lib/types';

  // progress is NaN while it cannot be measured
  let busy: { step: string; name: string; progress: number } | null = $state(null);
  let error = $state('');
  let form: 'paste' | 'link' | null = $state(null);
  let pasteTitle = $state('');
  let pasteText = $state('');
  let link = $state('');
  let confirmDelete: string | null = $state(null);
  let dragging = $state(false);
  let copied = $state(false);

  async function copyDetails() {
    copied = await copyReport();
    // the clipboard was refused: the debug panel shows the text to copy by hand
    if (!copied) app.debugOpen = true;
  }
  let fileInput: HTMLInputElement;

  const showInstall = isIOS() && !isStandalone();

  function stats(b: Book) {
    let total = 0;
    let done = 0;
    b.sections.forEach((s, i) => {
      if (s.skip) return;
      total += s.words;
      if (i < b.pos.s) done += s.words;
      else if (i === b.pos.s) done += Math.min(b.pos.w, s.words);
    });
    const share = total ? done / total : 0;
    return { share, left: ((total - done) / settings.wpm) * 60000 };
  }

  function fail(where: string, name: string, e: unknown) {
    report(where, e);
    copied = false;
    error =
      (e as DOMException).name === 'QuotaExceededError' ? `There is not enough storage left on this device to keep "${name}".` : (e as Error).message;
  }

  async function importData(file: Download) {
    busy = { step: 'Reading', name: file.name, progress: 0 };
    // pdf.js takes over the buffer it parses, so it gets a copy and the original is stored
    const parsed = await parseFile(file.data.slice(0), file.name, file.type, (p) => busy && (busy.progress = p));
    const { book, contents } = bookFrom(parsed, { name: file.name, size: file.data.byteLength });
    await storeBook(book, contents, file);
    await refreshBooks();
    await refreshStorage(true);
  }

  async function importFiles(files: FileList | File[]) {
    // one import at a time: a second one would clear the first one's progress and unlock its button midway
    if (busy) {
      error = 'Wait until the current import has finished.';
      return;
    }
    error = '';
    for (const file of Array.from(files)) {
      busy = { step: 'Reading', name: file.name, progress: 0 };
      try {
        await importData({ name: file.name, type: file.type, data: await file.arrayBuffer() });
      } catch (e) {
        fail(`import ${file.name}`, file.name, e);
      }
    }
    busy = null;
    if (fileInput) fileInput.value = '';
  }

  async function importLink() {
    error = '';
    const input = link.trim();
    if (!input || busy) return;
    const shown = input.replace(/^https?:\/\//i, '');
    try {
      const file = await fetchBook(input, (s) => {
        busy = { step: s.step === 'reader' ? 'Reading through the reader service' : 'Downloading', name: shown, progress: s.progress };
      });
      await importData(file);
      form = null;
      link = '';
    } catch (e) {
      // the messages name the checked address; the raw input stays out of the stored log
      fail('import link', shown, e);
    }
    busy = null;
  }

  async function importPaste() {
    error = '';
    const text = pasteText.trim();
    if (!text) return;
    try {
      const title = pasteTitle.trim() || text.split('\n')[0].slice(0, 60);
      const parsed = parseText(text, 'pasted.txt', title);
      const data = new TextEncoder().encode(text).buffer as ArrayBuffer;
      const { book, contents } = bookFrom(parsed, { name: `${title}.txt`, size: data.byteLength });
      await storeBook(book, contents, { name: `${title}.txt`, type: 'text/plain', data });
      form = null;
      pasteText = '';
      pasteTitle = '';
      await refreshBooks();
      app.openId = book.id;
    } catch (e) {
      fail('import pasted text', 'the pasted text', e);
    }
  }

  async function remove(b: Book) {
    await deleteBook(b);
    confirmDelete = null;
    await refreshBooks();
    await refreshStorage();
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files.length) void importFiles(e.dataTransfer.files);
  }
</script>

<svelte:window
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={(e) => {
    if (!e.relatedTarget) dragging = false;
  }}
  ondrop={drop}
/>

<div class="library" class:dragging>
  <header class="head">
    <h1 class="mark" aria-label="Faden">
      <span class="tick top" aria-hidden="true"></span>
      <span aria-hidden="true">F<span class="lamp">a</span>den</span>
      <span class="tick bottom" aria-hidden="true"></span>
    </h1>
    <p class="lede">Read books one word at a time, with the sentence running beside it. Everything stays on this device.</p>
    <div class="actions">
      <button class="primary" onclick={() => fileInput.click()} disabled={!!busy}><Icon svg={icons.import} /> Import a book</button>
      <button class="secondary" onclick={() => (form = form === 'paste' ? null : 'paste')} aria-expanded={form === 'paste'}>
        <Icon svg={icons.paste} /> Paste text
      </button>
      <button class="secondary" onclick={() => (form = form === 'link' ? null : 'link')} aria-expanded={form === 'link'}>
        <Icon svg={icons.link} /> From a link
      </button>
      <input bind:this={fileInput} type="file" accept={ACCEPT} multiple hidden onchange={(e) => e.currentTarget.files && importFiles(e.currentTarget.files)} />
    </div>
    <p class="formats">PDF, EPUB, Markdown and plain text, or a link to one or to any web page.</p>
  </header>

  {#if app.updateReady}
    <div class="note" transition:fade={{ duration: t(200), easing: ease }}>
      <span>A new version of Faden is ready.</span>
      <button onclick={applyUpdate}>Reload</button>
    </div>
  {/if}

  {#if showInstall}
    <div class="note install" transition:fade={{ duration: t(200), easing: ease }}>
      <Icon svg={icons.share} />
      <p>
        To read offline, tap <b>Share</b> and choose <b>Add to Home Screen</b>, then open Faden from there. The Home Screen app keeps its
        own library, so import your books inside it.
      </p>
    </div>
  {/if}

  {#if form === 'link'}
    <form
      transition:fade={{ duration: t(200), easing: ease }}
      class="paste"
      onsubmit={(e) => {
        e.preventDefault();
        void importLink();
      }}
    >
      <!-- plain text, not type=url: that would refuse an address typed without http:// or https:// -->
      <input
        type="text"
        inputmode="url"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="go"
        aria-label="Web address"
        placeholder="example.com/book.pdf"
        bind:value={link}
      />
      <p class="hint">
        A PDF, an EPUB, a text file or an article. Sites that block direct downloads are read through the r.jina.ai reader service, which then
        sees the address.
      </p>
      <div class="paste-actions">
        <button type="button" class="secondary" onclick={() => (form = null)}>Cancel</button>
        <button type="submit" class="primary" disabled={!link.trim() || !!busy}>Import</button>
      </div>
    </form>
  {/if}

  {#if form === 'paste'}
    <form
      transition:fade={{ duration: t(200), easing: ease }}
      class="paste"
      onsubmit={(e) => {
        e.preventDefault();
        void importPaste();
      }}
    >
      <input type="text" placeholder="Title (optional)" bind:value={pasteTitle} />
      <textarea placeholder="Paste an article, a chapter or notes" rows="7" bind:value={pasteText}></textarea>
      <div class="paste-actions">
        <button type="button" class="secondary" onclick={() => (form = null)}>Cancel</button>
        <button type="submit" class="primary" disabled={!pasteText.trim()}>Save and read</button>
      </div>
    </form>
  {/if}

  {#if busy}
    <div class="busy" role="status" transition:fade={{ duration: t(200), easing: ease }}>
      <span>{busy.step} “{busy.name}”</span>
      <span class="meter" class:wait={Number.isNaN(busy.progress)}>
        <span style:transform={Number.isNaN(busy.progress) ? null : `scaleX(${busy.progress})`}></span>
      </span>
    </div>
  {/if}

  {#if error}
    <div class="error" role="alert" transition:fade={{ duration: t(200), easing: ease }}>
      <p>{error}</p>
      <button class="secondary" onclick={copyDetails}>{copied ? 'Copied' : 'Copy details'}</button>
    </div>
  {/if}

  {#if app.books.length}
    <ul class="books">
      {#each app.books as b (b.id)}
        {@const s = stats(b)}
        <li in:fade={{ duration: t(240), easing: ease }} out:fade={{ duration: t(160), easing: ease }}>
          <button class="open" onclick={() => (app.openId = b.id)}>
            <span class="title">{b.title}</span>
            {#if b.author}<span class="author">{b.author}</span>{/if}
            <span class="thread" aria-hidden="true"><span style:transform="scaleX({s.share})"></span></span>
            <span class="meta">
              <span>{Math.round(s.share * 100)}% read</span>
              <span>{s.share >= 0.999 ? 'Finished' : `${formatDuration(s.left)} left at ${settings.wpm} wpm`}</span>
            </span>
          </button>
          {#if confirmDelete === b.id}
            <div class="confirm" in:fade={{ duration: t(160) }}>
              <button class="danger" onclick={() => remove(b)}>Delete</button>
              <button class="secondary" onclick={() => (confirmDelete = null)}>Keep</button>
            </div>
          {:else}
            <button class="del" onclick={() => (confirmDelete = b.id)} aria-label="Delete {b.title}"><Icon svg={icons.trash} /></button>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if !busy}
    <div class="empty" in:fade={{ duration: t(240) }}>
      <p>Your library is empty. Import a PDF or EPUB, or paste some text to start reading.</p>
    </div>
  {/if}

  <footer class="foot">
    <button class="debug" onclick={() => (app.debugOpen = true)}>Debug info{debug.entries.length ? `, ${debug.entries.length} error${debug.entries.length === 1 ? '' : 's'}` : ''}</button>
    {#if app.offlineReady}
      <span>Works offline</span>
    {:else if 'serviceWorker' in navigator}
      <span>Getting ready for offline use…</span>
    {/if}
    {#if app.usage}
      <span>{formatBytes(app.usage)} used{app.persisted ? ', protected from automatic cleanup' : ''}</span>
    {/if}
  </footer>
</div>

<style>
  .library {
    max-width: 44rem;
    min-height: 100%;
    margin: 0 auto;
    padding: calc(28px + env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) calc(28px + env(safe-area-inset-bottom))
      max(20px, env(safe-area-inset-left));
  }

  .library.dragging {
    outline: 2px dashed var(--lamp);
    outline-offset: -10px;
  }

  /* the wordmark is set the way the reader sets a word: focus letter on the marks */
  .mark {
    position: relative;
    display: inline-block;
    margin: 18px 0 18px;
    font-family: 'Atkinson Hyperlegible Mono', ui-monospace, monospace;
    font-size: 44px;
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0;
  }

  .mark .lamp {
    color: var(--lamp);
  }

  .mark .tick {
    position: absolute;
    left: calc(1.5ch - 1px);
    width: 2px;
    height: 14px;
    border-radius: 1px;
    background: var(--line);
  }

  .mark .tick.top {
    top: -20px;
  }

  .mark .tick.bottom {
    bottom: -20px;
  }

  .lede {
    max-width: 30rem;
    margin: 6px 0 22px;
    font-size: 17px;
    line-height: 1.5;
  }

  .actions,
  .paste-actions,
  .confirm {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .primary,
  .secondary,
  .danger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
  }

  .primary {
    border: 0;
    background: var(--paper);
    color: var(--ink);
  }

  .primary:disabled {
    opacity: 0.4;
  }

  .secondary {
    border: 1px solid var(--edge);
    background: transparent;
  }

  .danger {
    border: 0;
    background: var(--danger);
    color: var(--ink);
  }

  .formats {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--haze);
  }

  .note {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 22px;
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--edge);
    font-size: 15px;
  }

  .note p {
    margin: 0;
  }

  .note button {
    margin-left: auto;
    padding: 8px 14px;
    border: 0;
    border-radius: 10px;
    background: var(--lamp);
    color: var(--ink);
    font-weight: 600;
  }

  .install :global(.icon) {
    color: var(--lamp);
  }

  .paste {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 22px;
  }

  .paste input,
  .paste textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--edge);
    border-radius: 12px;
    background: var(--surface);
    resize: vertical;
  }

  .busy {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 22px;
    font-size: 15px;
  }

  .meter {
    height: 2px;
    background: var(--edge);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    background: var(--lamp);
    transform-origin: 0 0;
    transition: transform 0.2s linear;
  }

  /* while the size is unknown a short segment runs along the line */
  .meter.wait span {
    width: 30%;
    transition: none;
    animation: wait 1.4s ease-in-out infinite;
  }

  @keyframes wait {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(340%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .meter.wait span {
      width: 100%;
      opacity: 0.4;
      animation: none;
    }
  }

  .busy > span:first-child {
    overflow-wrap: anywhere;
  }

  .hint {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--haze);
  }

  .error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    margin: 18px 0 0;
    color: var(--danger);
  }

  .error p {
    margin: 0;
    flex: 1 1 16rem;
  }

  .debug {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--haze);
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .books {
    list-style: none;
    margin: 30px 0 0;
    padding: 0;
    border-top: 1px solid var(--edge);
  }

  .books li {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--edge);
  }

  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 18px 0;
    border: 0;
    background: transparent;
    text-align: left;
  }

  /* file-name titles have no spaces; without this they would overrun the delete button */
  .title {
    font-size: 19px;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .author {
    font-size: 15px;
    color: var(--haze);
    overflow-wrap: anywhere;
  }

  .thread {
    display: block;
    height: 2px;
    margin: 10px 0 4px;
    background: var(--edge);
    border-radius: 1px;
    overflow: hidden;
  }

  .thread span {
    display: block;
    height: 100%;
    background: var(--lamp);
    transform-origin: 0 0;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    font-size: 13px;
    color: var(--haze);
    font-variant-numeric: tabular-nums;
  }

  .del {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--haze);
  }

  .confirm .danger,
  .confirm .secondary {
    padding: 8px 12px;
    font-size: 14px;
  }

  .empty {
    margin-top: 36px;
    padding: 28px 0;
    border-top: 1px solid var(--edge);
    color: var(--haze);
  }

  .empty p {
    margin: 0;
    max-width: 26rem;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin-top: 40px;
    font-size: 13px;
    color: var(--haze);
  }

  @media (hover: hover) {
    .primary:not(:disabled):hover {
      background: color-mix(in srgb, var(--paper) 88%, var(--ink));
    }

    .secondary:hover {
      background: color-mix(in srgb, var(--paper) 6%, transparent);
    }

    .open:hover .title {
      color: color-mix(in srgb, var(--lamp) 60%, var(--paper));
    }

    .del:hover {
      color: var(--danger);
    }

    .note button:hover {
      background: color-mix(in srgb, var(--lamp) 88%, var(--paper));
    }
  }

  .title {
    transition: color 0.2s var(--ease);
  }
</style>
