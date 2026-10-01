<script lang="ts">
  import { fade } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { icons } from '../lib/icons';
  import { app } from '../lib/app.svelte';
  import { clearLog, copyReport, debug, debugReport } from '../lib/debug.svelte';
  import { t } from '../lib/motion';

  let copied = $state(false);
  let area: HTMLTextAreaElement | undefined = $state();
  const text = $derived.by(() => {
    void debug.entries.length;
    return debugReport();
  });

  async function copy() {
    copied = await copyReport();
    if (!copied) {
      // the browser refused the clipboard: select the text so the system copy menu takes it
      area?.focus();
      area?.select();
    }
  }

  function close() {
    app.debugOpen = false;
    debug.unseen = 0;
  }

  // the panel is modal: keys stop here, or escape would also leave the book behind it and space would start reading
  function onKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="scrim" transition:fade={{ duration: t(160) }} onclick={close} role="presentation"></div>
<div class="panel" role="dialog" aria-modal="true" aria-label="Debug info" transition:fade={{ duration: t(160) }}>
  <header>
    <h2>Debug info</h2>
    <button class="close" onclick={close} aria-label="Close debug info"><Icon svg={icons.close} /></button>
  </header>
  <p class="hint">Copy this and send it along with what you did just before the problem.</p>
  <textarea bind:this={area} readonly value={text} rows="14"></textarea>
  <div class="actions">
    <button class="primary" onclick={copy}>{copied ? 'Copied' : 'Copy details'}</button>
    <button class="secondary" onclick={clearLog} disabled={!debug.entries.length}>Clear errors</button>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(0 0 0 / 0.45);
  }

  .panel {
    position: fixed;
    z-index: 41;
    left: 50%;
    top: max(24px, env(safe-area-inset-top));
    width: min(640px, calc(100% - 24px));
    max-height: calc(100% - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px 16px;
    border: 1px solid var(--edge);
    border-radius: 16px;
    background: var(--surface);
  }

  header {
    display: flex;
    align-items: center;
  }

  h2 {
    flex: 1;
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }

  .close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 50%;
    background: var(--raised);
  }

  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--haze);
  }

  textarea {
    flex: 1;
    min-height: 160px;
    padding: 10px 12px;
    border: 1px solid var(--edge);
    border-radius: 10px;
    background: var(--ink);
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.45;
    resize: none;
    -webkit-user-select: text;
    user-select: text;
  }

  .actions {
    display: flex;
    gap: 10px;
  }

  .primary,
  .secondary {
    min-height: 44px;
    padding: 10px 16px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
  }

  .primary {
    border: 0;
    background: var(--paper);
    color: var(--ink);
  }

  .secondary {
    border: 1px solid var(--edge);
    background: transparent;
  }

  .secondary:disabled {
    opacity: 0.4;
  }

  @media (hover: hover) {
    .close:hover {
      background: color-mix(in srgb, var(--paper) 10%, var(--raised));
    }

    .primary:hover {
      background: color-mix(in srgb, var(--paper) 88%, var(--ink));
    }

    .secondary:not(:disabled):hover {
      background: color-mix(in srgb, var(--paper) 6%, transparent);
    }
  }
</style>
