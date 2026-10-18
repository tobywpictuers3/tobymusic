/**
 * Note games ("משחקי תווים") — shared types.
 *
 * Data model (synced through the canonical Dropbox snapshot):
 * - musicSystem_noteGameLevels       — levels the teacher builds (reusable across students)
 * - musicSystem_noteGameAssignments  — which level is active for which student
 * - musicSystem_noteGameResults      — append-only practice results (one record per finished round)
 *
 * All three buckets are merged by record id in hybridSync (never last-writer-wins),
 * so results recorded on a student's tablet are not erased by a sync from another device.
 * Every record carries id + createdAt + lastModified for that merge.
 */

export type NoteGameType = 'noteReading' | 'rhythm';

/** Which staff is shown. "grand" = treble + bass together (מערכת כפולה). */
export type ClefMode = 'treble' | 'bass' | 'grand';
export type Clef = 'treble' | 'bass';

export type AccidentalMode = 'none' | 'sharps' | 'flats' | 'both';

/** How the student answers in note reading. The student chooses; unsupported methods are hidden. */
export type NoteInputMethod = 'noteNames' | 'keyboard' | 'microphone' | 'midi';

/** How the student performs a rhythm. */
export type RhythmInputMethod = 'tap' | 'microphone';

export type RhythmValue =
  | 'whole'
  | 'dottedHalf'
  | 'half'
  | 'dottedQuarter'
  | 'quarter'
  | 'eighthPair'
  | 'eighth'
  | 'sixteenthGroup'
  | 'triplet'
  | 'halfRest'
  | 'quarterRest'
  | 'eighthRest';

export interface TimeSignature {
  beats: number; // 2..6
  unit: 4; // quarter-note beat (kept explicit for future 6/8 support)
}

export interface NoteGameLevel {
  id: string;
  name: string;
  gameType: NoteGameType;

  // ---- note reading ----
  clefMode?: ClefMode;
  /** MIDI numbers, inclusive. Treble range (or the single clef range). 60 = middle C (דו אמצעי). */
  rangeLow?: number;
  rangeHigh?: number;
  /** Bass range, used only when clefMode === 'grand'. */
  bassRangeLow?: number;
  bassRangeHigh?: number;
  accidentals?: AccidentalMode;
  /** How many metronome beats each note stays on screen (1 = a new note every beat). */
  beatsPerNote?: number;

  // ---- rhythm ----
  timeSignature?: TimeSignature;
  rhythmValues?: RhythmValue[];
  barsPerPattern?: number;

  // ---- shared ----
  tempoStart: number;
  tempoTarget: number;
  /** BPM added after each successful round, until tempoTarget. 0 = fixed tempo. */
  tempoStep: number;
  /** Notes per round (note reading) or patterns per round (rhythm). */
  itemsPerRound: number;
  /** 0..1 — accuracy needed for a round to count as "passed". */
  passAccuracy: number;
  /** Free-text instruction from the teacher, shown to the student. */
  teacherNote?: string;

  createdAt: string;
  lastModified: string;
}

export interface NoteGameAssignment {
  id: string;
  studentId: string;
  levelId: string;
  active: boolean;
  /** Optional per-student starting tempo, overriding the level's tempoStart. */
  tempoOverride?: number;
  assignedAt: string;
  createdAt: string;
  lastModified: string;
}

export interface NoteGameResult {
  id: string;
  studentId: string;
  assignmentId: string;
  levelId: string;
  gameType: NoteGameType;
  inputMethod: NoteInputMethod | RhythmInputMethod;
  tempo: number;
  total: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
  passed: boolean;
  /** Rhythm: mean absolute timing error of matched onsets, after calibration. */
  avgTimingErrorMs?: number;
  completedAt: string;
  createdAt: string;
  lastModified: string;
}
