<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { ease, t } from './lib/motion';
  import { registerSW } from 'virtual:pwa-register';
  import Library from './components/Library.svelte';
  import Reader from './components/Reader.svelte';
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

  const theme = $derived(settings.theme === 'auto' ? (systemDark ? 'night' : 'day') : settings.theme);

  $effect(() => {
    document.documentElement.dataset.theme = theme;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', bg);
  });
</script>

{#if ready}
  <!-- the reader slides in over the library, like a pushed screen on ios; going back reverses it -->
  {#if app.openId}
    {#key app.openId}
      <div class="screen" in:fly={{ x: 48, duration: t(360), easing: ease, opacity: 0 }} out:fly={{ x: 48, duration: t(260), easing: ease, opacity: 0 }}>
        <Reader bookId={app.openId} onexit={() => (app.openId = null)} />
      </div>
    {/key}
  {:else}
    <div class="screen" in:fade={{ duration: t(260), delay: t(80) }} out:fade={{ duration: t(160) }}>
      <Library />
    </div>
  {/if}
{/if}

<style>
  .screen {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
</style>
