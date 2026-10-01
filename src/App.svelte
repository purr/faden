<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { ease, t } from './lib/motion';
  import { registerSW } from 'virtual:pwa-register';
  import Library from './components/Library.svelte';
  import Reader from './components/Reader.svelte';
  import DebugPanel from './components/DebugPanel.svelte';
  import { copyReport, debug } from './lib/debug.svelte';
  import { loadSettings, saveSettings, settings } from './lib/settings.svelte';
  import { app, isStandalone, refreshBooks, refreshStorage, setUpdater } from './lib/app.svelte';

  let ready = $state(false);
  let systemDark = $state(matchMedia('(prefers-color-scheme: dark)').matches);

  onMount(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = (e: MediaQueryListEvent) => (systemDark = e.matches);
    mq.addEventListener('change', onScheme);
    void (async () => {
      await loadSettings();
      await refreshBooks();
      ready = true;
      // home screen apps get persistent storage on request; a plain browser tab may be refused
      await refreshStorage(isStandalone());
    })();
    setUpdater(
      registerSW({
        immediate: true,
        onOfflineReady: () => (app.offlineReady = true),
        onNeedRefresh: () => (app.updateReady = true),
      }),
    );
    if (navigator.serviceWorker?.controller) app.offlineReady = true;
    return () => mq.removeEventListener('change', onScheme);
  });

  $effect(() => {
    JSON.stringify(settings);
    if (ready) saveSettings();
  });

  let copied = $state(false);
  async function copyDetails() {
    copied = await copyReport();
    // the clipboard was refused: the panel shows the text to copy by hand
    if (!copied) app.debugOpen = true;
  }

  const theme = $derived(settings.theme === 'auto' ? (systemDark ? 'night' : 'day') : settings.theme);

  $effect(() => {
    document.documentElement.dataset.theme = theme;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', bg);
  });
</script>

{#if ready}
  <!-- the reader slides in from the right over the library, like a pushed screen on ios, and slides
       back out; both screens are opaque, so they never show through each other -->
  {#if app.openId}
    {#key app.openId}
      <div class="screen front" in:fly|global={{ x: 48, duration: t(320), easing: ease, opacity: 1 }} out:fly|global={{ x: 48, duration: t(240), easing: ease, opacity: 0 }}>
        <Reader bookId={app.openId} onexit={() => (app.openId = null)} />
      </div>
    {/key}
  {:else}
    <div class="screen" in:fade={{ duration: t(200) }}>
      <Library />
    </div>
  {/if}
{/if}

{#if debug.unseen > 0 && !app.debugOpen}
  <div class="errbar" role="alert" transition:fade={{ duration: t(160) }}>
    <span>Something went wrong.</span>
    <button class="copy" onclick={copyDetails}>{copied ? 'Copied' : 'Copy details'}</button>
    <button class="more" onclick={() => (app.debugOpen = true)}>Show</button>
    <button class="dismiss" onclick={() => ((debug.unseen = 0), (copied = false))} aria-label="Dismiss">×</button>
  </div>
{/if}

{#if app.debugOpen}
  <DebugPanel />
{/if}

<style>
  .screen {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--ink);
  }

  /* the reader stays on top while it slides out over the returning library */
  .front {
    z-index: 1;
  }

  /* centred between 8px margins rather than at left: 50%, which would squeeze it to its narrowest width;
     on a 320px screen the buttons wrap below the text instead of running off the edge */
  .errbar {
    position: fixed;
    z-index: 30;
    left: 8px;
    right: 8px;
    top: calc(8px + env(safe-area-inset-top));
    width: fit-content;
    margin: 0 auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    padding: 6px 6px 6px 14px;
    border: 1px solid var(--danger);
    border-radius: 14px;
    background: var(--surface);
    font-size: 14px;
  }

  .errbar span {
    flex: 1 0 auto;
    white-space: nowrap;
  }

  .errbar button {
    white-space: nowrap;
    min-height: 36px;
    padding: 6px 12px;
    border: 1px solid var(--edge);
    border-radius: 10px;
    background: transparent;
    font-size: 14px;
  }

  .errbar .copy {
    border-color: var(--danger);
    color: var(--danger);
  }

  .errbar .dismiss {
    min-width: 36px;
    padding: 6px;
    border: 0;
    font-size: 18px;
    line-height: 1;
  }

  @media (hover: hover) {
    .errbar button:hover {
      background: color-mix(in srgb, var(--paper) 7%, transparent);
    }
  }
</style>
