/**
 * Pitch helpers: MIDI numbers, spelling, Hebrew note names, staff positions.
 * Middle C (דו אמצעי) = MIDI 60 = C4.
 */
import type { Clef } from './types';

/** Letter index 0..6 = C D E F G A B */
export type Letter = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SpelledNote {
  midi: number;
  letter: Letter;
  /** -1 flat, 0 natural, +1 sharp */
  accidental: -1 | 0 | 1;
  /** Scientific octave (C4 = middle C) */
  octave: number;
}

export const HEBREW_LETTER_NAMES = ['דו', 'רה', 'מי', 'פה', 'סול', 'לה', 'סי'] as const;
export const ENGLISH_LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

const NATURAL_PITCH_CLASS = [0, 2, 4, 5, 7, 9, 11] as const;

export const isNaturalMidi = (midi: number): boolean =>
  (NATURAL_PITCH_CLASS as readonly number[]).includes(((midi % 12) + 12) % 12);

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Spell a MIDI number. preferFlat decides black keys (C#/Db etc.). */
export const spellMidi = (midi: number, preferFlat = false): SpelledNote => {
  const pc = mod12(midi);
  const naturalIdx = (NATURAL_PITCH_CLASS as readonly number[]).indexOf(pc);
  const octaveOf = (m: number) => Math.floor(m / 12) - 1;
  if (naturalIdx >= 0) {
    return { midi, letter: naturalIdx as Letter, accidental: 0, octave: octaveOf(midi) };
  }
  if (preferFlat) {
    const up = midi + 1;
    const idx = (NATURAL_PITCH_CLASS as readonly number[]).indexOf(mod12(up));
    return { midi, letter: idx as Letter, accidental: -1, octave: octaveOf(up) };
  }
  const down = midi - 1;
  const idx = (NATURAL_PITCH_CLASS as readonly number[]).indexOf(mod12(down));
  return { midi, letter: idx as Letter, accidental: 1, octave: octaveOf(down) };
};

/** Diatonic step count from C0 — used for vertical staff placement. */
export const diatonicIndex = (n: SpelledNote): number => n.octave * 7 + n.letter;

/** Diatonic index of each staff's bottom line: treble E4, bass G2. */
const BOTTOM_LINE: Record<Clef, number> = {
  treble: 4 * 7 + 2, // E4
  bass: 2 * 7 + 4, // G2
};

/**
 * Staff step of a note: 0 = bottom line, 1 = first space, 2 = second line … 8 = top line.
 * Negative / above 8 means ledger lines.
 */
export const staffStep = (n: SpelledNote, clef: Clef): number => diatonicIndex(n) - BOTTOM_LINE[clef];

/** Hebrew display name, e.g. "סול#", "סי♭". Octave is shown separately when needed. */
export const hebrewName = (n: SpelledNote): string => {
  const base = HEBREW_LETTER_NAMES[n.letter];
  if (n.accidental === 1) return `${base}#`;
  if (n.accidental === -1) return `${base}♭`;
  return base;
};

export const englishName = (n: SpelledNote): string => {
  const acc = n.accidental === 1 ? '#' : n.accidental === -1 ? 'b' : '';
  return `${ENGLISH_LETTER_NAMES[n.letter]}${acc}${n.octave}`;
};

export const midiToHz = (midi: number, a4Hz = 440): number => a4Hz * Math.pow(2, (midi - 69) / 12);

/** Nearest MIDI number to a frequency, plus the deviation in cents. */
export const hzToMidi = (hz: number, a4Hz = 440): { midi: number; cents: number } => {
  const exact = 69 + 12 * Math.log2(hz / a4Hz);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
};

/** Same pitch class (ignores octave and spelling) — used by note-name buttons. */
export const samePitchClass = (a: number, b: number): boolean => mod12(a) === mod12(b);
