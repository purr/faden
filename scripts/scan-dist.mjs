// dist/ is published as it is, so it must carry nothing from the machine that built it: the home folder (which names
// the user), the project folder, the user name, or any other absolute path. `npm run deploy` runs this between build
// and publish. a false alarm stops the deploy with the line it matched; a miss would publish the path
import { readdirSync, readFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { extname, join } from 'node:path';

const DIST = 'dist';
// fonts and images are skipped: their bytes match the patterns by chance
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.map', '.json', '.webmanifest', '.svg', '.txt', '.xml']);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// a path separator as code and source maps spell it: \ or / or json-escaped \\ or \/
const SEP = String.raw`(?:\\\\|\\\/|\\|\/)`;
// a folder name: no separators, quotes, spaces or characters windows forbids. at least two characters, so code like
// `case r:\n\n` in a source map is not taken for "r:\n\". folders with spaces are caught only as this machine's own
// home and project folders below: allowing spaces here matches ordinary source text
const DIR = String.raw`[^\\\/"'\s:*?<>|]{2,}`;

// this machine's home and project folders in every spelling (any case, any separator), and the user's name as a word
const parts = (p) => p.split(/[\\/]+/).filter(Boolean).map(escape);
const local = [homedir(), process.cwd()].map((p) => parts(p).join(SEP));
const name = userInfo().username;

const PATTERNS = [
  new RegExp(local.join('|'), 'gi'),
  new RegExp(String.raw`(?<![\p{L}\p{N}_])${escape(name)}(?![\p{L}\p{N}_])`, 'giu'),
  // any drive path with a folder ("C:\Users\", "e:/work/", "D:\\x\\"). network shares ("\\server\share") are left
  // out: in source maps that shape is everywhere (escaped backticks, "\\u00C0")
  new RegExp(String.raw`(?<![A-Za-z0-9])[A-Za-z]:${SEP}${DIR}${SEP}`, 'g'),
  // files in home folders on macos and linux, and in root's. a bare home ("/home/web_user", pdf.js's emscripten
  // default) names no file, so a further separator is required
  new RegExp(String.raw`${SEP}(?:Users|home)${SEP}${DIR}${SEP}|(?<![\w.-])\/root\/`, 'g'),
];

const found = new Set();
for (const rel of readdirSync(DIST, { recursive: true })) {
  if (!TEXT.has(extname(rel))) continue;
  const text = readFileSync(join(DIST, rel), 'utf8');
  for (const re of PATTERNS)
    for (const m of text.matchAll(re)) found.add(`${join(DIST, rel)}: …${text.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ')}…`);
}

if (found.size) {
  console.error(`scan-dist: the build contains local paths or the user name, so nothing was published:\n${[...found].slice(0, 20).join('\n')}`);
  process.exit(1);
}
console.log('scan-dist: no local paths or user name in the build');
