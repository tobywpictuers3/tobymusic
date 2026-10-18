/**
 * Ready-made level templates the teacher can start from (then edit freely).
 */
import type { NoteGameLevel } from './types';

export type LevelDraft = Omit<NoteGameLevel, 'id' | 'createdAt' | 'lastModified'>;

export const LEVEL_PRESETS: LevelDraft[] = [
  {
    name: 'סול: דו אמצעי עד רה שני',
    gameType: 'noteReading',
    clefMode: 'treble',
    rangeLow: 60,
    rangeHigh: 74,
    accidentals: 'none',
    beatsPerNote: 2,
    tempoStart: 60,
    tempoTarget: 100,
    tempoStep: 5,
    itemsPerRound: 16,
    passAccuracy: 0.85,
  },
  {
    name: 'פה: דו נמוך עד דו אמצעי',
    gameType: 'noteReading',
    clefMode: 'bass',
    rangeLow: 48,
    rangeHigh: 60,
    accidentals: 'none',
    beatsPerNote: 2,
    tempoStart: 60,
    tempoTarget: 100,
    tempoStep: 5,
    itemsPerRound: 16,
    passAccuracy: 0.85,
  },
  {
    name: 'שני מפתחות יחד',
    gameType: 'noteReading',
    clefMode: 'grand',
    rangeLow: 60,
    rangeHigh: 72,
    bassRangeLow: 48,
    bassRangeHigh: 60,
    accidentals: 'none',
    beatsPerNote: 2,
    tempoStart: 50,
    tempoTarget: 90,
    tempoStep: 5,
    itemsPerRound: 16,
    passAccuracy: 0.8,
  },
  {
    name: 'מקצב: רבעים, שמיניות וחצאים',
    gameType: 'rhythm',
    timeSignature: { beats: 4, unit: 4 },
    rhythmValues: ['quarter', 'eighthPair', 'half', 'quarterRest'],
    barsPerPattern: 2,
    tempoStart: 70,
    tempoTarget: 110,
    tempoStep: 5,
    itemsPerRound: 4,
    passAccuracy: 0.8,
  },
];
