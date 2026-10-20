import { useMemo, useState } from 'react';
import { RHYTHM_PATTERNS, buildRhythmBar, type RhythmEvent } from '@/lib/sightReadingPatterns';

type Note = RhythmEvent & { step?: string; octave?: number; alter?: number };
const STEPS = ['C','D','E','F','G','A','B'];
const LABELS = ['דו','רה','מי','פה','סול','לה','סי'];
const TYPE: Record<number,string> = { 1:'16th',2:'eighth',3:'16th',4:'quarter',6:'quarter',8:'half' };
const DOTS = new Set([3,6]);
function xmlEscape(s:string) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function downloadXml(value:string) {
  const url=URL.createObjectURL(new Blob([value],{type:'application/vnd.recordare.musicxml+xml'}));
  const a=document.createElement('a'); a.href=url; a.download='TOBY-sight-reading.musicxml'; a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function makeXML(lines: Note[][][], title:string, beats:number, clef:string, fifths:number, doubleBar:boolean) {
  let xml='<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0">';
  xml+='<work><work-title>'+xmlEscape(title)+'</work-title></work><movement-title>'+xmlEscape(title)+'</movement-title>';
  xml+='<part-list><score-part id="P1"><part-name>Reading</part-name></score-part></part-list><part id="P1">';
  let m=0;
  for(const line of lines) for(let b=0;b<line.length;b++) {
    m++; xml+='<measure number="'+m+'">';
    if(m===1) xml+='<attributes><divisions>4</divisions><key><fifths>'+fifths+'</fifths></key><time><beats>'+beats+'</beats><beat-type>4</beat-type></time><clef><sign>'+clef+'</sign><line>'+(clef==='F'?'4':'2')+'</line></clef></attributes>';
    if(b===0&&m>1) xml+='<print new-system="yes"/>';
    for(const n of line[b]) {
      xml+='<note>';
      if(n.rest) xml+='<rest/>'; else xml+='<pitch><step>'+n.step+'</step>'+(n.alter?'<alter>'+n.alter+'</alter>':'')+'<octave>'+n.octave+'</octave></pitch>';
      xml+='<duration>'+n.units+'</duration><type>'+TYPE[n.units]+'</type>';
      if(DOTS.has(n.units)) xml+='<dot/>';
      xml+='</note>';
    }
    if(b===line.length-1&&doubleBar) xml+='<barline location="right"><bar-style>light-light</bar-style></barline>';
    xml+='</measure>';
  }
  return xml+'</part></score-partwise>';
}
export default function SightReadingWorkspace() {
  const [approved,setApproved]=useState<string[]>(RHYTHM_PATTERNS.map(p=>p.id));
  const [beats,setBeats]=useState<2|3|4|5>(4);
  const [bars,setBars]=useState(4);
  const [clef,setClef]=useState<'G'|'F'>('G');
  const [fifths,setFifths]=useState(0);
  const [title,setTitle]=useState('תרגילי קריאה מהדף');
  const [allowed,setAllowed]=useState<number[]>([0,1,2,3,4,5,6]);
  const [low,setLow]=useState(4);
  const [high,setHigh]=useState(5);
  const [doubleBar,setDoubleBar]=useState(true);
  const [lines,setLines]=useState<Note[][][]|null>(null);
  const [error,setError]=useState('');
  const selected=useMemo(()=>new Set(approved),[approved]);
  const generate=()=>{
    try {
      if(!allowed.length||low>high) throw new Error('יש לבחור תווים ומנעד תקין');
      const pitchChoices=[] as {step:string;octave:number;degree:number}[];
      for(let oct=low;oct<=high;oct++) for(const i of allowed) pitchChoices.push({step:STEPS[i],octave:oct,degree:oct*7+i});
      if(!pitchChoices.length) throw new Error('אין תווים בטווח הנבחר');
      let last: number | null=null, consecutiveLeaps=0;
      const result:Note[][][]=[];
      for(let row=0;row<16;row++){
        const newRow:Note[][]=[];
        for(let bar=0;bar<bars;bar++){
          const events=buildRhythmBar(beats,approved);
          const notes=events.map(e=>{
            if(e.rest) return {...e};
            const candidates=pitchChoices.filter(pitch=>{
              const delta=last===null?0:Math.abs(pitch.degree-last);
              return delta<=4&&(delta<=1||consecutiveLeaps<2);
            });
            if(!candidates.length) throw new Error('המנעד אינו מאפשר את המרווחים שבחרת');
            const chosen=candidates[Math.floor(Math.random()*candidates.length)];
            const delta=last===null?0:Math.abs(chosen.degree-last);
            consecutiveLeaps=delta>1?consecutiveLeaps+1:0;
            last=chosen.degree;
            return {...e,step:chosen.step,octave:chosen.octave};
          });
          if(notes.reduce((n,e)=>n+e.units,0)!==beats*4) throw new Error('שגיאת סכום תיבה');
          newRow.push(notes);
        }
        result.push(newRow);
      }
      setLines(result); setError('');
    } catch(e){setError(e instanceof Error?e.message:String(e));setLines(null);}
  };
  return <div className="rounded-xl border bg-background p-5 space-y-5" dir="rtl">
    <h2 className="text-xl font-bold">מחולל קריאה מהדף — סביבת פיתוח</h2>
    <p className="text-sm text-muted-foreground">74 תבניות המקצב נלקחו מקובץ המקור. התצוגה המקצועית ויצוא PDF יופעלו רק לאחר השלמת אריזת מנוע התיווי המקומי; כרגע אפשר לייצא MusicXML.</p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <label>כותרת<input className="block w-full border rounded p-2" value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>משקל<select className="block w-full border rounded p-2" value={beats} onChange={e=>setBeats(Number(e.target.value) as 2|3|4|5)}>{[2,3,4,5].map(n=><option key={n} value={n}>{n}/4</option>)}</select></label>
      <label>תיבות בשורה<select className="block w-full border rounded p-2" value={bars} onChange={e=>setBars(Number(e.target.value))}>{[2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label>
      <label>מפתח<select className="block w-full border rounded p-2" value={clef} onChange={e=>setClef(e.target.value as 'G'|'F')}><option value="G">סול</option><option value="F">פה</option></select></label>
      <label>סימניות סולם<select className="block w-full border rounded p-2" value={fifths} onChange={e=>setFifths(Number(e.target.value))}>{Array.from({length:15},(_,i)=>i-7).map(n=><option key={n} value={n}>{n===0?'ללא':n>0?n+' דיאזים':(-n)+' במולים'}</option>)}</select></label>
      <label>אוקטבה תחתונה<select className="block w-full border rounded p-2" value={low} onChange={e=>setLow(Number(e.target.value))}>{[2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>
      <label>אוקטבה עליונה<select className="block w-full border rounded p-2" value={high} onChange={e=>setHigh(Number(e.target.value))}>{[3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={doubleBar} onChange={e=>setDoubleBar(e.target.checked)}/>קו כפול בסוף שורה</label>
    </div>
    <fieldset className="border rounded p-3"><legend>צלילים מותרים</legend><div className="flex flex-wrap gap-3">{LABELS.map((label,i)=><label key={label} className="flex items-center gap-1"><input type="checkbox" checked={allowed.includes(i)} onChange={e=>setAllowed(prev=>e.target.checked?[...prev,i].sort():prev.filter(n=>n!==i))}/>{label}</label>)}</div></fieldset>
    <fieldset className="border rounded p-3"><legend>תבניות מקצב מותרות — {approved.length}/74</legend>
      <div className="flex gap-2 mb-3"><button className="border rounded p-2" onClick={()=>setApproved(RHYTHM_PATTERNS.map(p=>p.id))}>בחרי הכול</button><button className="border rounded p-2" onClick={()=>setApproved([])}>בטלי הכול</button></div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 max-h-56 overflow-auto">{RHYTHM_PATTERNS.map(p=><label key={p.id} className="border rounded p-2 flex items-center gap-2"><input type="checkbox" checked={selected.has(p.id)} onChange={e=>setApproved(prev=>e.target.checked?[...prev,p.id]:prev.filter(x=>x!==p.id))}/>{p.id}</label>)}</div>
      <p className="text-xs text-muted-foreground mt-2">הצגת תבניות בתיווי גרפי מדויק תתווסף עם מנוע התיווי המקומי.</p>
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <button className="bg-primary text-primary-foreground rounded px-4 py-2" onClick={generate}>צרי 16 שורות</button>
      <button className="border rounded px-4 py-2" disabled={!lines} onClick={()=>lines&&downloadXml(makeXML(lines,title,beats,clef,fifths,doubleBar))}>הורדת MusicXML</button>
    </div>
    {error&&<p className="text-red-600" role="alert">{error}</p>}
    {lines&&<p role="status">נוצרו 16 שורות, {16*bars} תיבות, והתבניות בכל תיבה אומתו. הורידי MusicXML לפתיחה ב־MuseScore או Finale.</p>}
  </div>;
}
