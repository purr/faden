import type { Frame, Section } from './tokenize';
import { isJoiningScript } from './lang';

export interface StageOptions {
  wordFont: string;
  size: number;
  weight: number;
  focus: 'color' | 'bold' | 'off';
  reticle: boolean;
  context: boolean;
  contextGap: number;
  contextScale: number;
  motion: 'slide' | 'fade' | 'off';
  pivot: number;
  ctxFont: string;
}

// keeps arabic letters joined across the coloured focus letter in browsers that don't shape across spans
const ZWJ = '\u{200d}';
const MARGIN = 14;
// a word that would need to shrink below this to keep its focus letter on the mark is centred instead
const MIN_ANCHORED_SCALE = 0.55;
// baseline sits ~0.3 em below the centre of a line-height:1 box
const BASELINE = 0.3;

const el = (cls: string, tag = 'div') => {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
};

// the reading stage, drawn imperatively: it changes 5–20 times a second and must not wait for a framework
export class Stage {
  private word = el('word');
  private pre = el('pre', 'span');
  private orp = el('orp', 'span');
  private post = el('post', 'span');
  private rail = el('rail');
  private threadBehind = el('thread');
  private threadAhead = el('thread');
  private tickTop = el('tick');
  private tickBottom = el('tick');
  private cardEl = el('card');
  private cardTitle = el('card-title');
  private cardSub = el('card-sub');
  private spans: HTMLElement[] = [];
  private widths: number[] = [];
  private railKey = '';
  private secRef: Section | null = null;
  private secSerial = 0;
  private w = 0;
  private ch = 0;
  private space = 0;
  private o: StageOptions | null = null;
  private ctx = document.createElement('canvas').getContext('2d')!;
  private last: { sec: Section; fi: number; d: number; noFocus: boolean } | null = null;
  private ro: ResizeObserver;

  constructor(private root: HTMLElement) {
    root.classList.add('stage');
    this.word.setAttribute('aria-hidden', 'true');
    this.rail.setAttribute('aria-hidden', 'true');
    this.word.append(this.pre, this.orp, this.post);
    this.cardEl.append(this.cardTitle, this.cardSub);
    this.tickTop.classList.add('top');
    this.tickBottom.classList.add('bottom');
    root.append(this.threadBehind, this.threadAhead, this.rail, this.tickTop, this.tickBottom, this.word, this.cardEl);
    this.ro = new ResizeObserver(() => {
      this.w = root.clientWidth;
      this.redraw();
    });
    this.ro.observe(root);
    this.w = root.clientWidth;
  }

  destroy() {
    this.ro.disconnect();
    this.root.replaceChildren();
  }

  setOptions(o: StageOptions) {
    this.o = o;
    const s = this.root.style;
    s.setProperty('--word-font', o.wordFont);
    s.setProperty('--word-size', `${o.size}px`);
    s.setProperty('--word-weight', String(o.weight));
    s.setProperty('--ctx-font', o.ctxFont);
    s.setProperty('--ctx-size', `${o.size * o.contextScale}px`);
    this.root.classList.toggle('reticle-off', !o.reticle);
    this.root.classList.toggle('context-off', !o.context);
    this.root.classList.toggle('motion-fade', o.motion === 'fade');
    this.root.classList.toggle('focus-bold', o.focus === 'bold');
    this.root.classList.toggle('focus-off', o.focus === 'off');
    this.ctx.font = `${o.weight} ${o.size}px ${o.wordFont}`;
    this.ch = this.ctx.measureText('0').width || o.size * 0.6;
    this.railKey = '';
    this.redraw();
  }

  // fonts finished loading or the stage resized: lay the current frame out again without animation
  redraw() {
    if (!this.last || !this.o) return;
    const { sec, fi, d, noFocus } = this.last;
    this.railKey = '';
    this.render(sec, fi, d, noFocus, false);
  }

  get pivotX() {
    return this.w * (this.o?.pivot ?? 0.42);
  }

  render(sec: Section, fi: number, d: number, noFocus = false, animate = true) {
    const o = this.o;
    const f = sec.frames[fi];
    if (!o || !f) return;
    if (sec !== this.secRef) {
      this.secRef = sec;
      this.secSerial++;
    }
    this.last = { sec, fi, d, noFocus };
    this.cardEl.classList.remove('show');
    this.root.classList.remove('carding');

    const rtl = f.script === 'rtl';
    const j = isJoiningScript(f.text) ? ZWJ : '';
    const a = f.text.slice(0, f.o0);
    const b = f.text.slice(f.o0, f.o1);
    const c = f.text.slice(f.o1);
    this.word.dir = rtl ? 'rtl' : 'ltr';
    this.pre.textContent = a ? a + j : '';
    this.orp.textContent = (a ? j : '') + b + (c ? j : '');
    this.post.textContent = c ? j + c : '';
    this.word.classList.toggle('em-i', !!(f.em & 1));
    this.word.classList.toggle('em-b', !!(f.em & 2) || f.head > 0);
    this.word.classList.toggle('nofocus', noFocus);
    this.word.style.visibility = 'visible';

    // layout reads are not affected by transforms: measure, then place the focus letter on the mark
    const W = this.word.offsetWidth;
    const oc = this.orp.offsetLeft + this.orp.offsetWidth / 2;
    const px = this.w * (rtl ? 1 - o.pivot : o.pivot);
    let s = Math.min(1, (px - MARGIN) / Math.max(oc, 1), (this.w - MARGIN - px) / Math.max(W - oc, 1));
    let x: number;
    if (s < MIN_ANCHORED_SCALE) {
      s = Math.min(1, (this.w - 2 * MARGIN) / Math.max(W, 1));
      x = (this.w - W * s) / 2;
    } else x = px - oc * s;
    this.word.style.transform = `translate3d(${x}px, -50%, 0) scale(${s})`;

    const tick = `translate3d(${px - 1}px, 0, 0)`;
    this.tickTop.style.transform = tick;
    this.tickBottom.style.transform = tick;

    const ms = !animate || o.motion === 'off' ? 0 : Math.max(60, Math.min(180, d * 0.45));
    this.root.style.setProperty('--rail-ms', `${ms}ms`);
    if (o.context) this.layoutRail(sec, f, x, x + W * s, px, rtl, animate && o.motion !== 'off');
  }

  // the sentence around the word, small and faint, pushed toward the screen edges
  private layoutRail(sec: Section, f: Frame, wordLeft: number, wordRight: number, px: number, rtl: boolean, animate: boolean) {
    const o = this.o!;
    const sent = sec.words[f.w0].sent;
    const [s0, s1] = sec.sentences[sent];
    const key = `${this.secSerial}:${sent}`;
    if (key !== this.railKey) this.buildRail(sec, s0, s1, key, rtl, animate);

    const gap = o.contextGap * this.ch;
    // short and medium words leave the context in place; only long words push it outward
    const near = 2.5 * this.ch;
    const far = 5.5 * this.ch;
    const left = Math.min(wordLeft, px - (rtl ? far : near)) - gap;
    const right = Math.max(wordRight, px + (rtl ? near : far)) + gap;
    const sp = this.space;

    const xs: number[] = new Array(s1 - s0 + 1);
    const op: number[] = new Array(s1 - s0 + 1).fill(0);
    // reading direction decides which side holds the words already read
    const behindStart = rtl ? right : left;
    const aheadStart = rtl ? left : right;
    let edge = behindStart;
    for (let k = f.w0 - 1, r = 1; k >= s0; k--, r++) {
      const w = this.widths[k - s0];
      xs[k - s0] = rtl ? edge : edge - w;
      edge = rtl ? edge + w + sp : edge - w - sp;
      op[k - s0] = 0.34 * Math.pow(0.8, r - 1);
    }
    const behindFar = edge;
    edge = aheadStart;
    for (let k = f.w1 + 1, r = 1; k <= s1; k++, r++) {
      const w = this.widths[k - s0];
      xs[k - s0] = rtl ? edge - w : edge;
      edge = rtl ? edge - w - sp : edge + w + sp;
      op[k - s0] = 0.46 * Math.pow(0.8, r - 1);
    }
    const aheadFar = edge;
    for (let k = f.w0; k <= f.w1; k++) xs[k - s0] = px - this.widths[k - s0] / 2;

    for (let i = 0; i < this.spans.length; i++) {
      const x = xs[i];
      const visible = x + this.widths[i] > 0 && x < this.w;
      this.spans[i].style.transform = `translate3d(${x}px, -50%, 0)`;
      this.spans[i].style.opacity = visible ? String(Math.max(op[i], op[i] > 0 ? 0.06 : 0)) : '0';
    }
    this.thread(this.threadBehind, f.w0 > s0, behindStart, behindFar, sp);
    this.thread(this.threadAhead, f.w1 < s1, aheadStart, aheadFar, sp);
  }

  // a hairline under the context words: its length shows how much of the sentence is behind and ahead
  private thread(t: HTMLElement, on: boolean, from: number, to: number, sp: number) {
    const a = Math.max(0, Math.min(from, to + sp));
    const b = Math.min(this.w, Math.max(from, to - sp));
    const len = on ? Math.max(0, b - a) : 0;
    t.style.transform = `translate3d(${a}px, 0, 0) scaleX(${len})`;
  }

  private buildRail(sec: Section, s0: number, s1: number, key: string, rtl: boolean, animate: boolean) {
    const o = this.o!;
    for (const old of this.spans) {
      old.style.opacity = '0';
      setTimeout(() => old.remove(), 260);
    }
    this.ctx.font = `${o.weight} ${o.size * o.contextScale}px ${o.ctxFont}`;
    this.space = this.ctx.measureText(' ').width;
    this.spans = [];
    this.widths = [];
    for (let k = s0; k <= s1; k++) {
      const span = document.createElement('span');
      span.textContent = sec.words[k].text;
      span.dir = 'auto';
      span.style.transition = 'none';
      span.style.opacity = '0';
      const width = this.ctx.measureText(sec.words[k].text).width;
      // new sentences drift in from the reading direction
      span.style.transform = `translate3d(${this.pivotX + (rtl ? -1 : 1) * (animate ? 40 : 0)}px, -50%, 0)`;
      this.spans.push(span);
      this.widths.push(width);
    }
    this.rail.append(...this.spans);
    if (animate) void this.rail.offsetWidth;
    for (const span of this.spans) span.style.transition = '';
    this.railKey = key;
  }

  // a beat of nothing before a word that repeats the one before it
  blank() {
    this.word.style.visibility = 'hidden';
  }

  // a title between sections; the rail and word fade out under it
  card(title: string, sub: string) {
    this.cardTitle.textContent = title;
    this.cardSub.textContent = sub;
    this.cardEl.classList.add('show');
    this.root.classList.add('carding');
    this.word.style.visibility = 'hidden';
    for (const s of this.spans) s.style.opacity = '0';
    this.thread(this.threadBehind, false, 0, 0, 0);
    this.thread(this.threadAhead, false, 0, 0, 0);
  }

  hideCard() {
    this.cardEl.classList.remove('show');
    this.root.classList.remove('carding');
  }
}
