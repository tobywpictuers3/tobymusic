/** Standard natural-note fingerings for a closed-G# Boehm concert flute, C foot.
 * Pedagogical virtual fingering only. Register is chosen explicitly: embouchure
 * determines the octave and cannot be inferred from depressed flute keys.
 * Reference: Yamaha flute guide and Tunable's concert-flute fingering chart.
 */
export type FluteFinger = 'T'|'L1'|'L2'|'L3'|'R1'|'R2'|'R3'|'Eb'|'C';
export const FLUTE_FINGERS:readonly FluteFinger[]=['T','L1','L2','L3','R1','R2','R3','Eb','C'] as const;
export const FLUTE_FINGER_LABELS:Record<FluteFinger,string>={
  T:'אגודל שמאל',L1:'שמאל 1',L2:'שמאל 2',L3:'שמאל 3',
  R1:'ימין 1',R2:'ימין 2',R3:'ימין 3',Eb:'זרת ימין (מי במול)',C:'זרת — דו נמוך',
};
type Fingering={midi:number;fingers:readonly FluteFinger[];register:4|5|6};
/** Conservative common natural-note positions only; 60=C4 through 84=C6. */
const FINGERINGS:readonly Fingering[]=[
  {midi:60,register:4,fingers:['T','L1','L2','L3','R1','R2','R3','C']},
  {midi:62,register:4,fingers:['T','L1','L2','L3','R1','R2','R3']},
  {midi:64,register:4,fingers:['T','L1','L2','L3','R1','R2','Eb']},
  {midi:65,register:4,fingers:['T','L1','L2','L3','R1','Eb']},
  {midi:67,register:4,fingers:['T','L1','L2','L3','Eb']},
  {midi:69,register:4,fingers:['T','L1','L2','Eb']},
  {midi:71,register:4,fingers:['T','L1','Eb']},
  {midi:72,register:5,fingers:['L1','Eb']},
  {midi:74,register:5,fingers:['T','L2','L3','R1','R2','R3']},
  {midi:76,register:5,fingers:['T','L1','L2','L3','R1','R2','Eb']},
  {midi:77,register:5,fingers:['T','L1','L2','L3','R1','Eb']},
  {midi:79,register:5,fingers:['T','L1','L2','L3','Eb']},
  {midi:81,register:5,fingers:['T','L1','L2','Eb']},
  {midi:83,register:5,fingers:['T','L1','Eb']},
  {midi:84,register:6,fingers:['L1','Eb']},
];
export const SUPPORTED_FLUTE_NOTES=FINGERINGS.map(f=>f.midi);
export function recognizeRecallFluteFingering(
  fingers:readonly FluteFinger[],register:4|5|6,allowedNotes:readonly number[],
):number|null {
  const entered=[...new Set(fingers)].sort().join(',');
  const match=FINGERINGS.find(f=>f.register===register&&[...f.fingers].sort().join(',')===entered);
  return match&&allowedNotes.includes(match.midi)?match.midi:null;
}
