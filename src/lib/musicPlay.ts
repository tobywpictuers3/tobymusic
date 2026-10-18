/** TOBY PLAY: bounded, deterministic rules; no generated exercise can exceed the assigned knowledge. */
export type MusicClef = 'treble' | 'bass';
export type RhythmValue = 0.5 | 1 | 2 | 4;
export interface MusicPlaySettings {
  maxUnlockedLevel: number;
  trebleFrom: number;
  trebleTo: number;
  bassFrom: number;
  bassTo: number;
  rhythmValues: RhythmValue[];
  motion: 'steps' | 'mixed';
  bpm: number;
  maxChordNotes: number;
}
export interface MusicNote { midi: number; clef: MusicClef }
export interface MusicEvent { id: string; startBeat: number; durationBeats: RhythmValue; notes: MusicNote[] }
export interface MusicPlayAttempt {
  id: string;
  level: number;
  at: string;
  bpm: number;
  accuracy: number;
  timing: number;
  correct: number;
  total: number;
  input: 'touch' | 'keyboard' | 'midi';
  mode?: 'reading' | 'rhythm' | 'ear';
}
export const MUSIC_LEVELS = [
  { id: 1, name: 'שליפה ראשונה', description: 'תו יחיד במפתח סול, רבעים' },
  { id: 2, name: 'קוראת ברצף', description: 'מפתח סול, רבעים ושמיניות' },
  { id: 3, name: 'קריאה זורמת', description: 'מקצבים ומרווחים מגוונים במפתח סול' },
  { id: 4, name: 'מפתח פה', description: 'קריאת תווים במפתח פה' },
  { id: 5, name: 'שתי ידיים', description: 'שתי חמשות בתיאום עם המטרונום' },
  { id: 6, name: 'אקורדים', description: 'שתי חמשות עם תווים כפולים' },
] as const;
export const DEFAULT_MUSIC_SETTINGS: MusicPlaySettings = {
  maxUnlockedLevel: 1, trebleFrom: 60, trebleTo: 67,
  bassFrom: 43, bassTo: 55, rhythmValues: [1, 0.5],
  motion: 'steps', bpm: 60, maxChordNotes: 2,
};
export const NATURAL_MIDI = Array.from({ length: 53 }, (_, i) => i + 36)
  .filter(midi => ![1, 3, 6, 8, 10].includes(midi % 12));
export const NOTE_NAMES = ['דו', 'דו♯', 'רה', 'רה♯', 'מי', 'פה', 'פה♯', 'סול', 'סול♯', 'לה', 'לה♯', 'סי'];
export function noteName(midi: number): string {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}
const cap = (value: unknown, fallback: number, min: number, max: number) =>
  Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
function naturalWithin(from: number, to: number): number[] {
  return NATURAL_MIDI.filter(midi => midi >= from && midi <= to);
}
export function normalizeMusicSettings(raw?: Partial<MusicPlaySettings>): MusicPlaySettings {
  const r = raw || {};
  const trebleFrom = cap(r.trebleFrom, 60, 48, 84);
  const trebleTo = cap(r.trebleTo, 67, trebleFrom, 84);
  const bassFrom = cap(r.bassFrom, 43, 36, 72);
  const bassTo = cap(r.bassTo, 55, bassFrom, 72);
  const valid: RhythmValue[] = [0.5, 1, 2, 4];
  const rhythms = Array.isArray(r.rhythmValues)
    ? valid.filter(v => r.rhythmValues!.includes(v)) : DEFAULT_MUSIC_SETTINGS.rhythmValues;
  return {
    maxUnlockedLevel: cap(r.maxUnlockedLevel, 1, 1, MUSIC_LEVELS.length),
    trebleFrom, trebleTo, bassFrom, bassTo,
    rhythmValues: [...new Set([1 as RhythmValue, ...rhythms])].sort((a,b)=>a-b),
    motion: r.motion === 'mixed' ? 'mixed' : 'steps',
    bpm: cap(r.bpm, 60, 40, 180),
    maxChordNotes: cap(r.maxChordNotes, 2, 2, 4),
  };
}
export function canAccessMusicLevel(settings: MusicPlaySettings, level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= settings.maxUnlockedLevel && level <= MUSIC_LEVELS.length;
}
const choose = <T,>(items: readonly T[], random: () => number): T => items[Math.min(items.length - 1, Math.floor(Math.max(0, random()) * items.length))];
function nextPitch(allowed: number[], previous: number | undefined, stepsOnly: boolean, random: () => number) {
  if (!allowed.length) throw new Error('EMPTY_NOTE_RANGE');
  if (previous === undefined) return choose(allowed, random);
  const pos = allowed.indexOf(previous);
  const neighbors = allowed.filter((_, i) => Math.abs(i - pos) === 1);
  if (stepsOnly && pos !== -1 && neighbors.length) return choose(neighbors, random);
  return choose(allowed, random);
}
/** One event is a vertical slice: simultaneous treble/bass notes share an onset and duration. */
export function generateMusicExercise(level: number, input: MusicPlaySettings, bars = 4, random: () => number = Math.random): MusicEvent[] {
  const s = normalizeMusicSettings(input);
  if (!canAccessMusicLevel(s, level)) throw new Error('LEVEL_LOCKED');
  const treble = naturalWithin(s.trebleFrom, s.trebleTo);
  const bass = naturalWithin(s.bassFrom, s.bassTo);
  if (!treble.length || !bass.length) throw new Error('EMPTY_NOTE_RANGE');
  const options: RhythmValue[] = level === 1 ? [1] : level === 2 ? s.rhythmValues.filter(v => v <= 1) : s.rhythmValues;
  const durations: RhythmValue[] = options.length ? options : [1];
  const stepsOnly = level <= 2 || s.motion === 'steps';
  const previous: { treble?: number; bass?: number } = {};
  const events: MusicEvent[] = [];
  let beat = 0;
  for (let bar = 0; bar < Math.max(1, Math.min(8, Math.round(bars))); bar++) {
    let remaining = 4;
    while (remaining > 0) {
      const possible = durations.filter(v => v <= remaining && ((remaining - v) * 2) % 1 === 0);
      const duration = choose(possible.length ? possible : [0.5] as RhythmValue[], random);
      const notes: MusicNote[] = [];
      const clefs: MusicClef[] = level === 4 ? ['bass'] : level >= 5 ? ['treble', 'bass'] : ['treble'];
      clefs.forEach(clef => {
        const allowed = clef === 'treble' ? treble : bass;
        const root = nextPitch(allowed, previous[clef], stepsOnly, random);
        previous[clef] = root;
        notes.push({ clef, midi: root });
        if (level >= 6) {
          const rootIndex = allowed.indexOf(root);
          // Build distinct, in-range stacked thirds; the configured chord size is per staff.
          for (let voice = 1; voice < s.maxChordNotes; voice++) {
            const offset = 2 * voice;
            const candidate = rootIndex + offset < allowed.length
              ? allowed[rootIndex + offset]
              : rootIndex - offset >= 0 ? allowed[rootIndex - offset] : undefined;
            if (candidate !== undefined && !notes.some(n => n.clef === clef && n.midi === candidate)) {
              notes.push({ clef, midi: candidate });
            }
          }
        }
      });
      events.push({ id: `b${bar}-n${events.length}`, startBeat: beat, durationBeats: duration, notes });
      beat += duration;
      remaining = Math.round((remaining - duration) * 2) / 2;
    }
  }
  return events;
}
export function scoreMusicEvent(expected: MusicEvent, played: Array<{ midi: number; beat: number }>): { correct: boolean; timely: boolean } {
  const target = expected.notes.map(n => n.midi).sort((a, b) => a - b);
  const actual = [...new Set(played.map(p => p.midi))].sort((a, b) => a - b);
  const correct = target.length === actual.length && target.every((pitch, i) => pitch === actual[i]);
  const timely = correct && played.length === target.length && played.every(p => Math.abs(p.beat - expected.startBeat) <= 0.35);
  return { correct, timely };
}

/** Basic rhythm onset scoring, independent of pitch. Extra taps disqualify the event. */
export function scoreRhythmEvent(expected: MusicEvent, beats: number[]): { correct: boolean; timely: boolean } {
  const correct = beats.length === 1;
  return { correct, timely: correct && Math.abs(beats[0]-expected.startBeat) <= 0.25 };
}
