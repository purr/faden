import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Book, Para } from './types';

interface Schema extends DBSchema {
  books: { key: string; value: Book };
  // paragraphs of one section, keyed "<book id>/<section index>"
  content: { key: string; value: Para[] };
  // the original file, kept so a newer parser can re-read the book
  files: { key: string; value: { name: string; type: string; data: ArrayBuffer } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  dbp ??= openDB<Schema>('faden', 1, {
    upgrade(d) {
      d.createObjectStore('books', { keyPath: 'id' });
      d.createObjectStore('content');
      d.createObjectStore('files');
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

const key = (id: string, s: number) => `${id}/${s}`;

export async function listBooks(): Promise<Book[]> {
  const books = await (await db()).getAll('books');
  return books.sort((a, b) => b.openedAt - a.openedAt);
}

export async function getBook(id: string): Promise<Book | undefined> {
  return (await db()).get('books', id);
}

export async function putBook(book: Book) {
  await (await db()).put('books', plain(book));
}

export async function storeBook(book: Book, sections: Para[][], file: { name: string; type: string; data: ArrayBuffer }) {
  const tx = (await db()).transaction(['books', 'content', 'files'], 'readwrite');
  await Promise.all([
    tx.objectStore('books').put(plain(book)),
    ...sections.map((paras, s) => tx.objectStore('content').put(paras, key(book.id, s))),
    tx.objectStore('files').put(file, book.id),
    tx.done,
  ]);
}

// re-parsed content replaces the old sections; stale section keys past the new count are removed
export async function replaceContent(book: Book, oldCount: number, sections: Para[][]) {
  const tx = (await db()).transaction(['books', 'content'], 'readwrite');
  const content = tx.objectStore('content');
  const ops: Promise<unknown>[] = sections.map((paras, s) => content.put(paras, key(book.id, s)));
  for (let s = sections.length; s < oldCount; s++) ops.push(content.delete(key(book.id, s)));
  ops.push(tx.objectStore('books').put(plain(book)), tx.done);
  await Promise.all(ops);
}

export async function loadSection(id: string, s: number): Promise<Para[]> {
  const paras = await (await db()).get('content', key(id, s));
  if (!paras) throw new Error(`library: section ${s} of book ${id} is missing from storage`);
  return paras;
}

export async function getFile(id: string) {
  return (await db()).get('files', id);
}

export async function deleteBook(book: Book) {
  const tx = (await db()).transaction(['books', 'content', 'files'], 'readwrite');
  await Promise.all([
    tx.objectStore('books').delete(book.id),
    ...book.sections.map((_, s) => tx.objectStore('content').delete(key(book.id, s))),
    tx.objectStore('files').delete(book.id),
    tx.done,
  ]);
}

export async function getKV<T>(k: string): Promise<T | undefined> {
  return (await (await db()).get('kv', k)) as T | undefined;
}

export async function setKV(k: string, v: unknown) {
  await (await db()).put('kv', v, k);
}

// svelte state proxies can't be structured-cloned into indexeddb
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
