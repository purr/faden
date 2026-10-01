import { listBooks } from './db';
import type { Book } from './types';

export const app = $state({
  books: [] as Book[],
  openId: null as string | null,
  // the service worker has cached every file: the app now starts without a network
  offlineReady: false,
  // a newer version was downloaded and waits for a reload
  updateReady: false,
  // the browser promised not to evict the library under storage pressure
  persisted: false,
  usage: 0,
});

let updater: ((reload?: boolean) => Promise<void>) | null = null;

export function setUpdater(fn: (reload?: boolean) => Promise<void>) {
  updater = fn;
}

export function applyUpdate() {
  void updater?.(true);
}

export async function refreshBooks() {
  app.books = await listBooks();
}

export async function refreshStorage(askPersist = false) {
  const s = navigator.storage;
  if (!s) return;
  if (askPersist && s.persist && !(await s.persisted?.())) await s.persist();
  app.persisted = (await s.persisted?.()) ?? false;
  app.usage = (await s.estimate?.())?.usage ?? 0;
}

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
