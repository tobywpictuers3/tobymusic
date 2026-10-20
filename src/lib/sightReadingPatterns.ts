/** Exact two-quarter-beat rhythm patterns extracted from the teacher's supplied MXL.
 * Durations are integer sixteenth-note units (1=16th, 2=8th, 4=quarter).
 * Preserve note/rest order. Do not generate invented rhythms. */
export type RhythmEvent = { units: number; rest: boolean; sourceId: string };
export type RhythmPattern = { id: string; events: RhythmEvent[] };
const SOURCE = "n4n4|n2n2n2n2|n2n2n4|n4n2n2|r4n2n2|n2n2r4|n2n6|n6n2|r2n6|n6r2|r2n2n2n2|n2r2n2n2|n2n2r2n2|r2n2r2n2|n2n2n2r2|r2r2r2n2|r2n2r4|r4r2n2|r4n2r2|n8|r8|r4r4|n1n1n1n1n1n1n1n1|n1n1n1n1n4|n4n1n1n1n1|n1n1n1n1r4|r4n1n1n1n1|n2n2n1n1n1n1|n1n1n1n1n2n2|n2n1n1n2n1n1|n1n1n2n1n1n2|n2n1n1n1n1n2|n1n1n2n2n1n1|n2n1n1n1n1n1n1|n1n1n1n1n2n1n1|n1n1n2n1n1n1n1|n1n1n1n1n1n1n2|r1n1n1n1n1n1n1n1|r1n1n1n1r1n1n1n1|n1r1n1n1n1n1n1n1|n1r1n1n1n1r1n1n1|n1n1r1n1n1n1n1n1|n1n1r1n1n1n1r1n1|n1n1n1n1n1n1r1n1|n1n1n1r1n1n1n1r1|n1r1r1n1n1r1r1n1|n1r1r1n1n1n1n1n1|r2n1n1n1n1n1n1|r2n1n1r2n1n1|n1n1r2n1n1r2|n1n1r2n1n1n2|n1n1n1r1r1n1n1n1|r1n1r1n1r1n1r1n1|r1n1r1n1n2n2|n4n2n1n1|r2n1n1n2n1n1|n3n1n3n1|n3n1n1n1n1n1|n3n1n4|n3n1n2n2|n2n2n3n1|n4n3n1|r3n1n1n1n1n1|r3n1n2n2|r3n1n4|r2n1n1n3n1|r3n1n1n1r1n1|n1n3n1n3|n1n3n3n1|n1n3n4|n1n3n2n2|n1n3r2n2|n1n3r3n1|n2n2n1n3";
export const RHYTHM_PATTERNS: RhythmPattern[] = SOURCE.split('|').map((encoded, i) => {
  const id = 'P' + String(i + 1).padStart(2, '0');
  const matches = [...encoded.matchAll(/([nr])(\d+)/g)];
  const events = matches.map(m => ({ units: Number(m[2]), rest: m[1] === 'r', sourceId: id }));
  if (events.reduce((sum, e) => sum + e.units, 0) !== 8) {
    throw new Error('Invalid source rhythm ' + id);
  }
  return { id, events };
});
if (RHYTHM_PATTERNS.length !== 74) throw new Error('Missing rhythm templates');
/** A half-pattern is allowed only at an existing event boundary after 4 sixteenth units. */
export const HALF_PATTERNS = RHYTHM_PATTERNS.flatMap(pattern => {
  let total = 0;
  let boundary = -1;
  pattern.events.forEach((event, i) => { total += event.units; if (total === 4) boundary = i + 1; });
  return boundary < 0 ? [] : [
    { id: pattern.id + ':first', events: pattern.events.slice(0, boundary) },
    { id: pattern.id + ':second', events: pattern.events.slice(boundary) },
  ];
});
export function buildRhythmBar(
  beats: 2 | 3 | 4 | 5,
  approvedIds: readonly string[],
  random: () => number = Math.random,
): RhythmEvent[] {
  const approved = RHYTHM_PATTERNS.filter(p => approvedIds.includes(p.id));
  const halves = HALF_PATTERNS.filter(p => approvedIds.includes(p.id.slice(0, 3)));
  if (!approved.length) throw new Error('בחרי תבניות מאושרות');
  if (beats % 2 && !halves.length) throw new Error('אין חצי תבנית תקין בתבניות שנבחרו');
  const choose = <T>(items: T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const pieces: RhythmEvent[][] = [];
  for (let i = 0; i < Math.floor(beats / 2); i++) pieces.push(choose(approved).events);
  if (beats % 2) pieces.push(choose(halves).events);
  const result = pieces.flat().map(e => ({ ...e }));
  if (result.reduce((sum, e) => sum + e.units, 0) !== beats * 4) throw new Error('Rhythm total mismatch');
  return result;
}
