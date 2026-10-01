<script lang="ts">
  import type { Para } from '../lib/types';
  import type { Section } from '../lib/tokenize';

  let {
    paras,
    sec,
    fi,
    visible,
    note,
    onjump,
    anchor,
  }: {
    paras: Para[];
    sec: Section;
    fi: number;
    visible: boolean;
    note: string;
    onjump: (p: number, offset: number) => void;
    // where the current word settles, as a share of the panel height: near the edge that faces the stage
    anchor: number;
  } = $props();

  let box: HTMLElement | undefined = $state();
  const highlights = typeof CSS !== 'undefined' && 'highlights' in CSS;
  let wasVisible = false;
  let lastPara: Element | null = null;
  // the panel's size: a rotation or resize re-wraps the text, so the current word is placed again
  let boxW = $state(0);
  let boxH = $state(0);
  let lastSize = '';

  // a paragraph as plain and emphasised runs; their text adds up to exactly `p.t`
  function runs(p: Para): { t: string; k: number }[] {
    if (!p.em?.length) return [{ t: p.t, k: 0 }];
    const cuts = new Set([0, p.t.length]);
    for (const r of p.em) cuts.add(r.s).add(r.e);
    const xs = [...cuts].filter((x) => x >= 0 && x <= p.t.length).sort((a, b) => a - b);
    const out: { t: string; k: number }[] = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      let k = 0;
      for (const r of p.em) if (r.s <= xs[i] && r.e >= xs[i + 1]) k |= r.k;
      out.push({ t: p.t.slice(xs[i], xs[i + 1]), k });
    }
    return out;
  }

  // text node and offset for a character offset inside paragraph `pi`
  function locate(pi: number, off: number): [Node, number] | null {
    const el = box?.querySelector(`[data-p="${pi}"]`);
    if (!el) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let last: Text | null = null;
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const len = n.data.length;
      if (off <= acc + len) return [n, off - acc];
      acc += len;
      last = n;
    }
    return last ? [last, last.data.length] : null;
  }

  $effect(() => {
    if (!visible || !box) {
      wasVisible = false;
      if (highlights) {
        CSS.highlights.delete('faden-current');
        CSS.highlights.delete('faden-unread');
      }
      return;
    }
    const size = `${boxW}x${boxH}`;
    if (size !== lastSize) {
      lastSize = size;
      wasVisible = false;
    }
    const f = sec.frames[fi];
    if (!f) return;
    const a = sec.words[f.w0];
    const b = sec.words[f.w1];
    const start = locate(a.p, a.s);
    const end = locate(b.p, b.e);
    if (!start || !end) return;
    const cur = document.createRange();
    cur.setStart(...start);
    cur.setEnd(...end);
    if (highlights) {
      const unread = document.createRange();
      unread.setStart(...end);
      unread.setEndAfter(box.lastElementChild ?? box);
      CSS.highlights.set('faden-current', new Highlight(cur));
      CSS.highlights.set('faden-unread', new Highlight(unread));
    } else {
      // without the highlight api the current paragraph is marked instead
      const el = box.querySelector(`[data-p="${a.p}"]`);
      if (el !== lastPara) {
        lastPara?.classList.remove('current');
        el?.classList.add('current');
        lastPara = el;
      }
    }
    const r = cur.getBoundingClientRect();
    const v = box.getBoundingClientRect();
    // re-place the word when it nears an edge; the margin shrinks on short panels so it stays reachable
    const edge = Math.min(48, v.height * 0.15);
    if (!wasVisible || r.top < v.top + edge || r.bottom > v.bottom - edge) {
      // an instant jump: the text never glides up or down while the word is being read
      box.scrollTo({ top: box.scrollTop + r.top - v.top - v.height * anchor, behavior: 'auto' });
    }
    wasVisible = true;
  });

  $effect(() => () => {
    if (highlights) {
      CSS.highlights.delete('faden-current');
      CSS.highlights.delete('faden-unread');
    }
  });

  // tap a word to continue reading from it
  function tap(e: MouseEvent) {
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let node: Node | null = null;
    let off = 0;
    const pos = doc.caretPositionFromPoint?.(e.clientX, e.clientY);
    if (pos) {
      node = pos.offsetNode;
      off = pos.offset;
    } else {
      const r = doc.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (r) {
        node = r.startContainer;
        off = r.startOffset;
      }
    }
    if (!node || node.nodeType !== 3) return;
    const pEl = node.parentElement?.closest<HTMLElement>('[data-p]');
    if (!pEl) return;
    const walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT);
    let acc = 0;
    for (let n = walker.nextNode(); n && n !== node; n = walker.nextNode()) acc += (n as Text).data.length;
    onjump(Number(pEl.dataset.p), acc + off);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="trail" bind:this={box} bind:clientWidth={boxW} bind:clientHeight={boxH} onclick={tap} aria-hidden={!visible} inert={!visible}>
  <!-- spacers sized from the panel's height let the first and last lines reach the reading anchor -->
  <div class="pad" style:height="{anchor * 100}%" aria-hidden="true"></div>
  {#if note}<p class="note">{note}</p>{/if}
  <p class="hint">Tap a word to read on from there.</p>
  {#each paras as p, i (i)}
    {#if p.h}
      <h3 data-p={i}>{#each runs(p) as r}{#if r.k}<span class:i={r.k & 1} class:b={r.k & 2}>{r.t}</span>{:else}{r.t}{/if}{/each}</h3>
    {:else}
      <p data-p={i}>{#each runs(p) as r}{#if r.k}<span class:i={r.k & 1} class:b={r.k & 2}>{r.t}</span>{:else}{r.t}{/if}{/each}</p>
    {/if}
  {/each}
  <div class="pad" style:height="{(1 - anchor) * 100}%" aria-hidden="true"></div>
</div>

<style>
  /* fills the reader's panel; the panel itself handles showing, hiding and placement */
  .trail {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    /* only horizontal padding: percentage padding resolves against the width, and vertical padding
       wider than the panel is tall pushed the text out over the word and the controls */
    padding: 0 max(20px, calc((100% - 38rem) / 2));
    font-size: 17px;
    line-height: 1.6;
    /* the edge fades shrink on short panels, so a readable band always stays in the middle */
    mask-image: linear-gradient(to bottom, transparent, #000 min(32px, 12%), #000 calc(100% - min(32px, 12%)), transparent);
  }

  p,
  h3 {
    margin: 0 0 0.9em;
  }

  h3 {
    font-size: 19px;
    font-weight: 600;
    line-height: 1.3;
    margin-top: 1.2em;
  }

  .i {
    font-style: italic;
  }

  .b {
    font-weight: 600;
  }

  .note,
  .hint {
    font-size: 13px;
    color: var(--haze);
    margin-bottom: 0.6em;
  }

  .hint {
    margin-bottom: 1.4em;
  }

  :global(.trail .current) {
    color: var(--paper);
    background: var(--lamp-soft);
  }
</style>
