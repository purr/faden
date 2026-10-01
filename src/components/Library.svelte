<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly, slide } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { ease, t } from '../lib/motion';
  import { icons } from '../lib/icons';
  import { app, applyUpdate, isIOS, isStandalone, refreshBooks, refreshStorage } from '../lib/app.svelte';
  import { deleteBook, storeBook } from '../lib/db';
  import { ACCEPT, bookFrom, parseFile } from '../lib/import';
  import { parseText } from '../lib/import/text';
  import { settings } from '../lib/settings.svelte';
  import { formatBytes, formatDuration } from '../lib/format';
  import type { Book } from '../lib/types';

  let busy: { name: string; progress: number } | null = $state(null);
  let error = $state('');
  let pasteOpen = $state(false);
  let pasteTitle = $state('');
  let pasteText = $state('');
  let confirmDelete: string | null = $state(null);
  let dragging = $state(false);
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

  async function importFiles(files: FileList | File[]) {
    error = '';
    for (const file of Array.from(files)) {
      busy = { name: file.name, progress: 0 };
      try {
        const data = await file.arrayBuffer();
        const parsed = await parseFile(data.slice(0), file.name, file.type, (p) => busy && (busy.progress = p));
        const { book, contents } = bookFrom(parsed, { name: file.name, size: file.size });
        await storeBook(book, contents, { name: file.name, type: file.type, data });
        await refreshBooks();
        await refreshStorage(true);
      } catch (e) {
        error = (e as Error).message;
        if ((e as DOMException).name === 'QuotaExceededError') error = `There is not enough storage left on this device to keep "${file.name}".`;
      }
    }
    busy = null;
    if (fileInput) fileInput.value = '';
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
      pasteOpen = false;
      pasteText = '';
      pasteTitle = '';
      await refreshBooks();
      app.openId = book.id;
    } catch (e) {
      error = (e as Error).message;
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
      <button class="primary" onclick={() => fileInput.click()}><Icon svg={icons.import} /> Import a book</button>
      <button class="secondary" onclick={() => (pasteOpen = !pasteOpen)} aria-expanded={pasteOpen}><Icon svg={icons.paste} /> Paste text</button>
      <input bind:this={fileInput} type="file" accept={ACCEPT} multiple hidden onchange={(e) => e.currentTarget.files && importFiles(e.currentTarget.files)} />
    </div>
    <p class="formats">PDF, EPUB, Markdown and plain text.</p>
  </header>

  {#if app.updateReady}
    <div class="note" transition:slide={{ duration: t(260), easing: ease }}>
      <span>A new version of Faden is ready.</span>
      <button onclick={applyUpdate}>Reload</button>
    </div>
  {/if}

  {#if showInstall}
    <div class="note install" transition:slide={{ duration: t(260), easing: ease }}>
      <Icon svg={icons.share} />
      <p>
        To read offline, tap <b>Share</b> and choose <b>Add to Home Screen</b>, then open Faden from there. The Home Screen app keeps its
        own library, so import your books inside it.
      </p>
    </div>
  {/if}

  {#if pasteOpen}
    <form
      transition:slide={{ duration: t(280), easing: ease }}
      class="paste"
      onsubmit={(e) => {
        e.preventDefault();
        void importPaste();
      }}
    >
      <input type="text" placeholder="Title (optional)" bind:value={pasteTitle} />
      <textarea placeholder="Paste an article, a chapter or notes" rows="7" bind:value={pasteText}></textarea>
      <div class="paste-actions">
        <button type="button" class="secondary" onclick={() => (pasteOpen = false)}>Cancel</button>
        <button type="submit" class="primary" disabled={!pasteText.trim()}>Save and read</button>
      </div>
    </form>
  {/if}

  {#if busy}
    <div class="busy" role="status" transition:slide={{ duration: t(240), easing: ease }}>
      <span>Reading “{busy.name}”</span>
      <span class="meter"><span style:transform="scaleX({busy.progress})"></span></span>
    </div>
  {/if}

  {#if error}
    <p class="error" role="alert" transition:slide={{ duration: t(220), easing: ease }}>{error}</p>
  {/if}

  {#if app.books.length}
    <ul class="books">
      {#each app.books as b (b.id)}
        {@const s = stats(b)}
        <li animate:flip={{ duration: t(320), easing: ease }} in:fly={{ y: 14, duration: t(320), easing: ease }} out:slide={{ duration: t(260), easing: ease }}>
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

  .error {
    margin: 18px 0 0;
    color: var(--danger);
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

  .title {
    font-size: 19px;
    font-weight: 600;
    line-height: 1.3;
  }

  .author {
    font-size: 15px;
    color: var(--haze);
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
      box-shadow: 0 6px 22px rgb(0 0 0 / 0.22);
      transform: translateY(-1px);
    }

    .secondary:hover {
      background: var(--raised);
    }

    .open:hover .title {
      color: var(--lamp);
    }

    .del:hover {
      color: var(--danger);
      background: var(--raised);
    }

    .note button:hover {
      filter: brightness(1.08);
    }
  }

  .title {
    transition: color 0.2s var(--ease);
  }
</style>
