import { getKV, setKV } from './db';
import type { SkipTag } from './types';

export type Theme = 'auto' | 'night' | 'day';
export type FontChoice = 'mono' | 'sans' | 'serif';
export type FocusStyle = 'color' | 'bold' | 'off';
export type Motion = 'slide' | 'fade' | 'off';
export type ResumeMode = 'smart' | 'sentence' | 'words' | 'exact';
export type TrailMode = 'pause' | 'always' | 'off';
export type TrailPos = 'above' | 'below';
export type PanelView = 'text' | 'page';

export interface Settings {
  v: number;
  wpm: number;
  pauses: number;
  longWords: number;
  group: boolean;
  splitHyphens: boolean;
  honest: boolean;
  ramp: boolean;
  resume: ResumeMode;
  theme: Theme;
  font: FontChoice;
  // 0 picks a size for the screen
  size: number;
  weight: number;
  focus: FocusStyle;
  reticle: boolean;
  context: boolean;
  // distance between the word and its sentence, in character widths of the reading font
  contextGap: number;
  contextScale: number;
  motion: Motion;
  // horizontal fixation point as a share of the stage width
  pivot: number;
  trail: TrailMode;
  trailPos: TrailPos;
  // what the panel next to the stage shows: the text, or (for pdfs) the printed page
  view: PanelView;
  autoSkip: Record<SkipTag, boolean>;
  keys: boolean;
}

// bump when a stored shape can no longer be read; older stored settings are then dropped
const VERSION = 2;

const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULTS: Settings = {
  v: VERSION,
  // comprehension holds up to ~300–350 wpm and drops above (di nocera 2018, kosch 2020)
  wpm: 300,
  pauses: 1,
  longWords: 1,
  group: true,
  splitHyphens: true,
  honest: true,
  ramp: true,
  resume: 'smart',
  theme: 'auto',
  font: 'mono',
  size: 0,
  weight: 400,
  focus: 'color',
  reticle: true,
  context: true,
  contextGap: 2,
  // the sentence uses the reading word's own size and font, only fainter
  contextScale: 1,
  motion: reducedMotion ? 'fade' : 'slide',
  pivot: 0.42,
  trail: 'always',
  trailPos: 'above',
  view: 'text',
  autoSkip: {
    contents: true,
    index: true,
    glossary: true,
    references: true,
    credits: true,
    notes: true,
    cover: true,
    intro: false,
  },
  keys: true,
};

export const settings: Settings = $state(structuredClone(DEFAULTS));

export async function loadSettings() {
  const stored = await getKV<Settings>('settings');
  if (!stored || stored.v !== VERSION) return;
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    if (k === 'autoSkip') Object.assign(settings.autoSkip, stored.autoSkip);
    else if (typeof stored[k] === typeof DEFAULTS[k]) (settings as unknown as Record<string, unknown>)[k] = stored[k];
  }
}

let timer = 0;
export function saveSettings() {
  clearTimeout(timer);
  const snap = $state.snapshot(settings);
  timer = window.setTimeout(() => void setKV('settings', snap), 300);
}

export function resetSettings() {
  Object.assign(settings, structuredClone(DEFAULTS));
}

export const FONT_STACKS: Record<FontChoice, string> = {
  mono: '"Atkinson Hyperlegible Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  sans: '"Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: 'ui-serif, "New York", Charter, Georgia, "Times New Roman", serif',
};

// phones are held closer than laptops: these keep the x-height near 0.4–0.5° of visual angle
export function autoSize(width: number): number {
  return width < 600 ? 34 : width < 1100 ? 42 : 48;
}
