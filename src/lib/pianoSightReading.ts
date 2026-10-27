import { buildRhythmBar, type RhythmEvent } from './sightReadingPatterns';

export type PianoStaffSettings = {
  clef: 'G' | 'F'; low: string; high: string; allowed: number[];
  intervalMode: 'steps' | 'thirds' | 'fifth' | 'wide'; repeatShort: boolean;
  patterns: string[];
};
export type PianoRules = { oneHandAtATime: boolean; matchingRhythm: boolean;
  tenPercentHand: 'none' | 'right' | 'left'; sameDirection: boolean };
const STEPS = ['C','D','E','F','G','A','B'];
const TYPES: Record<number,string> = {1:'16th',2:'eighth',3:'eighth',4:'quarter',6:'quarter',8:'half'};
const escapeXml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
type Tone = {step:string;octave:number;degree:number};
type Event = RhythmEvent & {tone?:Tone};
const notes=(staff:PianoStaffSettings):Tone[]=>{
  const parse=(v:string)=>{const match=/^([A-G])([2-6])$/.exec(v);return match?Number(match[2])*7+STEPS.indexOf(match[1]):-1;};
  const low=parse(staff.low),high=parse(staff.high);
  if(low<0||high<low||!staff.allowed.length||!staff.patterns.length)throw new Error('יש לבחור מנעד, צלילים ומקצבים תקינים לכל חמשה');
  const all:Tone[]=[];
  for(let d=low;d<=high;d++){const step=STEPS[d%7];if(staff.allowed.includes(d%7))all.push({step,octave:Math.floor(d/7),degree:d});}
  if(!all.length)throw new Error('המנעד והצלילים המותרים אינם משאירים אף צליל');
  return all;
};
const rest=(e:RhythmEvent):Event=>({...e,rest:true,beams:undefined});
function encode(events:Event[],staff:number){
  return events.map(e=>{
    let s='<note>';
    if(e.rest)s+='<rest/>';else s+='<pitch><step>'+e.tone!.step+'</step><octave>'+e.tone!.octave+'</octave></pitch>';
    s+='<duration>'+e.units+'</duration><voice>'+staff+'</voice><type>'+TYPES[e.units]+'</type>';
    if(e.units===3||e.units===6)s+='<dot/>';
    s+='<staff>'+staff+'</staff>';
    if(!e.rest&&e.beams)for(const level of [1,2] as const)if(e.beams[level])s+='<beam number="'+level+'">'+e.beams[level]+'</beam>';
    return s+'</note>';
  }).join('');
}
export function generatePianoXml(config:{
  title:string;beats:number;bars:number;rows:number;fifths:number;doubleBar:boolean;
  right:PianoStaffSettings;left:PianoStaffSettings;rules:PianoRules;
}):string{
  const {right,left,rules,beats,bars,rows}=config;
  const choices=[notes(right),notes(left)],settings=[right,left];
  if(rules.oneHandAtATime&&rules.matchingRhythm)
    throw new Error('אי אפשר לבחור יחד נגינה ביד אחת בלבד ומקצבים זהים בשתי ידיים מנגנות');
  if(rules.sameDirection)throw new Error('כלל התנועה באותו כיוון עדיין בפיתוח ולא ניתן להפעילו בגרסה זו');
  if(rules.oneHandAtATime&&rules.sameDirection)
    throw new Error('תנועה משותפת באותו כיוון מחייבת רגעים שבהם שתי הידיים מנגנות');
  if(rules.tenPercentHand!=='none'&&rules.matchingRhythm)
    throw new Error('חלוקת 90%–10% אינה תואמת מקצב זהה בשתי ידיים פעילות');
  const last:(Tone|null)[]=[null,null],short=[false,false],leaps=[0,0];
  const count=[0,0],totalBars=rows*bars;
  const measures:string[]=[];
  let globalEvent=0;
  for(let m=0;m<totalBars;m++){
    const rhythmic=[buildRhythmBar(beats,right.patterns),buildRhythmBar(beats,rules.matchingRhythm?right.patterns:left.patterns)];
    if(rules.matchingRhythm)rhythmic[1]=rhythmic[0].map(e=>({...e}));
    // For exclusive hand-off, use a shared rhythmic grid; each event belongs to one staff.
    if(rules.oneHandAtATime)rhythmic[1]=rhythmic[0].map(e=>({...e}));
    const rendered:Event[][]=[[],[]];
    for(let hand=0;hand<2;hand++)for(const e of rhythmic[hand]){
      const ordinal=rules.oneHandAtATime?rendered[hand].length+ m*100:globalEvent++;
      let active=!e.rest;
      if(rules.oneHandAtATime&&active){
        const target=rules.tenPercentHand==='none'?(ordinal%2):(
          (ordinal%10===0)?(rules.tenPercentHand==='right'?0:1):(rules.tenPercentHand==='right'?1:0));
        active=hand===target;
      }else if(rules.tenPercentHand!=='none'&&active){
        const minority=rules.tenPercentHand==='right'?0:1;
        if(hand===minority)active=ordinal%10===0;
      }
      if(!active){rendered[hand].push(rest(e));continue;}
      const max=settings[hand].intervalMode==='steps'?1:settings[hand].intervalMode==='thirds'?2:settings[hand].intervalMode==='wide'?7:4;
      const prev=last[hand];
      const candidates=choices[hand].filter(t=>{
        const delta=prev===null?0:Math.abs(t.degree-prev.degree);
        return delta<=max&&(delta<=1||leaps[hand]<2)&&(!settings[hand].repeatShort||e.units>2||!short[hand]||t.degree===prev?.degree);
      });
      if(!candidates.length)throw new Error('לא ניתן לעמוד במגבלות המרווחים והמנעד של אחת החמשות');
      const chosen=candidates[Math.floor(Math.random()*candidates.length)];
      const delta=prev===null?0:Math.abs(chosen.degree-prev.degree);
      leaps[hand]=delta>1?leaps[hand]+1:0;short[hand]=e.units<=2;
      last[hand]=chosen;count[hand]++;
      rendered[hand].push({...e,tone:chosen});
    }
    if(rendered.some(staff=>staff.reduce((s,e)=>s+e.units,0)!==beats*4))throw new Error('משכי התיבה אינם תקינים');
    let measure='<measure number="'+(m+1)+'">';
    if(m===0)measure+='<attributes><divisions>4</divisions><key><fifths>'+config.fifths+'</fifths></key><time><beats>'+beats+'</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>'+right.clef+'</sign><line>'+(right.clef==='F'?4:2)+'</line></clef><clef number="2"><sign>'+left.clef+'</sign><line>'+(left.clef==='F'?4:2)+'</line></clef></attributes>';
    if(m>0&&m%bars===0)measure+='<print new-system="yes"/>';
    measure+=encode(rendered[0],1)+'<backup><duration>'+(beats*4)+'</duration></backup>'+encode(rendered[1],2);
    if(config.doubleBar&&m%bars===bars-1)measure+='<barline location="right"><bar-style>light-light</bar-style></barline>';
    measures.push(measure+'</measure>');
  }
  const sum=count[0]+count[1];
  if(!sum)throw new Error('לא נוצרו צלילים לנגינה');
  if(rules.tenPercentHand!=='none'){
    const minority=rules.tenPercentHand==='right'?0:1;
    const share=count[minority]/sum;
    if(Math.abs(share-.10)>.035)throw new Error('אי אפשר להשיג חלוקת 90%–10% בהגדרות המקצב שנבחרו. נסי להגדיל את התרגיל או לשנות מקצבים.');
  }
  return '<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>'+escapeXml(config.title)+'</work-title></work><movement-title>'+escapeXml(config.title)+'</movement-title><part-list><score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation><score-instrument id="I1"><instrument-name>Piano</instrument-name></score-instrument></score-part></part-list><part id="P1">'+measures.join('')+'</part></score-partwise>';
}
