export interface PlayerHooks {
  show(i: number): void;
  // an empty beat before a word that repeats the previous one (repetition blindness, kanwisher 1987)
  blank(): void;
  end(): void;
}

// first frames after a start run slower and speed up to full pace (spritz, reedy: convention)
const RAMP_FRAMES = 8;
const RAMP_FROM = 0.6;
// a frame this late (tab stalled, phone woke up) restarts the clock instead of rushing to catch up
const STALL_MS = 250;

// frames are swapped on display refreshes against absolute deadlines: chained setTimeout drifts
// and is clamped, while a fixed timeline keeps the average rate exact (per-word jitter ≤ half a frame)
export class Player {
  private d: Float64Array = new Float64Array(0);
  private texts: string[] = [];
  private i = 0;
  private raf = 0;
  private due = 0;
  private gapEnd = 0;
  private inGap = false;
  private rampLeft = 0;
  private startIdx = 0;
  private frameMs = 1000 / 60;
  private lastTs = 0;
  private leadIn = 0;
  private started = false;
  playing = false;

  constructor(private hooks: PlayerHooks) {}

  load(d: Float64Array, texts: string[], index: number) {
    this.d = d;
    this.texts = texts.map((t) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
    this.i = Math.max(0, Math.min(index, d.length - 1));
  }

  // new durations for the same frames (speed or timing setting changed): keep position, restart clock
  retime(d: Float64Array) {
    this.d = d;
    if (this.playing) this.due = performance.now() + this.dur(this.i);
  }

  get index() {
    return this.i;
  }

  get count() {
    return this.d.length;
  }

  seek(i: number) {
    this.i = Math.max(0, Math.min(i, this.d.length - 1));
    if (this.playing) {
      this.rampLeft = RAMP_FRAMES;
      this.startIdx = this.i;
      this.hooks.show(this.i);
      this.due = performance.now() + this.dur(this.i);
    }
  }

  play(opts: { ramp?: boolean; leadInMs?: number } = {}) {
    if (this.playing || this.d.length === 0) return;
    this.playing = true;
    this.rampLeft = opts.ramp === false ? 0 : RAMP_FRAMES;
    this.startIdx = this.i;
    this.leadIn = opts.leadInMs ?? 0;
    this.started = false;
    this.inGap = false;
    this.lastTs = 0;
    this.due = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  private dur(i: number): number {
    const k = i - this.startIdx;
    if (this.rampLeft > 0 && k >= 0 && k < RAMP_FRAMES) return this.d[i] / (RAMP_FROM + ((1 - RAMP_FROM) * k) / RAMP_FRAMES);
    return this.d[i];
  }

  private loop = (ts: number) => {
    if (!this.playing) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.lastTs) {
      const delta = ts - this.lastTs;
      // follow the real refresh rate (60/90/120 hz, adaptive) with a slow average
      if (delta > 4 && delta < 50) this.frameMs += (delta - this.frameMs) * 0.1;
    }
    this.lastTs = ts;
    const half = this.frameMs / 2;

    if (!this.started) {
      if (!this.due) this.due = ts + this.leadIn;
      if (ts + half < this.due) return;
      this.started = true;
      this.hooks.show(this.i);
      this.due = Math.max(this.due, ts) + this.dur(this.i);
      return;
    }

    if (this.inGap) {
      if (ts + half >= this.gapEnd) {
        this.inGap = false;
        this.hooks.show(this.i);
      }
      return;
    }

    if (ts + half < this.due) return;
    const next = this.i + 1;
    if (next >= this.d.length) {
      this.pause();
      this.hooks.end();
      return;
    }
    const late = ts - this.due;
    const shownAt = late > Math.max(STALL_MS, 2 * this.d[this.i]) ? ts : this.due;
    this.i = next;
    const d = this.dur(next);
    this.due = shownAt + d;
    if (next - this.startIdx >= RAMP_FRAMES) this.rampLeft = 0;
    if (this.texts[next] && this.texts[next] === this.texts[next - 1]) {
      this.inGap = true;
      this.gapEnd = shownAt + Math.min(60, d * 0.15);
      this.hooks.blank();
    } else this.hooks.show(next);
  };
}
