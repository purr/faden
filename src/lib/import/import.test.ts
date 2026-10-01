import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseEpub } from './epub';
import { parseText } from './text';
import { layoutPdf, parseRanges } from './pdflayout';
import { collapseSpacing } from './spacing';

const xhtml = (body: string) =>
  `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title></head><body>${body}</body></html>`;

function epub(): ArrayBuffer {
  const files = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
    ),
    'OEBPS/content.opf': strToU8(`<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata><dc:title>Testbuch</dc:title><dc:creator>A. Autor</dc:creator><dc:language>de</dc:language></metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="toc" href="text/toc.xhtml" media-type="application/xhtml+xml"/>
        <item id="c1" href="text/ch%201.xhtml" media-type="application/xhtml+xml"/>
        <item id="gl" href="text/glossar.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="toc"/><itemref idref="c1"/><itemref idref="gl"/></spine>
    </package>`),
    'OEBPS/nav.xhtml': strToU8(
      xhtml(`<nav epub:type="toc"><ol>
        <li><a href="text/toc.xhtml">Inhaltsverzeichnis</a></li>
        <li><a href="text/ch%201.xhtml#a">Erstes Kapitel</a></li>
        <li><a href="text/ch%201.xhtml#b">Zweites Kapitel</a></li>
        <li><a href="text/glossar.xhtml">Glossar</a></li>
      </ol></nav>`),
    ),
    'OEBPS/text/toc.xhtml': strToU8(xhtml('<h1>Inhalt</h1><p>Erstes Kapitel 1</p>')),
    'OEBPS/text/ch 1.xhtml': strToU8(
      xhtml('<h2 id="a">Erstes Kapitel</h2><p>Es war <em>einmal</em> ein Haus.<sup><a epub:type="noteref" href="#n1">1</a></sup></p><h2 id="b">Zweites Kapitel</h2><p>Dann kam der Regen.</p>'),
    ),
    'OEBPS/text/glossar.xhtml': strToU8(xhtml('<h1>Glossar</h1><p>Haus: ein Gebäude.</p>')),
  };
  const z = zipSync(files);
  return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}

describe('epub', () => {
  const book = parseEpub(epub(), 'test.epub');
  it('reads metadata', () => {
    expect([book.title, book.author, book.lang]).toEqual(['Testbuch', 'A. Autor', 'de']);
  });
  it('splits a file at the chapters its table of contents points into', () => {
    expect(book.sections.map((s) => s.meta.title)).toEqual(['Inhaltsverzeichnis', 'Erstes Kapitel', 'Zweites Kapitel', 'Glossar']);
  });
  it('tags front and back matter for skipping', () => {
    expect(book.sections.map((s) => s.meta.tag)).toEqual(['contents', null, null, 'glossary']);
  });
  it('keeps emphasis and drops footnote markers', () => {
    const p = book.sections[1].paras[1];
    expect(p.t).toBe('Es war einmal ein Haus.');
    expect(p.em).toEqual([{ s: 7, e: 13, k: 1 }]);
  });
});

describe('markdown', () => {
  it('turns headings into sections and keeps emphasis', () => {
    const b = parseText('# One\n\nSome **bold** and *it* text, 2 * 3 * 4.\n\n# Two\n\n- item\n', 'notes.md');
    expect(b.sections.map((s) => s.meta.title)).toEqual(['One', 'Two']);
    const p = b.sections[0].paras[1];
    expect(p.t).toBe('Some bold and it text, 2 * 3 * 4.');
    expect(p.em).toEqual([
      { s: 5, e: 9, k: 2 },
      { s: 14, e: 16, k: 1 },
    ]);
  });
});

describe('letter spacing', () => {
  it('joins letter-spaced words and marks them as emphasis', () => {
    expect(collapseSpacing('finden. G l e i c h e s')).toEqual({ t: 'finden. Gleiches', spans: [[8, 16]] });
    expect(collapseSpacing('i n', true).t).toBe('in');
    expect(collapseSpacing('2 0 4 , 5 7 9 f .', true).t).toBe('204, 579 f.');
  });
  it('leaves ordinary one-letter words alone', () => {
    expect(collapseSpacing('a b').t).toBe('a b');
    expect(collapseSpacing('Ich sah a b und c.').t).toBe('Ich sah a b und c.');
  });
});

describe('pdf layout', () => {
  const run = (str: string, y: number, h = 10, x = 72) => ({ str, x, y, w: str.length * 5, h, eol: true });
  it('joins hyphenated line ends and drops running headers and page numbers', () => {
    const page = (n: number, lines: string[]) => [run('My Book Title', 780), ...lines.map((l, i) => run(l, 700 - i * 12)), run(String(n), 40)];
    const { paras } = layoutPdf([
      page(1, ['The infor-', 'mation was', 'clear.']),
      page(2, ['A Nord-', 'Süd line.']),
      page(3, ['Third page.']),
    ]);
    expect(paras.map((p) => p.t)).toEqual(['The information was clear.', 'A Nord-Süd line.', 'Third page.']);
  });
  it('keeps chapter lines that start with a number, but drops headers carrying the page number', () => {
    // pdf page i+1 prints page number i-27 (front matter before page 1), header line "<title> <n>"
    const pages = Array.from({ length: 6 }, (_, i) => [
      run(`Im Elternhaus ${i - 27}`, 780),
      ...(i === 3 ? [run('1. Kapitel', 740)] : []),
      run('Text der Seite, die weitergeht und nicht endet.', 700),
    ]);
    const { paras } = layoutPdf(pages);
    expect(paras.some((p) => p.t.startsWith('Im Elternhaus'))).toBe(false);
    expect(paras.find((p) => p.t === '1. Kapitel')?.h).toBe(2);
  });
  it('does not take a big first letter for a heading', () => {
    const page = [{ ...run('A', 700, 20), w: 13, eol: false }, { str: 'ls glückliche Bestimmung gilt es mir heute', x: 85, y: 700, w: 300, h: 10, eol: true }, run('daß das Schicksal mir zum Geburtsort gerade', 688)];
    const { paras } = layoutPdf([page]);
    expect(paras[0].t).toBe('Als glückliche Bestimmung gilt es mir heute daß das Schicksal mir zum Geburtsort gerade');
    expect(paras[0].h).toBeUndefined();
  });
  it('reads page ranges', () => {
    expect([...parseRanges('1-3, 7 ; 9 – 10')]).toEqual([1, 2, 3, 7, 9, 10]);
  });
});
