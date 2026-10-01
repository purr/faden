// emphasis range inside a paragraph, utf-16 offsets; k: 1 italic, 2 bold
export interface Emph {
  s: number;
  e: number;
  k: 1 | 2;
}

export interface Para {
  t: string;
  // heading level 1–6, absent for body text
  h?: number;
  em?: Emph[];
  // 1-based pdf page the paragraph starts on
  pg?: number;
}

export type SkipTag =
  | 'contents'
  | 'index'
  | 'glossary'
  | 'references'
  | 'credits'
  | 'notes'
  | 'intro'
  | 'cover';

export interface SectionMeta {
  title: string;
  tag: SkipTag | null;
  skip: boolean;
  words: number;
  // pdf only: first and last page, and words per page (index 0 = first page)
  pages?: [number, number];
  pageWords?: number[];
}

export type BookKind = 'pdf' | 'epub' | 'text';

export interface Position {
  // section index and source-word index inside that section
  s: number;
  w: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  lang: string;
  kind: BookKind;
  fileName: string;
  size: number;
  sections: SectionMeta[];
  // pdf pages the reader chose to skip, e.g. "1-12, 240-260"
  skipPages: string;
  // pdf pages that look like a table of contents or an index
  suggestedSkipPages: string;
  pos: Position;
  addedAt: number;
  openedAt: number;
  parser: number;
}

export interface ParsedBook {
  title: string;
  author: string;
  lang: string;
  kind: BookKind;
  sections: { meta: SectionMeta; paras: Para[] }[];
  suggestedSkipPages: string;
}
