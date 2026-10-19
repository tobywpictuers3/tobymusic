/** TOBY PLAY personalized recall: teacher-owned immutable progression and bounded generation.
 * Legacy six-tier settings are not treated as automatically granted personalized levels.
 */
import type { MusicPlaySettings } from './musicPlay';
export type RecallClef = 'treble' | 'bass' | 'both';
export type RecallPlacement = 'treble' | 'bass' | 'split' | 'random';
export type RecallAnswer = 'play' | 'name';
export type RecallClock = 'metronome' | 'elapsed';
export interface RecallProfile {
  id: string;
  title: string;
  trebleNotes: number[];
  bassNotes: number[];
  intervals: number[]; // diatonic distance: 0=unison,1=second,...6=seventh, 7=octave; []=free
  clefs: RecallClef;
  placement: RecallPlacement;
  voices: number;
  minEvents: number;
}
export interface RecallPreferences { extraEvents: number; bpm: number; clock: RecallClock; answer: RecallAnswer }
export interface RecallSettings extends MusicPlaySettings {
  recallLevels?: RecallProfile[];
  recallPreferences?: RecallPreferences;
}
export interface RecallEvent {
  id: string;
  startBeat: number;
  durationBeats: 2;
  notes: Array<{ clef: 'treble' | 'bass'; midi: number }>;
}
/** Recall is not rhythm scoring: allow a modest early pickup near the next note.
 * Unlike strict performance, onsets inside the 2-beat window are otherwise unrestricted.
 */
export const RECALL_EARLY_WINDOW_BEATS = 0.25;

/** The letters occupy the same physical keys in English and Hebrew QWERTY layouts. */
export const RECALL_ENGLISH_KEYS = ['A','S','D','F','G','H','J','K','L'] as const;
export const RECALL_HEBREW_KEYS = ['ש','ד','ג','כ','ע','י','ח','ל','ך'] as const;

/** Computer shortcuts are all-or-nothing: never silently bind only part of a >9-note range. */
export function resolveRecallComputerPitch(
  event: {key:string; code?:string}, allowedNotes:readonly number[], answer:RecallAnswer,
):number|null {
  if(!allowedNotes.length||allowedNotes.length>RECALL_ENGLISH_KEYS.length)return null;
  const code=event.code||'';
  const key=event.key||'';
  let index=-1;
  if(answer==='name'){
    const digit=code.match(/^(?:Digit|Numpad)([1-9])$/)?.[1]||(/^[1-9]$/.test(key)?key:null);
    if(digit)index=Number(digit)-1;
  }else{
    index=RECALL_ENGLISH_KEYS.findIndex(english=>code==='Key'+english);
    if(index<0)index=RECALL_ENGLISH_KEYS.findIndex(english=>english===key.toUpperCase());
    if(index<0)index=RECALL_HEBREW_KEYS.indexOf(key as typeof RECALL_HEBREW_KEYS[number]);
  }
  return index>=0?allowedNotes[index]??null:null;
}

/** Choose the intended column without stealing a still-needed note from the previous one. */
export function assignRecallInput(
  events: readonly RecallEvent[], currentIndex: number, beat: number,
  pitch: number, recordedCurrent: readonly number[],
): number | null {
  const current = events[currentIndex];
  if (!current || !Number.isFinite(beat)) return null;
  if (beat < current.startBeat - RECALL_EARLY_WINDOW_BEATS) return null;
  const next = events[currentIndex + 1];
  if (next && beat >= next.startBeat - RECALL_EARLY_WINDOW_BEATS && beat < next.startBeat) {
    const alreadyFilled = recordedCurrent.length >= current.notes.length;
    const matchesNext = next.notes.some(n => n.midi === pitch);
    const matchesUnansweredCurrent = current.notes.some(n => n.midi === pitch) &&
      !recordedCurrent.includes(pitch);
    if (alreadyFilled || (matchesNext && !matchesUnansweredCurrent)) return currentIndex + 1;
  }
  if (beat >= current.startBeat + current.durationBeats) {
    return next && beat < next.startBeat + next.durationBeats ? currentIndex + 1 : null;
  }
  return currentIndex;
}

export const DEFAULT_RECALL_PREFERENCES: RecallPreferences = { extraEvents: 0, bpm: 60, clock: 'metronome', answer: 'play' };
export const NATURAL_PITCHES = Array.from({length: 49}, (_,i)=>36+i).filter(n=>![1,3,6,8,10].includes(n%12));
export const DEFAULT_RECALL_PROFILE: RecallProfile = {
  id: 'preview',title:'רמה ראשונה',trebleNotes:[60,62,64,65,67],
  bassNotes:[43,45,47,48,50,52,53,55], intervals:[1],
  clefs:'treble',placement:'treble',voices:1,minEvents:8,
};
const cap=(value:unknown, defaultValue:number, min:number, max:number) =>
  Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Math.round(Number(value)))) : defaultValue;
const cleanNotes=(raw:unknown) => Array.isArray(raw)
  ? [...new Set(raw.filter((n):n is number=>Number.isInteger(n)&&NATURAL_PITCHES.includes(n)))].sort((a,b)=>a-b)
  : [];
export function normalizeRecallProfile(raw:Partial<RecallProfile>|undefined):RecallProfile {
  const value=raw||{};
  const clefs:RecallClef = value.clefs==='bass'||value.clefs==='both'?value.clefs:'treble';
  const placement:RecallPlacement = value.placement==='bass'||value.placement==='split'||value.placement==='random'?value.placement:'treble';
  return {
    id:typeof value.id==='string'&&value.id.length<100?value.id:'preview',
    title:typeof value.title==='string'?value.title.trim().slice(0,70):'',
    trebleNotes: Array.isArray(value.trebleNotes)?cleanNotes(value.trebleNotes):[...DEFAULT_RECALL_PROFILE.trebleNotes],
    bassNotes: Array.isArray(value.bassNotes)?cleanNotes(value.bassNotes):[...DEFAULT_RECALL_PROFILE.bassNotes],
    intervals:Array.isArray(value.intervals)?[...new Set(value.intervals.filter((n):n is number=>Number.isInteger(n)&&n>=0&&n<=7))].sort((a,b)=>a-b):[1],
    clefs,placement,voices:cap(value.voices,1,1,4),minEvents:cap(value.minEvents,8,2,64),
  };
}
export function normalizeRecallPreferences(value?:Partial<RecallPreferences>, defaultBpm=60):RecallPreferences {
  return {
    extraEvents:cap(value?.extraEvents,0,0,48),bpm:cap(value?.bpm,defaultBpm,40,180),
    clock:value?.clock==='elapsed'?'elapsed':'metronome',
    answer:value?.answer==='name'?'name':'play',
  };
}
export function getRecallLevels(settings?:Partial<RecallSettings>):RecallProfile[] {
  if (!Array.isArray(settings?.recallLevels)) return [];
  return settings.recallLevels.slice(0,60).map(normalizeRecallProfile);
}
export function getInitialRecallProfile(settings?:Partial<MusicPlaySettings>):RecallProfile {
  const legacy=settings||{};
  const treble= NATURAL_PITCHES.filter(n=>n>= (legacy.trebleFrom??60)&&n<= (legacy.trebleTo??67));
  const bass= NATURAL_PITCHES.filter(n=>n>= (legacy.bassFrom??43)&&n<= (legacy.bassTo??55));
  return { ...DEFAULT_RECALL_PROFILE,trebleNotes:treble,bassNotes:bass };
}
function diatonicDistance(a:number,b:number):number {
  return Math.abs(NATURAL_PITCHES.indexOf(a)-NATURAL_PITCHES.indexOf(b));
}
export function allowedNext(notes:readonly number[], previous:number|undefined, intervals:readonly number[]):number[] {
  if(previous===undefined||!intervals.length) return [...notes];
  return notes.filter(p=>intervals.includes(diatonicDistance(previous,p)));
}
type Alloc={treble:number;bass:number};
function allocations(p:RecallProfile):Alloc[] {
  const t=p.trebleNotes.length,b=p.bassNotes.length;
  const max=p.voices;
  if(p.clefs==='treble')return t>=max?[{treble:max,bass:0}]:[];
  if(p.clefs==='bass')return b>=max?[{treble:0,bass:max}]:[];
  const result:Alloc[]=[];
  for(let i=0;i<=max;i++){
    const j=max-i;
    if(i>t||j>b)continue;
    if(p.placement==='treble'&&j!==0)continue;
    if(p.placement==='bass'&&i!==0)continue;
    if(p.placement==='split'&&(!i||!j))continue;
    result.push({treble:i,bass:j});
  }
  return result;
}
export function validateRecallProfile(input:Partial<RecallProfile>):string[] {
  const p=normalizeRecallProfile(input),errors:string[]=[];
  if(!p.trebleNotes.length&&p.clefs!=='bass')errors.push('בחרי לפחות תו אחד במפתח סול');
  if(!p.bassNotes.length&&p.clefs!=='treble')errors.push('בחרי לפחות תו אחד במפתח פה');
  if(p.clefs!=='both'&&p.placement!==(p.clefs as RecallPlacement))errors.push('החלוקה לחמשות אינה מתאימה למפתחות');
  if(!allocations(p).length)errors.push('מספר התווים בו־זמנית גדול ממבחר התווים או אינו מתאים לחלוקת החמשות');
  for(const entry of [p.trebleNotes,p.bassNotes]){
    if(entry.length && p.intervals.length && !entry.some(n=>allowedNext(entry,n,p.intervals).length)){
      // Only an actually used clef needs to be traversable.
      const used=entry===p.trebleNotes?allocations(p).some(a=>a.treble>0):allocations(p).some(a=>a.bass>0);
      if(used)errors.push('אין מעבר אפשרי בין תווים במרווחים שנבחרו. הוסיפי מרווח או תווים');
    }
  }
  return [...new Set(errors)];
}
function boundedRandom(random:()=>number):number {
  const n=random();return Number.isFinite(n)?Math.max(0,Math.min(0.9999999,n)):0;
}
function pick<T>(items:readonly T[],random:()=>number):T {
  return items[Math.floor(boundedRandom(random)*items.length)];
}
/** Each column is one simultaneous recall event, not an independent count per notehead.
 * If exact interval/pitch constraints cannot be met, fail closed instead of silently widening.
 */
export function generateRecallExercise(
  raw:Partial<RecallProfile>, count:number, random:()=>number=Math.random,
):RecallEvent[] {
  const p=normalizeRecallProfile(raw);
  const errors=validateRecallProfile(p);
  if(errors.length)throw new Error('RECALL_INVALID_PROFILE: '+errors.join('; '));
  const plans=allocations(p);
  const prev:{treble?:number;bass?:number}={};
  const events:RecallEvent[]=[];
  const total=cap(count,p.minEvents,p.minEvents,Math.min(112,p.minEvents+48));
  for(let i=0;i<total;i++){
    const possibilities=plans.map(plan=>{
      const notes:Array<{clef:'treble'|'bass';midi:number}>=[];
      const next:{treble?:number;bass?:number}={...prev};
      for(const clef of ['treble','bass'] as const){
        const voices=plan[clef],allowed=p[clef==='treble'?'trebleNotes':'bassNotes'];
        if(!voices)continue;
        const candidates=allowedNext(allowed,prev[clef],p.intervals).filter(pitch=>
          // If the next event must continue a legal transition, avoid dead ends.
          !p.intervals.length||allowedNext(allowed,pitch,p.intervals).length>0);
        if(!candidates.length||allowed.length<voices){notes.length=0;break;}
        const root=pick(candidates,random);
        const available=allowed.filter(n=>n!==root);
        const rest:Array<number>=[];
        while(rest.length<voices-1 && available.length){
          const nextIndex=Math.floor(boundedRandom(random)*available.length);
          rest.push(available.splice(nextIndex,1)[0]);
        }
        notes.push(...[root,...rest].map(midi=>({clef,midi})));
        next[clef]=root;
      }
      return notes.length===p.voices?{notes,next}:null;
    }).filter((v):v is {notes:Array<{clef:'treble'|'bass';midi:number}>;next:typeof prev}=>!!v);
    if(!possibilities.length)throw new Error('RECALL_NO_VALID_TRANSITION');
    const chosen=pick(possibilities,random);
    Object.assign(prev,chosen.next);
    events.push({id:'recall-'+i,startBeat:i*2,durationBeats:2,notes:chosen.notes});
  }
  return events;
}
export function scoreRecallAnswers(expected:RecallEvent,answered:readonly number[]) {
  const goal=expected.notes.map(n=>n.midi).sort((a,b)=>a-b);
  const actual=[...answered].sort((a,b)=>a-b);
  return goal.length===actual.length && goal.every((n,i)=>n===actual[i]);
}
