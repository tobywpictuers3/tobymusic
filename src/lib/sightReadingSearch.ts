import type { SightReadingArchiveItem } from './storage';
import { RHYTHM_PATTERNS } from './sightReadingPatterns';
import { RHYTHM_GROUPS } from './sightReadingRhythmGroups';

const NOTE_NAMES: Record<string,string>={דו:'C',רה:'D',מי:'E',פה:'F',סול:'G',לה:'A',סי:'B'};
const NOTES=['C','D','E','F','G','A','B'];
const GROUP_WORDS:Record<string,string>={חצאים:'half',חצי:'half',רבעים:'quarter',רבע:'quarter',שמיניות:'eighth',שמינית:'eighth',ששעשריות:'sixteenth',שש־עשריות:'sixteenth',ששעשרית:'sixteenth',שש־עשרית:'sixteenth'};
const NORMALIZE=(value:string)=>value.toLocaleLowerCase('he').replace(/[״"'׳.,:;!?()]/g,' ').replace(/[־-]/g,'').replace(/\s+/g,' ').trim();
const patternsByGroup=new Map(RHYTHM_GROUPS.map(group=>[group.key,new Set(group.sections.flatMap(section=>section.patterns.map(pattern=>pattern.id)))]));
function noteRangeMatch(item:SightReadingArchiveItem,first:string,last:string):boolean {
  const start=NOTE_NAMES[first],end=NOTE_NAMES[last];
  if(!start||!end)return false;
  const low=item.metadata.low,high=item.metadata.high;
  const lowDegree=Number(low.slice(1))*7+NOTES.indexOf(low[0]);
  const highDegree=Number(high.slice(1))*7+NOTES.indexOf(high[0]);
  if(!Number.isFinite(lowDegree)||!Number.isFinite(highDegree))return false;
  // A request without an octave names pitch classes, in ascending order.
  // An exact octave-constrained query is handled by the plain-text matcher.
  for(let octave=2;octave<=6;octave++){
    const a=octave*7+NOTES.indexOf(start);
    const b=(NOTES.indexOf(end)<NOTES.indexOf(start)?octave+1:octave)*7+NOTES.indexOf(end);
    if(lowDegree<=a&&highDegree>=b)return true;
  }
  return false;
}
export function searchSightReadingArchive(item:SightReadingArchiveItem,query:string):boolean {
  const q=NORMALIZE(query);
  if(!q)return true;
  const tokens=q.split(' ').filter(Boolean);
  const foundGroups=new Set<string>();
  for(const word of tokens){
    const key=GROUP_WORDS[word];
    if(key)foundGroups.add(key);
  }
  if(foundGroups.size>0){
    const current=new Set(item.metadata.patternIds);
    if(![...foundGroups].every(group=>[...(patternsByGroup.get(group)||[])].some(id=>current.has(id))))return false;
  }
  const range=q.match(/מ\s*(דו|רה|מי|פה|סול|לה|סי)\s+עד\s+(דו|רה|מי|פה|סול|לה|סי)/);
  if(range&&!noteRangeMatch(item,range[1],range[2]))return false;
  const control=new Set(['של','עם','תווים','תוים','תבניות','מקצבים','מקצב','בטווח','מנעד','בין','עד','מ','מפתח','משקל','תרגילים','תרגיל','קריאה','מהדף']);
  const remaining=tokens.filter(token=>!GROUP_WORDS[token]&&!control.has(token)&&(!range||!range[0].includes(token)));
  const fields=[item.title,item.id,item.metadata.meter,item.metadata.low,item.metadata.high,
    item.metadata.clef,item.metadata.intervalMode,...item.metadata.patternIds].map(NORMALIZE);
  return remaining.every(token=>{
    if(token==='סול')return item.metadata.clef==='G'||item.metadata.allowedSteps.includes('G');
    if(token==='פה')return item.metadata.clef==='F'||item.metadata.allowedSteps.includes('F');
    const step=NOTE_NAMES[token];
    if(step)return item.metadata.allowedSteps.includes(step);
    return fields.some(value=>value.includes(token));
  });
}
