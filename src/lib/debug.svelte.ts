import { getKV, setKV } from './db';
import { isStandalone } from './app.svelte';

export interface LogEntry {
  at: string;
  where: string;
  message: string;
  stack: string;
}

// errors are kept across restarts, so a crash on the phone can still be copied afterwards
const KEY = 'debug-log';
const MAX = 40;

export const debug = $state({
  entries: [] as LogEntry[],
  // errors since the user last dismissed the error bar
  unseen: 0,
});

// a failed save is only logged to the console: reporting it would save again, and with a broken IndexedDB
// (ios can lose its connection to it) that loops forever. the entries stay in memory and in the copyable report
function save() {
  setKV(KEY, $state.snapshot(debug.entries)).catch((e) => console.error('faden: the debug log could not be saved:', e));
}

// errors from earlier sessions come first; anything reported while loading is kept after them
export async function loadLog() {
  const stored = await getKV<LogEntry[]>(KEY);
  if (!Array.isArray(stored) || !stored.length) return;
  const early = debug.entries.length;
  debug.entries = [...stored, ...debug.entries].slice(-MAX);
  // an error reported while loading was saved without the older ones; the merged list replaces that
  if (early) save();
}

// for errors the screen already shows (with its own copy button): they only go into the report
export function report(where: string, err: unknown) {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  console.error(`faden: ${where}:`, err);
  debug.entries = [...debug.entries.slice(-(MAX - 1)), { at: new Date().toISOString(), where, message: e.message || String(err), stack: e.stack ?? '' }];
  save();
}

// errors nothing caught have no message on screen, so they also raise the error bar
function uncaught(where: string, err: unknown) {
  report(where, err);
  debug.unseen++;
}

export function clearLog() {
  debug.entries = [];
  debug.unseen = 0;
  save();
}

export function installErrorHandlers() {
  window.addEventListener('error', (ev) =>
    uncaught('uncaught error', ev.error ?? new Error(`${ev.message} (${ev.filename}:${ev.lineno}:${ev.colno})`)),
  );
  window.addEventListener('unhandledrejection', (ev) => uncaught('unhandled promise', ev.reason));
}

// everything needed to reproduce a problem: app build, device, and the recent errors with full stacks
export function debugReport(): string {
  const env = [
    `faden ${__APP_VERSION__}, built ${__BUILD_TIME__}`,
    `address ${location.href}`,
    `browser ${navigator.userAgent}`,
    `home screen app: ${isStandalone()}`,
    `screen ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`,
    `language ${navigator.language}`,
    `online: ${navigator.onLine}, offline cache active: ${!!navigator.serviceWorker?.controller}`,
  ];
  const errors = debug.entries.map((x, i) => `#${i + 1} ${x.at} [${x.where}] ${x.message}\n${x.stack}`).join('\n\n');
  return `${env.join('\n')}\n\nerrors (${debug.entries.length}):\n\n${errors || 'none'}`;
}

// copies the report; false when the browser refused, and the caller then shows the text to copy by hand
export async function copyReport(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(debugReport());
    return true;
  } catch {
    // clipboard access refused (old browser or no user gesture): reported to the caller via false
    return false;
  }
}
