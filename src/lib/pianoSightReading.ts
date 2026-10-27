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
  if(!Number.isInteger(beats)||beats<2||beats>5||!Number.isInteger(bars)||bars<1||bars>6||!Number.isInteger(rows)||rows<1||rows>30)
    throw new Error('מספר התיבות או המשקל אינו תקין');
  if(rules.oneHandAtATime&&rules.matchingRhythm)
    throw new Error('נגינה ביד אחת בלבד אינה תואמת נגינה במקצבים זהים בשתי הידיים');
  if(rules.tenPercentHand!=='none'&&rules.matchingRhythm)
    throw new Error('חלוקת 90%–10% אינה תואמת מקצבים זהים בשתי ידיים פעילות');
  if(rules.oneHandAtATime&&rules.sameDirection)
    throw new Error('נגינה לסירוגין אינה מאפשרת להשוות את כיווני המנגינות ברגע נתון');
  // Constraints that couple hands need a common event timeline. Use only
  // templates explicitly approved for BOTH hands, not secretly borrowing
  // rhythms from the right hand.
  const shared=rules.oneHandAtATime||rules.matchingRhythm||rules.sameDirection||rules.tenPercentHand!=='none';
  const intersection=right.patterns.filter(id=>left.patterns.includes(id));
  if(shared&&!intersection.length)throw new Error('לתנאים המשותפים נדרשת לפחות תבנית מקצב אחת המותרת בשתי החמשות');
  const last:(Tone|null)[]=[null,null],short=[false,false],leaps=[0,0];
  const count=[0,0],totalBars=rows*bars,measures:string[]=[];
  let slot=0;
  const choose=(hand:number,e:RhythmEvent,direction?:number):Event=>{
    if(e.rest)return rest(e);
    const max=settings[hand].intervalMode==='steps'?1:settings[hand].intervalMode==='thirds'?2:settings[hand].intervalMode==='wide'?7:4;
    const prev=last[hand];
    let candidates=choices[hand].filter(t=>{
      const delta=prev===null?0:Math.abs(t.degree-prev.degree);
      const sign=prev===null?0:Math.sign(t.degree-prev.degree);
      return delta<=max&&(delta<=1||leaps[hand]<2)&&
        (!settings[hand].repeatShort||e.units>2||!short[hand]||t.degree===prev?.degree)&&
        (direction===undefined||prev===null||sign===0||direction===0||sign===direction);
    });
    if(!candidates.length)throw new Error('לא ניתן לעמוד במנעד, במרווחים או בכיוון התנועה של אחת הידיים');
    // Make steps preferential to huge jumps while retaining variety.
    const chosen=candidates[Math.floor(Math.random()*candidates.length)];
    const delta=prev===null?0:Math.abs(chosen.degree-prev.degree);
    leaps[hand]=delta>1?leaps[hand]+1:0;short[hand]=e.units<=2;last[hand]=chosen;count[hand]++;
    return {...e,tone:chosen};
  };
  for(let m=0;m<totalBars;m++){
    const first=buildRhythmBar(beats,shared?intersection:right.patterns);
    const second=shared?first.map(e=>({...e})):buildRhythmBar(beats,left.patterns);
    const output:Event[][]=[[],[]];
    if(shared){
      for(let i=0;i<first.length;i++){
        const e=first[i],f=second[i];
        if(e.rest){output[0].push(rest(e));output[1].push(rest(f));continue;}
        const n=slot++;
        let rightOn=true,leftOn=true;
        if(rules.oneHandAtATime){
          const minority=rules.tenPercentHand==='right'?0:rules.tenPercentHand==='left'?1:-1;
          const active=minority===-1?n%2:(n%10===0?minority:1-minority);
          rightOn=active===0;leftOn=active===1;
        }else if(rules.tenPercentHand!=='none'){
          // Majority sounds on each common onset; minority every ninth
          // onset => 1 minority note per 9 majority notes (10% total).
          const minority=rules.tenPercentHand==='right'?0:1;
          rightOn=minority===0?n%9===0:true;
          leftOn=minority===1?n%9===0:true;
        }
        const previousRight=last[0],previousLeft=last[1];
        const r=rightOn?choose(0,e):rest(e);
        let direction:number|undefined;
        if(rules.sameDirection&&r.tone&&previousRight)
          direction=Math.sign(r.tone.degree-previousRight.degree);
        const l=leftOn?choose(1,f,direction):rest(f);
        // If right did not move, choose left freely: stationary movement
        // is allowed by the common-direction condition.
        if(rules.sameDirection&&r.tone&&l.tone&&previousRight&&previousLeft){
          const dr=Math.sign(r.tone.degree-previousRight.degree),dl=Math.sign(l.tone.degree-previousLeft.degree);
          if(dr*dl<0)throw new Error('תנועה נגדית נוצרה בניגוד לתנאי');
        }
        output[0].push(r);output[1].push(l);
      }
    }else{
      for(let hand=0;hand<2;hand++){
        const events=hand===0?first:second;
        for(const e of events)output[hand].push(choose(hand,e));
      }
    }
    if(output.some(staff=>staff.reduce((sum,e)=>sum+e.units,0)!==beats*4))
      throw new Error('משכי התיבה אינם תקינים');
    let measure='<measure number="'+(m+1)+'">';
    if(m===0)measure+='<attributes><divisions>4</divisions><key><fifths>'+config.fifths+'</fifths></key><time><beats>'+beats+'</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>'+right.clef+'</sign><line>'+(right.clef==='F'?4:2)+'</line></clef><clef number="2"><sign>'+left.clef+'</sign><line>'+(left.clef==='F'?4:2)+'</line></clef></attributes>';
    if(m>0&&m%bars===0)measure+='<print new-system="yes"/>';
    measure+=encode(output[0],1)+'<backup><duration>'+(beats*4)+'</duration></backup>'+encode(output[1],2);
    if(config.doubleBar&&m%bars===bars-1)measure+='<barline location="right"><bar-style>light-light</bar-style></barline>';
    measures.push(measure+'</measure>');
  }
  const sum=count[0]+count[1];
  if(!sum)throw new Error('לא נוצרו צלילים לנגינה');
  if(rules.tenPercentHand!=='none'){
    const minority=rules.tenPercentHand==='right'?0:1;
    if(Math.abs(count[minority]-Math.round(sum*.1))>1)
      throw new Error('לא ניתן להגיע לחלוקת 90%–10% עם כמות הצלילים שנוצרה');
  }
  return '<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>'+escapeXml(config.title)+'</work-title></work><movement-title>'+escapeXml(config.title)+'</movement-title><part-list><score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation><score-instrument id="I1"><instrument-name>Piano</instrument-name></score-instrument></score-part></part-list><part id="P1">'+measures.join('')+'</part></score-partwise>';
}
