<script lang="ts">
  import { fade } from 'svelte/transition';
  import { autoSize, resetSettings, settings } from '../lib/settings.svelte';
  import { ease, t } from '../lib/motion';

  const pauseLabel = $derived(
    settings.pauses === 0 ? 'Off' : settings.pauses < 0.75 ? 'Short' : settings.pauses <= 1.25 ? 'Normal' : 'Long',
  );
  const longLabel = $derived(
    settings.longWords === 0
      ? 'Off'
      : settings.longWords < 0.75
        ? 'A little'
        : settings.longWords <= 1.25
          ? 'Normal'
          : settings.longWords <= 2.25
            ? 'More'
            : 'A lot',
  );
  const shownSize = $derived(settings.size || autoSize(window.innerWidth));

  function fitToScreen(on: boolean) {
    settings.size = on ? 0 : autoSize(window.innerWidth);
  }
</script>

{#snippet choice<T extends string | number>(label: string, value: T, options: [T, string][], set: (v: T) => void)}
  <div class="row col">
    <span class="label">{label}</span>
    <div class="seg" role="radiogroup" aria-label={label}>
      {#each options as [v, text]}
        <button role="radio" aria-checked={value === v} class:on={value === v} onclick={() => set(v)}>{text}</button>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet toggle(label: string, value: boolean, set: (v: boolean) => void, hint = '')}
  <label class="row">
    <span class="text">
      <span class="label">{label}</span>
      {#if hint}<span class="hint">{hint}</span>{/if}
    </span>
    <input type="checkbox" class="switch" checked={value} onchange={(e) => set(e.currentTarget.checked)} />
  </label>
{/snippet}

<section>
  <h3>Speed</h3>
  <label class="row col">
    <span class="line"><span class="label">Words per minute</span><span class="value">{settings.wpm}</span></span>
    <input type="range" min="100" max="1000" step="10" bind:value={settings.wpm} />
    {#if settings.wpm > 350}
      <span class="hint" transition:fade={{ duration: t(180), easing: ease }}>Above about 350 wpm most readers understand noticeably less.</span>
    {/if}
  </label>
  {@render toggle('Speed includes pauses', settings.honest, (v) => (settings.honest = v), 'The speed you set is the speed you read at; pauses take their time from the words around them.')}
  {@render toggle('Ease in', settings.ramp, (v) => (settings.ramp = v), 'The first few words after starting run a little slower.')}
</section>

<section>
  <h3>Rhythm</h3>
  <label class="row col">
    <span class="line"><span class="label">Pauses at commas and sentence ends</span><span class="value">{pauseLabel}</span></span>
    <input type="range" min="0" max="2" step="0.1" bind:value={settings.pauses} />
  </label>
  <label class="row col">
    <span class="line"><span class="label">More time for long words</span><span class="value">{longLabel}</span></span>
    <input type="range" min="0" max="3" step="0.1" bind:value={settings.longWords} />
    <span class="hint">Long compounds like “Donaudampfschifffahrt” stay on screen longer.</span>
  </label>
  {@render toggle('Read short words together', settings.group, (v) => (settings.group = v), 'Shows “a house” or “in der Stadt” at once instead of word by word.')}
  {@render toggle('Split long hyphenated words', settings.splitHyphens, (v) => (settings.splitHyphens = v), 'Shows “Nord-Süd-Verbindungsstraße” in two parts.')}
  {@render choice('After a pause, continue', settings.resume, [
    ['smart', 'Smart'],
    ['sentence', 'Sentence start'],
    ['words', '3 words back'],
    ['exact', 'Where I stopped'],
  ], (v) => (settings.resume = v))}
  {#if settings.resume === 'smart'}
    <p class="hint" transition:fade={{ duration: t(180), easing: ease }}>Smart continues where you stopped after a quick glance away, a few words back after a short break, and from the start of the sentence after a long one.</p>
  {/if}
</section>

<section>
  <h3>Look</h3>
  {@render choice('Theme', settings.theme, [
    ['auto', 'Auto'],
    ['night', 'Night'],
    ['day', 'Day'],
  ], (v) => (settings.theme = v))}
  {@render choice('Font', settings.font, [
    ['mono', 'Mono'],
    ['sans', 'Sans'],
    ['serif', 'Serif'],
  ], (v) => (settings.font = v))}
  <div class="row col">
    <span class="line"><span class="label">Size</span><span class="value">{shownSize} px</span></span>
    <input type="range" min="22" max="80" step="1" value={shownSize} oninput={(e) => (settings.size = Number(e.currentTarget.value))} aria-label="Size" />
  </div>
  {@render toggle('Fit size to the screen', settings.size === 0, fitToScreen)}
  {@render choice('Weight', settings.weight, [
    [400, 'Regular'],
    [500, 'Medium'],
    [700, 'Bold'],
  ], (v) => (settings.weight = v))}
  {@render choice('Focus letter', settings.focus, [
    ['color', 'Colour'],
    ['bold', 'Bold'],
    ['off', 'Off'],
  ], (v) => (settings.focus = v))}
  {@render toggle('Focus marks', settings.reticle, (v) => (settings.reticle = v), 'Two short lines above and below the focus letter.')}
  <label class="row col">
    <span class="line"><span class="label">Focus position</span><span class="value">{Math.round(settings.pivot * 100)}% from the left</span></span>
    <input type="range" min="0.3" max="0.55" step="0.01" bind:value={settings.pivot} />
  </label>
</section>

<section>
  <h3>The sentence around the word</h3>
  {@render toggle('Show the sentence', settings.context, (v) => (settings.context = v), 'Words already read sit faintly on the left, the next ones on the right.')}
  {#if settings.context}
    <div transition:fade={{ duration: t(180), easing: ease }}>
    <label class="row col">
      <span class="line"><span class="label">Distance from the word</span><span class="value">{settings.contextGap.toFixed(1)}</span></span>
      <input type="range" min="1" max="8" step="0.5" bind:value={settings.contextGap} />
    </label>
    <label class="row col">
      <span class="line"><span class="label">Size</span><span class="value">{Math.round(settings.contextScale * 100)}%</span></span>
      <input type="range" min="0.3" max="1" step="0.05" bind:value={settings.contextScale} />
    </label>
    {@render choice('Movement', settings.motion, [
      ['slide', 'Slide'],
      ['fade', 'Fade'],
      ['off', 'None'],
    ], (v) => (settings.motion = v))}
    </div>
  {/if}
</section>

<section>
  <h3>Text and page panel</h3>
  {@render choice('Show the panel', settings.trail, [
    ['always', 'Always'],
    ['pause', 'When paused'],
    ['off', 'Never'],
  ], (v) => (settings.trail = v))}
  {#if settings.trail !== 'off'}
    <div transition:fade={{ duration: t(180), easing: ease }}>
      {@render choice('Place it', settings.trailPos, [
        ['above', 'Above the word'],
        ['below', 'Below the word'],
      ], (v) => (settings.trailPos = v))}
    </div>
  {/if}
  <p class="hint">The panel shows the chapter text with what you have read; for PDFs it can show the printed page instead.</p>
</section>

<section>
  <h3>Keyboard</h3>
  {@render toggle('Keyboard shortcuts', settings.keys, (v) => (settings.keys = v))}
  {#if settings.keys}
    <dl class="keys" transition:fade={{ duration: t(180), easing: ease }}>
      <dt>Space</dt><dd>Read or pause</dd>
      <dt>← →</dt><dd>Sentence back or ahead</dd>
      <dt>Shift ← →</dt><dd>One word back or ahead</dd>
      <dt>↑ ↓</dt><dd>Faster or slower by 10 wpm (Shift: 50)</dd>
      <dt>C</dt><dd>Contents</dd>
      <dt>O</dt><dd>Settings</dd>
      <dt>Esc</dt><dd>Close, pause, or back to the library</dd>
    </dl>
  {/if}
</section>

<button class="reset" onclick={resetSettings}>Reset all settings</button>

<style>
  section {
    padding: 14px 0 6px;
    border-bottom: 1px solid var(--edge);
  }

  h3 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--haze);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 0;
  }

  .row.col {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label {
    font-size: 15px;
  }

  .value {
    font-size: 15px;
    color: var(--lamp);
    font-variant-numeric: tabular-nums;
  }

  .hint {
    font-size: 13px;
    color: var(--haze);
    line-height: 1.4;
    margin: 0;
  }

  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 3px;
    border-radius: 12px;
    background: var(--raised);
  }

  .seg button {
    flex: 1;
    min-width: max-content;
    padding: 8px 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    font-size: 14px;
  }

  .seg button.on {
    background: var(--ink);
    box-shadow: 0 0 0 1px var(--edge);
    font-weight: 600;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--lamp);
  }

  .switch {
    appearance: none;
    flex: none;
    width: 46px;
    height: 28px;
    margin: 0;
    border-radius: 14px;
    background: var(--raised);
    box-shadow: inset 0 0 0 1px var(--edge);
    position: relative;
    transition: background 0.2s var(--ease);
  }

  .switch::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--paper);
    transition: transform 0.2s var(--ease);
  }

  .switch:checked {
    background: var(--lamp);
  }

  .switch:checked::after {
    transform: translateX(18px);
    background: var(--ink);
  }

  .keys {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    margin: 4px 0 10px;
    font-size: 14px;
  }

  dt {
    color: var(--lamp);
    font-variant-numeric: tabular-nums;
  }

  dd {
    margin: 0;
    color: var(--haze);
  }

  .reset {
    margin: 20px 0 8px;
    padding: 12px 16px;
    border: 1px solid var(--edge);
    border-radius: 12px;
    background: transparent;
    width: 100%;
  }

  @media (hover: hover) {
    .seg button:not(.on):hover {
      background: color-mix(in srgb, var(--paper) 7%, transparent);
    }

    .reset:hover {
      background: color-mix(in srgb, var(--paper) 6%, transparent);
    }
  }
</style>
