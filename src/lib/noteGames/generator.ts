/**
 * Note-reading item generation and answer judging.
 */
import type { AccidentalMode, Clef, NoteGameLevel, NoteInputMethod } from './types';
import { isNaturalMidi, samePitchClass, spellMidi, type Letter, type SpelledNote } from './pitch';

export interface NoteItem {
  clef: Clef;
  note: SpelledNote;
}

export type RandomFn = () => number;

const pick = <T,>(arr: readonly T[], rnd: RandomFn): T => arr[Math.floor(rnd() * arr.length) % arr.length];

/** All spelled notes inside [low, high] allowed by the accidental mode. */
export const candidateNotes = (low: number, high: number, mode: AccidentalMode): SpelledNote[] => {
  const out: SpelledNote[] = [];
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  for (let m = lo; m <= hi; m++) {
    if (isNaturalMidi(m)) {
      out.push(spellMidi(m));
      continue;
    }
    if (mode === 'sharps' || mode === 'both') out.push(spellMidi(m, false));
    if (mode === 'flats' || mode === 'both') out.push(spellMidi(m, true));
  }
  return out;
};

const sameSpelling = (a: SpelledNote, b: SpelledNote) =>
  a.midi === b.midi && a.letter === b.letter && a.accidental === b.accidental;

/** Default ranges when a level omits them: treble C4–D5, bass C3–C4 (ש"ל: דו אמצעי). */
export const DEFAULT_TREBLE_RANGE = { low: 60, high: 74 };
export const DEFAULT_BASS_RANGE = { low: 48, high: 60 };

/**
 * Generate a round of note items. Never repeats the exact same item twice in a row
 * (when the range allows more than one note).
 */
export const generateNoteRound = (level: NoteGameLevel, count: number, rnd: RandomFn = Math.random): NoteItem[] => {
  const mode = level.accidentals ?? 'none';
  const clefMode = level.clefMode ?? 'treble';
  const trebleLow = level.rangeLow ?? (clefMode === 'bass' ? DEFAULT_BASS_RANGE.low : DEFAULT_TREBLE_RANGE.low);
  const trebleHigh = level.rangeHigh ?? (clefMode === 'bass' ? DEFAULT_BASS_RANGE.high : DEFAULT_TREBLE_RANGE.high);

  const pools: Array<{ clef: Clef; notes: SpelledNote[] }> = [];
  if (clefMode === 'grand') {
    pools.push({ clef: 'treble', notes: candidateNotes(trebleLow, trebleHigh, mode) });
    pools.push({
      clef: 'bass',
      notes: candidateNotes(level.bassRangeLow ?? DEFAULT_BASS_RANGE.low, level.bassRangeHigh ?? DEFAULT_BASS_RANGE.high, mode),
    });
  } else {
    pools.push({ clef: clefMode, notes: candidateNotes(trebleLow, trebleHigh, mode) });
  }
  const usable = pools.filter((p) => p.notes.length > 0);
  if (usable.length === 0) return [];

  const items: NoteItem[] = [];
  for (let i = 0; i < count; i++) {
    const prev = items[items.length - 1];
    let next: NoteItem | null = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const pool = pick(usable, rnd);
      const candidate = { clef: pool.clef, note: pick(pool.notes, rnd) };
      next = candidate;
      if (!prev || prev.clef !== candidate.clef || !sameSpelling(prev.note, candidate.note)) break;
    }
    if (next) items.push(next);
  }
  return items;
};

/** A note-name answer from the on-screen name buttons. */
export interface NoteNameAnswer {
  letter: Letter;
  accidental: -1 | 0 | 1;
}

export type NoteAnswer =
  | { method: 'noteNames'; name: NoteNameAnswer }
  | { method: 'keyboard'; midi: number }
  | { method: 'microphone' | 'midi'; midi: number };

/**
 * Judge an answer.
 * - Name buttons: must match what is written (letter + accidental) — this is a reading drill.
 * - On-screen keyboard: pitch class (the keyboard shows a limited octave span).
 * - Microphone / MIDI: the exact pitch, including octave — the student actually played it.
 */
export const judgeNoteAnswer = (item: NoteItem, answer: NoteAnswer): boolean => {
  switch (answer.method) {
    case 'noteNames':
      return answer.name.letter === item.note.letter && answer.name.accidental === item.note.accidental;
    case 'keyboard':
      return samePitchClass(answer.midi, item.note.midi);
    case 'microphone':
    case 'midi':
      return answer.midi === item.note.midi;
    default:
      return false;
  }
};

export const isInputMethod = (v: unknown): v is NoteInputMethod =>
  v === 'noteNames' || v === 'keyboard' || v === 'microphone' || v === 'midi';
