<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { icons } from '../lib/icons';
  import { getFile } from '../lib/db';
  import { PdfPages } from '../lib/import/pdf';

  let {
    bookId,
    page,
    visible,
    onread,
  }: {
    bookId: string;
    // the page the reading position is on
    page: number;
    visible: boolean;
    onread: (page: number) => void;
  } = $props();

  let box: HTMLElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let pages: PdfPages | null = $state(null);
  let total = $state(0);
  let shown = $state(1);
  // the view follows the reading position until the reader pages away by hand
  let follow = $state(true);
  let zoom = $state(1);
  let width = $state(0);
  let error = $state('');

  onMount(() => {
    let gone = false;
    void (async () => {
      const file = await getFile(bookId);
      if (gone) return;
      if (!file) {
        error = 'The original PDF is not stored for this book, so its pages cannot be shown.';
        return;
      }
      pages = new PdfPages(file.data);
      total = await pages.count();
    })();
    const ro = new ResizeObserver(() => (width = box?.clientWidth ?? 0));
    if (box) ro.observe(box);
    return () => {
      gone = true;
      ro.disconnect();
      pages?.destroy();
    };
  });

  $effect(() => {
    if (follow) shown = page;
  });

  $effect(() => {
    if (!visible || !pages || !canvas || !width) return;
    const w = Math.min(width - 24, 860) * zoom;
    pages.render(shown, canvas, w).catch((e: Error) => (error = `This page could not be drawn (${e.message}).`));
  });

  function go(delta: number) {
    follow = false;
    // before the page count is known only the lower bound applies; render() clamps to the last page
    shown = Math.max(1, total ? Math.min(total, shown + delta) : shown + delta);
  }

  // swipe sideways to turn pages, double tap to zoom in or out
  let down: { x: number; y: number; t: number } | null = null;
  let lastTap = 0;
  function pointerDown(e: PointerEvent) {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
  function pointerUp(e: PointerEvent) {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (zoom === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = performance.now();
      if (now - lastTap < 320) {
        zoom = zoom === 1 ? 2 : 1;
        lastTap = 0;
      } else lastTap = now;
    }
  }
</script>

<div class="pageview" bind:this={box}>
  <div class="bar">
    <button class="nav" onclick={() => go(-1)} disabled={shown <= 1} aria-label="Previous page"><Icon svg={icons.library} /></button>
    <span class="where">Page {shown}{total ? ` of ${total}` : ''}</span>
    <button class="nav flip" onclick={() => go(1)} disabled={!!total && shown >= total} aria-label="Next page"><Icon svg={icons.library} /></button>
    <span class="grow"></span>
    {#if !follow}
      <button class="pill" onclick={() => (follow = true)}>Back to reading</button>
    {/if}
    <button class="pill strong" onclick={() => onread(shown)}>Read from here</button>
  </div>
  {#if error}
    <p class="error">{error}</p>
  {:else}
    <div class="paper" class:zoomed={zoom > 1} onpointerdown={pointerDown} onpointerup={pointerUp} role="presentation">
      <canvas bind:this={canvas} aria-label="Page {shown}"></canvas>
    </div>
  {/if}
</div>

<style>
  .pageview {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
  }

  .where {
    font-size: 13px;
    color: var(--haze);
    font-variant-numeric: tabular-nums;
  }

  .grow {
    flex: 1;
  }

  .nav {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: transparent;
  }

  .nav:disabled {
    opacity: 0.3;
  }

  .flip :global(svg) {
    transform: scaleX(-1);
  }

  .pill {
    padding: 7px 12px;
    border: 1px solid var(--edge);
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
  }

  .pill.strong {
    border-color: var(--lamp);
    color: var(--lamp);
  }

  .paper {
    flex: 1;
    overflow: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 4px 12px 24px;
    text-align: center;
    touch-action: pan-x pan-y;
  }

  canvas {
    display: inline-block;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 6px 28px rgb(0 0 0 / 0.28);
  }

  /* the page keeps its own paper colour; a dimmer page sits better in a dark room */
  :global([data-theme='night']) canvas {
    filter: brightness(0.86);
  }

  .error {
    margin: 20px;
    color: var(--danger);
    font-size: 14px;
  }

  @media (hover: hover) {
    .nav:not(:disabled):hover,
    .pill:hover {
      background: var(--raised);
    }
  }
</style>
