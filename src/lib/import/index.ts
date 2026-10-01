import type { Book, Para, ParsedBook } from '../types';
import { settings } from '../settings.svelte';
import { parseEpub } from './epub';
import { parsePdf } from './pdf';
import { parseHtml, parseText } from './text';

// bump when parsing changes what a stored book contains; older books are re-read from their file
export const PARSER_VERSION = 2;

export const ACCEPT =
  '.pdf,.epub,.txt,.md,.markdown,.html,.htm,application/pdf,application/epub+zip,text/plain,text/markdown,text/html';

type Kind = 'pdf' | 'epub' | 'text' | 'html';

function kindOf(name: string, type: string): Kind {
  const ext = name.toLowerCase().replace(/^.*\./, '');
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (ext === 'epub' || type === 'application/epub+zip') return 'epub';
  if (ext === 'html' || ext === 'htm' || type === 'text/html') return 'html';
  if (['txt', 'md', 'markdown', 'text'].includes(ext) || type.startsWith('text/')) return 'text';
  if (['mobi', 'azw', 'azw3', 'kfx', 'prc'].includes(ext))
    throw new Error(`"${name}" is a Kindle file. Convert it to EPUB first (for example with Calibre), then import the EPUB.`);
  throw new Error(`"${name}" is not a PDF, EPUB, Markdown or text file.`);
}

export async function parseFile(data: ArrayBuffer, name: string, type: string, onProgress?: (p: number) => void): Promise<ParsedBook> {
  const kind = kindOf(name, type);
  if (kind === 'pdf') return parsePdf(data, name, onProgress);
  if (kind === 'epub') return parseEpub(data, name);
  const src = new TextDecoder('utf-8').decode(data);
  return kind === 'html' ? parseHtml(src, name) : parseText(src, name);
}

export function bookFrom(parsed: ParsedBook, file: { name: string; size: number }): { book: Book; contents: Para[][] } {
  const now = Date.now();
  const sections = parsed.sections.map((s) => ({ ...s.meta, skip: !!(s.meta.tag && settings.autoSkip[s.meta.tag]) }));
  const first = sections.findIndex((s) => !s.skip && s.words > 0);
  const book: Book = {
    id: crypto.randomUUID(),
    title: parsed.title,
    author: parsed.author,
    lang: parsed.lang,
    kind: parsed.kind,
    fileName: file.name,
    size: file.size,
    sections,
    skipPages: '',
    suggestedSkipPages: parsed.suggestedSkipPages,
    pos: { s: Math.max(0, first), w: 0 },
    addedAt: now,
    openedAt: now,
    parser: PARSER_VERSION,
  };
  return { book, contents: parsed.sections.map((s) => s.paras) };
}
