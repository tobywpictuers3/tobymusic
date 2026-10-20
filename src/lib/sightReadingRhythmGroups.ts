import { RHYTHM_PATTERNS, type RhythmEvent, type RhythmPattern } from './sightReadingPatterns';

/** Classification changes selection only. Original rhythms and beam instructions are immutable.
 * Each pattern belongs to exactly one parent and one child group.
 * Duration unit = one sixteenth of a whole note.
 */
export type RhythmGroup = { key:string; label:string; sections:{key:string;label:string;patterns:RhythmPattern[]}[] };
function family(events: RhythmEvent[]): number {
  const min=Math.min(...events.map(event=>event.units));
  return min<=1?1:min<=2?2:min<=4?4:8;
}
function section(events:RhythmEvent[], min:number):string {
  const values=events.map(e=>e.units);
  const rests=events.some(e=>e.rest);
  const dotted=values.some(v=>v===3||v===6);
  if (rests) return 'rests';
  if (dotted) return min===1?'dotted16':'dotted8';
  return 'regular';
}
const config = [
  {units:8,key:'half',label:'חצאים'},
  {units:4,key:'quarter',label:'רבעים'},
  {units:2,key:'eighth',label:'שמיניות'},
  {units:1,key:'sixteenth',label:'שש־עשריות'},
];
const subLabels:Record<string,string>={
  regular:'רגילות',
  dotted8:'רבע מנוקד עם שמינית / מקצבים מנוקדים',
  dotted16:'מקצבים מנוקדים (כולל שמינית מנוקדת ושש־עשרית)',
  rests:'עם דמימות',
};
export const RHYTHM_GROUPS:RhythmGroup[]=config.map(parent=>{
  const patterns=RHYTHM_PATTERNS.filter(p=>family(p.events)===parent.units);
  const keys=parent.units===8||parent.units===4?['regular','rests']:parent.units===2?['regular','dotted8','rests']:['regular','dotted16','rests'];
  return {key:parent.key,label:parent.label,sections:keys.map(key=>({
    key,label:subLabels[key],patterns:patterns.filter(p=>section(p.events,parent.units)===key),
  })).filter(s=>s.patterns.length>0)};
});
const ids=RHYTHM_GROUPS.flatMap(group=>group.sections.flatMap(section=>section.patterns.map(p=>p.id)));
if(ids.length!==74||new Set(ids).size!==74)throw new Error('Rhythm selection taxonomy must include each source pattern once');
export function updatePatternSelection(current:readonly string[],subset:readonly string[],select:boolean):string[]{
  const ids=new Set(current);
  for(const id of subset) select?ids.add(id):ids.delete(id);
  return RHYTHM_PATTERNS.map(p=>p.id).filter(id=>ids.has(id));
}
