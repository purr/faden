<script lang="ts">
  import { settings } from '../lib/settings.svelte';
  import { formatDuration } from '../lib/format';
  import { pagesToRanges, parseRanges } from '../lib/import/pdflayout';
  import type { Book, SectionMeta, SkipTag } from '../lib/types';

  let {
    book,
    current,
    onjump,
    onchange,
    sectionWords,
  }: {
    book: Book;
    current: number;
    onjump: (s: number) => void;
    onchange: () => void;
    sectionWords: (m: SectionMeta) => number;
  } = $props();

  const TAGS: Record<SkipTag, string> = {
    contents: 'Table of contents',
    index: 'Index',
    glossary: 'Glossary',
    references: 'References',
    credits: 'Credits and copyright',
    notes: 'Notes',
    intro: 'Introductions',
    cover: 'Cover',
  };

  const present = $derived(
    (Object.keys(TAGS) as SkipTag[])
      .map((tag) => ({ tag, sections: book.sections.filter((s) => s.tag === tag) }))
      .filter((t) => t.sections.length),
  );
  const totalWords = $derived(book.sections.reduce((n, s) => n + sectionWords(s), 0));
  const readCount = $derived(book.sections.filter((s) => !s.skip).length);
  let pages = $state('');
  // the field edits a copy; it follows the book whenever the stored value changes
  $effect.pre(() => {
    pages = book.skipPages;
  });

  function setTag(tag: SkipTag, skip: boolean) {
    for (const s of book.sections) if (s.tag === tag) s.skip = skip;
    // the choice also becomes the default for books imported later
    settings.autoSkip[tag] = skip;
    onchange();
  }

  function setSkip(s: SectionMeta, skip: boolean) {
    s.skip = skip;
    onchange();
  }

  function applyPages(value: string) {
    const max = book.sections.reduce((m, s) => Math.max(m, s.pages?.[1] ?? 0), 0);
    // store the normalised form so the field shows what was understood
    pages = pagesToRanges([...parseRanges(value, max)].sort((a, b) => a - b));
    if (pages !== book.skipPages) {
      book.skipPages = pages;
      onchange();
    }
  }

  const minutes = (m: SectionMeta) => formatDuration((sectionWords({ ...m, skip: false }) / settings.wpm) * 60000);
</script>

<p class="summary">
  Reading {readCount} of {book.sections.length} sections, about {formatDuration((totalWords / settings.wpm) * 60000)} at {settings.wpm} wpm.
</p>

{#if present.length}
  <div class="group">
    <h3>Skip automatically</h3>
    <div class="chips">
      {#each present as t (t.tag)}
        {@const skipped = t.sections.every((s) => s.skip)}
        <button class="chip" class:on={skipped} aria-pressed={skipped} onclick={() => setTag(t.tag, !skipped)}>
          {TAGS[t.tag]}
          <span class="count">{t.sections.length}</span>
        </button>
      {/each}
    </div>
    <p class="hint">Highlighted kinds are skipped. Your choice also applies to books you import later.</p>
  </div>
{/if}

{#if book.kind === 'pdf'}
  <div class="group">
    <h3>Skip pages</h3>
    <input
      class="pages"
      type="text"
      inputmode="numeric"
      placeholder="For example 1-12, 240-260"
      bind:value={pages}
      onchange={(e) => applyPages(e.currentTarget.value)}
      onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
    {#if book.suggestedSkipPages && book.suggestedSkipPages !== book.skipPages}
      <button class="suggest" onclick={() => applyPages([book.skipPages, book.suggestedSkipPages].filter(Boolean).join(', '))}>
        Skip pages that look like a table of contents or an index: {book.suggestedSkipPages}
      </button>
    {/if}
  </div>
{/if}

<ol class="list">
  {#each book.sections as s, i (i)}
    <li class:current={i === current} class:skipped={s.skip}>
      <input
        type="checkbox"
        class="read"
        checked={!s.skip}
        onchange={(e) => setSkip(s, !e.currentTarget.checked)}
        aria-label="Read {s.title}"
      />
      <button class="name" onclick={() => onjump(i)} disabled={s.skip}>
        <span class="t">{s.title}</span>
        <span class="meta">
          {#if s.tag}<span class="tag">{TAGS[s.tag]}</span>{/if}
          {#if s.pages}<span>Pages {s.pages[0]}–{s.pages[1]}</span>{/if}
          <span>{minutes(s)}</span>
        </span>
      </button>
    </li>
  {/each}
</ol>

<style>
  .summary {
    margin: 4px 0 12px;
    color: var(--haze);
    font-size: 14px;
  }

  .group {
    padding: 10px 0 14px;
    border-bottom: 1px solid var(--edge);
  }

  h3 {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--haze);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--edge);
    border-radius: 999px;
    background: transparent;
    font-size: 14px;
  }

  .chip.on {
    border-color: var(--lamp);
    background: var(--lamp-soft);
  }

  .count {
    color: var(--haze);
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--haze);
  }

  .pages {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--edge);
    border-radius: 10px;
    background: var(--ink);
  }

  .suggest {
    margin-top: 10px;
    padding: 10px 12px;
    width: 100%;
    text-align: left;
    border: 1px dashed var(--lamp);
    border-radius: 10px;
    background: transparent;
    font-size: 14px;
  }

  .list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid var(--edge);
  }

  .read {
    flex: none;
    width: 22px;
    height: 22px;
    margin: 0 0 0 2px;
    accent-color: var(--lamp);
  }

  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 0;
    border: 0;
    background: transparent;
    text-align: left;
  }

  .name:disabled {
    cursor: default;
  }

  .t {
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 12px;
    color: var(--haze);
  }

  .tag {
    color: var(--lamp);
  }

  li.current .t {
    font-weight: 600;
  }

  li.current {
    box-shadow: inset 3px 0 0 var(--lamp);
    padding-left: 8px;
  }

  li.skipped .t {
    color: var(--haze);
    text-decoration: line-through;
    text-decoration-color: var(--line);
  }

  @media (hover: hover) {
    .chip:hover {
      border-color: color-mix(in srgb, var(--lamp) 50%, var(--edge));
    }

    .suggest:hover {
      background: var(--lamp-soft);
    }

    .name:not(:disabled):hover .t {
      color: color-mix(in srgb, var(--lamp) 60%, var(--paper));
    }
  }

  .t {
    transition: color 0.2s var(--ease);
  }
</style>
