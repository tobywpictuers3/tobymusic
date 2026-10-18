/** TOBY PLAY ear training: bounded melodic memory, using only the student's approved notes. */
import {
  canAccessMusicLevel, NATURAL_MIDI, normalizeMusicSettings,
  type MusicClef, type MusicPlaySettings,
} from './musicPlay';

export interface EarRound {
  clef: MusicClef;
  melody: number[];
  choices: number[];
}

const draw = (random: () => number) => {
  const n = random();
  return Number.isFinite(n) ? Math.max(0, Math.min(0.999999999, n)) : 0;
};
const pick = <T,>(list: readonly T[], random: () => number): T =>
  list[Math.floor(draw(random) * list.length)];

/** A level never grants access to notes beyond the teacher's configured ranges. */
export function generateEarRound(
  level: number, input: MusicPlaySettings, random: () => number = Math.random,
): EarRound {
  const settings = normalizeMusicSettings(input);
  if (!canAccessMusicLevel(settings, level)) throw new Error('LEVEL_LOCKED');
  const treble = NATURAL_MIDI.filter(n => n >= settings.trebleFrom && n <= settings.trebleTo);
  const bass = NATURAL_MIDI.filter(n => n >= settings.bassFrom && n <= settings.bassTo);
  const choicesOfClef: Array<{ clef: MusicClef; notes: number[] }> =
    level === 4 ? [{ clef: 'bass', notes: bass }] :
      level >= 5 ? [{ clef: 'treble', notes: treble }, { clef: 'bass', notes: bass }] :
        [{ clef: 'treble', notes: treble }];
  const eligible = choicesOfClef.filter(item => item.notes.length >= 2);
  if (!eligible.length) throw new Error('INSUFFICIENT_NOTES');
  const selected = pick(eligible, random);
  const numberOfChoices = Math.min(4, selected.notes.length);
  const firstIndex = Math.floor(draw(random) * (selected.notes.length - numberOfChoices + 1));
  const choices = selected.notes.slice(firstIndex, firstIndex + numberOfChoices);
  const length = Math.min(5, 2 + Math.floor((level - 1) / 2));
  const melody: number[] = [pick(choices, random)];
  while (melody.length < length) {
    const previous = melody[melody.length - 1];
    const index = choices.indexOf(previous);
    const neighbors = choices.filter((_, i) => Math.abs(i - index) === 1);
    const stepwise = level <= 2 || settings.motion === 'steps';
    melody.push(pick(stepwise && neighbors.length ? neighbors : choices, random));
  }
  return { clef: selected.clef, choices, melody };
}

export function scoreEarRound(expected: readonly number[], entered: readonly number[]) {
  const correct = expected.filter((pitch, index) => pitch === entered[index]).length;
  return { correct, total: expected.length, perfect: expected.length > 0 && entered.length === expected.length && correct === expected.length };
}
