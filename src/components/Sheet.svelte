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

  // drag the grabber or header down to close, as on ios
  const CLOSE_DISTANCE = 110;
  const CLOSE_VELOCITY = 0.5; // px per ms
  let drag = $state(0);
  let from: { y: number; t: number } | null = null;

  function dragStart(e: PointerEvent) {
    if (e.button !== 0 || window.innerWidth >= 900 || (e.target as Element).closest('button')) return;
    from = { y: e.clientY, t: performance.now() };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function dragMove(e: PointerEvent) {
    if (!from) return;
    const dy = e.clientY - from.y;
    // no upward stretch: the sheet is pinned to the bottom, so moving it up would open a gap below it
    drag = Math.max(0, dy);
  }

  function dragEnd(e: PointerEvent) {
    if (!from) return;
    const dy = e.clientY - from.y;
    const dt = Math.max(1, performance.now() - from.t);
    from = null;
    if (e.type !== 'pointercancel' && (dy > CLOSE_DISTANCE || (dy > 20 && dy / dt > CLOSE_VELOCITY))) {
      // the sheet fades out where the finger left it, then resets for the next opening
      onclose();
      setTimeout(() => (drag = 0), 220);
    } else drag = 0;
  }
</script>

<!-- not modal: the reading stage stays visible and usable above it, so every change shows live -->
<div
  class="sheet"
  class:open
  role="dialog"
  aria-modal="false"
  aria-label={title}
  tabindex="-1"
  bind:this={panel}
  onkeydown={key}
  inert={!open}
  style:transform={drag ? `translateY(${drag}px)` : undefined}
>
  <!-- the close button is the keyboard and screen-reader way to dismiss; dragging is a touch shortcut -->
  <header role="presentation" onpointerdown={dragStart} onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd}>
    <span class="grab" aria-hidden="true"></span>
    <h2>{title}</h2>
    <button class="close" onclick={onclose} aria-label="Close {title.toLowerCase()}"><Icon svg={icons.close} /></button>
  </header>
  <div class="body">{@render children()}</div>
</div>

<style>
  /* phones: the sheet fills the lower 58% (in % of the screen, not dvh, which is unreliable in ios
     home screen apps) and fades in and out rather than sliding up */
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    top: 42%;
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-top: 1px solid var(--edge);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -12px 40px rgb(0 0 0 / 0.25);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.2s var(--ease),
      visibility 0s linear 0.2s;
    outline: none;
  }

  .sheet.open {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.2s var(--ease);
  }

  header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    /* the phone sheet runs edge to edge, so in landscape it keeps clear of the notch */
    padding: 20px max(12px, env(safe-area-inset-right)) 6px max(20px, env(safe-area-inset-left));
    touch-action: none;
    cursor: grab;
  }

  .grab {
    position: absolute;
    top: 7px;
    left: 50%;
    width: 38px;
    height: 5px;
    margin-left: -19px;
    border-radius: 3px;
    background: var(--edge);
  }

  @media (min-width: 900px) {
    header {
      cursor: default;
      touch-action: auto;
    }

    .grab {
      display: none;
    }

    /* the side panel's left edge is mid-screen, away from any notch */
    header,
    .body {
      padding-left: 20px;
    }
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
    padding: 4px max(20px, env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
  }

  /* wide screens: a side panel, so the stage keeps its full height */
  /* wide screens: a side panel that slides in from the right */
  @media (min-width: 900px) {
    .sheet {
      left: auto;
      top: 0;
      width: 400px;
      border-top: 0;
      border-left: 1px solid var(--edge);
      border-radius: 0;
      opacity: 1;
      transform: translateX(105%);
      transition:
        transform 0.32s var(--ease),
        visibility 0s linear 0.32s;
    }

    .sheet.open {
      transform: none;
      transition: transform 0.32s var(--ease);
    }
  }

  @media (hover: hover) {
    .close:hover {
      background: color-mix(in srgb, var(--paper) 10%, var(--raised));
    }
  }
</style>
