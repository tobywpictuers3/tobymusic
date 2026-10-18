/**
 * Rhythm patterns, expected onsets and tap evaluation.
 * Durations are measured in beats (quarter note = 1 beat).
 */
import type { NoteGameLevel, RhythmValue } from './types';
import type { RandomFn } from './generator';

interface RhythmValueSpec {
  /** Total length in beats. */
  beats: number;
  /** Onset offsets (beats) inside the value. Empty = rest. */
  onsets: number[];
  label: string;
}

export const RHYTHM_VALUES: Record<RhythmValue, RhythmValueSpec> = {
  whole: { beats: 4, onsets: [0], label: 'שלמה' },
  dottedHalf: { beats: 3, onsets: [0], label: 'חצי עם נקודה' },
  half: { beats: 2, onsets: [0], label: 'חצי' },
  dottedQuarter: { beats: 1.5, onsets: [0], label: 'רבע עם נקודה' },
  quarter: { beats: 1, onsets: [0], label: 'רבע' },
  eighthPair: { beats: 1, onsets: [0, 0.5], label: 'זוג שמיניות' },
  eighth: { beats: 0.5, onsets: [0], label: 'שמינית' },
  sixteenthGroup: { beats: 1, onsets: [0, 0.25, 0.5, 0.75], label: 'ארבע שש-עשריות' },
  triplet: { beats: 1, onsets: [0, 1 / 3, 2 / 3], label: 'טריולה' },
  halfRest: { beats: 2, onsets: [], label: 'הפסקת חצי' },
  quarterRest: { beats: 1, onsets: [], label: 'הפסקת רבע' },
  eighthRest: { beats: 0.5, onsets: [], label: 'הפסקת שמינית' },
};

export const ALL_RHYTHM_VALUES = Object.keys(RHYTHM_VALUES) as RhythmValue[];

export interface RhythmEvent {
  value: RhythmValue;
  /** Start position in beats from the beginning of the pattern. */
  start: number;
}

export interface RhythmPattern {
  beatsPerBar: number;
  bars: number;
  events: RhythmEvent[];
}

const EPS = 1e-6;

/**
 * Build a random pattern from the allowed values. Each bar is filled exactly;
 * a value never crosses a bar line. Guarantees at least one sounding onset.
 */
export const generateRhythmPattern = (level: NoteGameLevel, rnd: RandomFn = Math.random): RhythmPattern => {
  const beatsPerBar = level.timeSignature?.beats ?? 4;
  const bars = Math.max(1, level.barsPerPattern ?? 1);
  const allowed = (level.rhythmValues && level.rhythmValues.length > 0 ? level.rhythmValues : ['quarter']) as RhythmValue[];

  const build = (): RhythmEvent[] => {
    const events: RhythmEvent[] = [];
    for (let bar = 0; bar < bars; bar++) {
      let pos = 0;
      while (pos < beatsPerBar - EPS) {
        const remaining = beatsPerBar - pos;
        // Groups that span a whole beat must start on a beat.
        const onBeat = Math.abs(pos - Math.round(pos)) < EPS;
        const fits = allowed.filter((v) => {
          const spec = RHYTHM_VALUES[v];
          if (spec.beats > remaining + EPS) return false;
          if ((v === 'triplet' || v === 'sixteenthGroup' || v === 'eighthPair') && !onBeat) return false;
          return true;
        });
        let value: RhythmValue;
        if (fits.length > 0) {
          value = fits[Math.floor(rnd() * fits.length) % fits.length];
        } else {
          value = remaining >= 1 - EPS ? 'quarterRest' : 'eighthRest';
        }
        events.push({ value, start: bar * beatsPerBar + pos });
        pos += RHYTHM_VALUES[value].beats;
      }
    }
    return events;
  };

  for (let attempt = 0; attempt < 20; attempt++) {
    const events = build();
    if (events.some((e) => RHYTHM_VALUES[e.value].onsets.length > 0)) return { beatsPerBar, bars, events };
  }
  // Fallback: plain quarters.
  const events: RhythmEvent[] = [];
  for (let b = 0; b < beatsPerBar * bars; b++) events.push({ value: 'quarter', start: b });
  return { beatsPerBar, bars, events };
};

/** Expected onset positions in beats, ascending. */
export const expectedOnsets = (pattern: RhythmPattern): number[] =>
  pattern.events
    .flatMap((e) => RHYTHM_VALUES[e.value].onsets.map((o) => e.start + o))
    .sort((a, b) => a - b);

export const beatMs = (bpm: number) => 60000 / bpm;

/**
 * Timing tolerance: 15% of a beat, clamped to 50–140 ms, and never more than
 * 45% of the gap to the nearest neighbouring onset (so fast notes stay distinct).
 */
export const toleranceMs = (bpm: number, gapToNeighbourMs = Infinity): number => {
  const base = Math.min(140, Math.max(50, beatMs(bpm) * 0.15));
  return Math.min(base, gapToNeighbourMs * 0.45);
};

export type OnsetGrade = 'perfect' | 'good' | 'early' | 'late' | 'missed';

export interface OnsetResult {
  expectedMs: number;
  tapMs: number | null;
  /** tap − expected (negative = early). null when missed. */
  errorMs: number | null;
  grade: OnsetGrade;
}

export interface RhythmEvaluation {
  onsets: OnsetResult[];
  extraTaps: number[];
  matched: number;
  total: number;
  /** matched / (total + extra taps) — extra taps count against the score. */
  accuracy: number;
  avgAbsErrorMs: number | null;
}

/**
 * Evaluate taps against the pattern.
 * @param tapsMs   tap times in ms relative to the pattern start (beat 0)
 * @param latencyMs device latency from calibration; subtracted from every tap
 */
export const evaluateRhythm = (
  pattern: RhythmPattern,
  bpm: number,
  tapsMs: number[],
  latencyMs = 0,
): RhythmEvaluation => {
  const b = beatMs(bpm);
  const expected = expectedOnsets(pattern).map((beat) => beat * b);
  const taps = tapsMs.map((t) => t - latencyMs).sort((x, y) => x - y);
  const used = new Array(taps.length).fill(false);

  const onsets: OnsetResult[] = expected.map((exp, i) => {
    const prevGap = i > 0 ? exp - expected[i - 1] : Infinity;
    const nextGap = i < expected.length - 1 ? expected[i + 1] - exp : Infinity;
    const tol = toleranceMs(bpm, Math.min(prevGap, nextGap));
    let best = -1;
    let bestErr = Infinity;
    taps.forEach((t, j) => {
      if (used[j]) return;
      const err = Math.abs(t - exp);
      if (err <= tol && err < bestErr) {
        best = j;
        bestErr = err;
      }
    });
    if (best < 0) return { expectedMs: exp, tapMs: null, errorMs: null, grade: 'missed' };
    used[best] = true;
    const error = taps[best] - exp;
    const grade: OnsetGrade =
      Math.abs(error) <= tol * 0.4 ? 'perfect' : Math.abs(error) <= tol * 0.75 ? 'good' : error < 0 ? 'early' : 'late';
    return { expectedMs: exp, tapMs: taps[best], errorMs: error, grade };
  });

  const extraTaps = taps.filter((_, j) => !used[j]);
  const matched = onsets.filter((o) => o.grade !== 'missed').length;
  const total = onsets.length;
  const errs = onsets.filter((o) => o.errorMs !== null).map((o) => Math.abs(o.errorMs as number));
  return {
    onsets,
    extraTaps,
    matched,
    total,
    accuracy: total + extraTaps.length > 0 ? matched / (total + extraTaps.length) : 0,
    avgAbsErrorMs: errs.length ? errs.reduce((s, e) => s + e, 0) / errs.length : null,
  };
};

/**
 * Calibration: the student taps along with N metronome clicks.
 * Latency = median(tap − click). Outliers beyond half a beat are ignored.
 */
export const computeLatencyMs = (clickTimesMs: number[], tapTimesMs: number[], bpm: number): number | null => {
  const half = beatMs(bpm) / 2;
  const diffs: number[] = [];
  tapTimesMs.forEach((tap) => {
    let best = Infinity;
    clickTimesMs.forEach((c) => {
      const d = tap - c;
      if (Math.abs(d) < Math.abs(best)) best = d;
    });
    if (Math.abs(best) <= half) diffs.push(best);
  });
  if (diffs.length < 4) return null;
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
};
