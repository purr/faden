<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { icons } from '../lib/icons';

  let {
    open,
    title,
    onclose,
    children,
  }: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();

  let panel: HTMLElement | undefined = $state();

  $effect(() => {
    if (open) panel?.focus({ preventScroll: true });
    // focus must not stay inside a closed (inert) sheet, or its key handler would keep catching keys
    else if (panel?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  });

  function key(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
  }
</script>

<!-- not modal: the reading stage stays visible and usable above it, so every change shows live -->
<div class="sheet" class:open role="dialog" aria-modal="false" aria-label={title} tabindex="-1" bind:this={panel} onkeydown={key} inert={!open}>
  <header>
    <h2>{title}</h2>
    <button class="close" onclick={onclose} aria-label="Close {title.toLowerCase()}"><Icon svg={icons.close} /></button>
  </header>
  <div class="body">{@render children()}</div>
</div>

<style>
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    height: var(--sheet-h, 58dvh);
    background: var(--surface);
    border-top: 1px solid var(--edge);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -12px 40px rgb(0 0 0 / 0.25);
    transform: translateY(105%);
    transition: transform 0.32s var(--ease);
    outline: none;
  }

  .sheet.open {
    transform: none;
  }

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 12px 6px 20px;
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
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: var(--raised);
  }

  .body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 20px calc(24px + env(safe-area-inset-bottom));
  }

  /* wide screens: a side panel, so the stage keeps its full height */
  @media (min-width: 900px) {
    .sheet {
      left: auto;
      top: 0;
      width: 400px;
      height: auto;
      border-top: 0;
      border-left: 1px solid var(--edge);
      border-radius: 0;
      transform: translateX(105%);
    }
  }
</style>
