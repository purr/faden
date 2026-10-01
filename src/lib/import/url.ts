// a link is downloaded into a file with a name and a type, and then imported like any other file

export interface Download {
  name: string;
  type: string;
  data: ArrayBuffer;
}

// progress is NaN while the size is unknown
export interface FetchStatus {
  step: 'download' | 'reader';
  progress: number;
}

// most sites forbid other web apps from reading their pages; this service reads them and answers to any app.
// it sees the address it is asked for, which is why the import form says so
export const READER = 'https://r.jina.ai/';

const WIKI = /^(?:([a-z0-9-]+)\.)?(?:m\.)?(wikipedia|wikisource|wikibooks|wikiquote|wikivoyage|wikinews)\.org$/i;

// "example.com/x", "http://…" and "https://…" all mean the https address: an app served over https may not load plain http
export function normalizeUrl(input: string): URL {
  const s = input.trim();
  let u: URL | null = null;
  try {
    u = new URL(`https://${s.replace(/^https?:\/\//i, '')}`);
  } catch {
    // not parseable as an address: reported just below
  }
  // browsers refuse to download such an address, and it must not reach the reader service, which would see the password
  if (u?.username || u?.password) throw new Error('link: addresses with a user name or password (user:pass@…) cannot be imported.');
  if (!u || !u.hostname.includes('.')) throw new Error(`link: "${s}" is not a web address.`);
  u.hash = '';
  return u;
}

// wikipedia and its sister sites refuse other apps on /wiki/ pages, but their page api serves the same article to anyone
export function directUrl(u: URL): string {
  const wiki = WIKI.exec(u.hostname);
  const page = /^\/wiki\/(.+)$/.exec(u.pathname);
  if (!wiki || !page) return u.href;
  const host = `${wiki[1] ? `${wiki[1]}.` : ''}${wiki[2]}.org`.toLowerCase();
  // a permalink (?oldid=) names one revision, which may differ from the current article
  const oldid = u.searchParams.get('oldid');
  if (oldid && /^\d+$/.test(oldid)) return `https://${host}/w/rest.php/v1/revision/${oldid}/html`;
  // the path is already percent-encoded; subpages ("Faust/Zueignung") are one title, so only the slash is escaped
  return `https://${host}/w/rest.php/v1/page/${page[1].replaceAll('/', '%2F')}/html`;
}

const status = (res: Response) => `${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;

async function readBody(res: Response, onProgress: (p: number) => void): Promise<ArrayBuffer> {
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return res.arrayBuffer();
  // a reader loop rather than `for await`, which older safari lacks on streams
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    // compressed transfers report the compressed length, so the count can pass it
    onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out.buffer;
}

function startsWith(bytes: Uint8Array, sig: string, at = 0): boolean {
  for (let i = 0; i < sig.length; i++) if (bytes[at + i] !== sig.charCodeAt(i)) return false;
  return true;
}

const headOf = (data: ArrayBuffer) => new Uint8Array(data, 0, Math.min(data.byteLength, 1024));

// the content decides the type; servers often label pdfs and epubs as application/octet-stream
export function typeOf(data: ArrayBuffer, header: string | null): string {
  const head = headOf(data);
  const text = new TextDecoder('latin1').decode(head);
  const type = (header ?? '').split(';')[0].trim().toLowerCase();
  // a pdf may have bytes before its "%PDF-" line, but a text that merely mentions that line stays text
  if (/^\s*%PDF-/.test(text) || (!type.startsWith('text/') && text.includes('%PDF-'))) return 'application/pdf';
  // an epub is a zip whose first entry names its type; some packers put an extra field before that name's content
  if (startsWith(head, 'PK\x03\x04'))
    return text.includes('application/epub+zip') || type === 'application/epub+zip' ? 'application/epub+zip' : 'application/zip';
  if (type === 'application/xhtml+xml' || /^(\xEF\xBB\xBF)?\s*(<!doctype html|<html)/i.test(text)) return 'text/html';
  return type || 'application/octet-stream';
}

// stored text is always utf-8, because the parsers (and a later re-read) decode it as utf-8. text in another charset
// (older german archives: iso-8859-1, windows-1252) is converted once here, while the charset is still known
export function asUtf8(data: ArrayBuffer, type: string, header: string | null): ArrayBuffer {
  const fromHeader = /charset\s*=\s*["']?([\w:.-]+)/i.exec(header ?? '')?.[1];
  const fromMeta = type === 'text/html' ? /<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i.exec(new TextDecoder('latin1').decode(headOf(data)))?.[1] : undefined;
  const label = fromHeader ?? fromMeta;
  if (!label || /^utf-?8$/i.test(label)) return data;
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label);
  } catch {
    // a charset name no browser knows is ignored, as browsers ignore it when they show the page
    return data;
  }
  return new TextEncoder().encode(decoder.decode(data)).buffer as ArrayBuffer;
}

const EXTS: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'application/epub+zip': ['epub'],
  'text/html': ['html', 'htm'],
  'text/markdown': ['md', 'markdown'],
  // raw markdown is usually served as plain text
  'text/plain': ['txt', 'md', 'markdown', 'text'],
};

function lastSegment(u: URL): string {
  const raw = u.pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    // a stray "%" or a non-utf-8 escape ("F%FCr_Elise.pdf"): the name is only a label, so it stays as written
    return raw;
  }
}

// the file name carries the type, because a stored book is re-read later from its name and type alone
export function fileName(u: URL, type: string): string {
  const last = lastSegment(u) || u.hostname;
  const ext = last.includes('.') ? last.slice(last.lastIndexOf('.') + 1).toLowerCase() : '';
  const exts = EXTS[type];
  return exts && !exts.includes(ext) ? `${last}.${exts[0]}` : last;
}

interface ReaderReply {
  data?: { title?: string; content?: string; httpStatus?: number } | null;
  message?: string;
  readableMessage?: string;
}

async function viaReader(u: URL): Promise<Download> {
  let res: Response;
  try {
    res = await fetch(READER + u.href, { headers: { Accept: 'application/json' }, referrerPolicy: 'no-referrer' });
  } catch (e) {
    throw new Error(`link: neither ${u.hostname} nor the reader service could be reached (${(e as Error).message}).`);
  }
  if (res.status === 429) throw new Error('link: the reader service takes about 20 links a minute. Wait a minute, then try again.');
  // a reply that is not json is reported below by its http status
  const reply = (await res.json().catch(() => null)) as ReaderReply | null;
  const data = reply?.data;
  // the service reads web pages and pdfs but refuses epubs and other files; those can only come in as a downloaded file
  if (!res.ok || !data)
    throw new Error(
      `link: the reader service could not read ${u.href} (${reply?.readableMessage ?? reply?.message ?? status(res)}). If the address is right, download the file and add it with “Import a book”.`,
    );
  if (data.httpStatus && data.httpStatus >= 400) throw new Error(`link: ${u.hostname} answered ${data.httpStatus} for ${u.href}.`);
  if (!data.content?.trim()) throw new Error(`link: ${u.href} has no readable text.`);
  const title = data.title?.trim();
  // the service lifts the page's headline out of the text; it goes back in so the reading starts with it
  const firstHeading = /^#{1,6}\s+(.*)$/m.exec(data.content)?.[1].trim();
  const text = !title || firstHeading === title ? data.content : `# ${title}\n\n${data.content}`;
  // a plain file has no headline and is named as its download would be
  const name = `${title || lastSegment(u).replace(/\.[^.]+$/, '') || u.hostname}.md`;
  return { name, type: 'text/markdown', data: new TextEncoder().encode(text).buffer as ArrayBuffer };
}

export async function fetchBook(input: string, onStatus: (s: FetchStatus) => void): Promise<Download> {
  const u = normalizeUrl(input);
  if (!navigator.onLine) throw new Error('link: this device is offline. Importing from a link needs the internet.');
  const direct = directUrl(u);
  onStatus({ step: 'download', progress: NaN });
  let res: Response;
  try {
    res = await fetch(direct, { referrerPolicy: 'no-referrer' });
  } catch {
    // the browser hides why a download failed: usually the site forbids other apps from reading it, sometimes it is
    // unreachable. the reader service gets past the first and names the second
    onStatus({ step: 'reader', progress: NaN });
    return viaReader(u);
  }
  if (!res.ok) throw new Error(`link: ${u.hostname} answered ${status(res)} for ${u.href}.`);
  const data = await readBody(res, (progress) => onStatus({ step: 'download', progress }));
  const header = res.headers.get('content-type');
  const type = typeOf(data, header);
  return { name: fileName(u, type), type, data: type.startsWith('text/') ? asUtf8(data, type, header) : data };
}
