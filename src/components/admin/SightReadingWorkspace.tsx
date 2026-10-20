import { useMemo, useState } from 'react';
import { RHYTHM_PATTERNS, buildRhythmBar, type RhythmEvent } from '@/lib/sightReadingPatterns';
import { EngravedPattern, EngravedScore } from './SightReadingVerovio';
import { addSightReadingArchiveItem, getSightReadingArchive, type SightReadingArchiveItem } from '@/lib/storage';

type Note = RhythmEvent & { step?: string; octave?: number; alter?: number };
const STEPS = ['C','D','E','F','G','A','B'];
const LABELS = ['דו','רה','מי','פה','סול','לה','סי'];
const NOTE_OPTIONS=Array.from({length:35},(_,index)=>{
  const octave=Math.floor(index/7)+2,step=STEPS[index%7];
  const register=octave===2?'גדול':octave===3?'קטן':octave===4?'ראשון':octave===5?'שני':'שלישי';
  return {degree:octave*7+index%7,step,octave,label:LABELS[index%7]+' '+register,value:step+octave};
});
const rhythmGroup=(events:RhythmEvent[]):number=>{
  const minimum=Math.min(...events.map(e=>e.units));
  return minimum<=1?1:minimum<=2?2:minimum<=4?4:8;
};
const RHYTHM_GROUPS=[{units:8,label:'חצאים'},{units:4,label:'רבעים'},{units:2,label:'שמיניות'},{units:1,label:'שש־עשריות'}];
const randomId=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2);

const TYPE: Record<number,string> = { 1:'16th',2:'eighth',3:'eighth',4:'quarter',6:'quarter',8:'half' };
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
      if (!n.rest && n.beams) for (const level of [1,2] as const) {
        const beam=n.beams[level];
        if(beam) xml+='<beam number="'+level+'">'+beam+'</beam>';
      }
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
  const [title,setTitle]=useState('');
  const [allowed,setAllowed]=useState<number[]>([0,1,2,3,4,5,6]);
  const [low,setLow]=useState('G3');
  const [high,setHigh]=useState('C5');
  const [intervalMode,setIntervalMode]=useState<'steps'|'thirds'|'fifth'|'wide'>('fifth');
  const [repeatShort,setRepeatShort]=useState(false);
  const [archive,setArchive]=useState<SightReadingArchiveItem[]>(()=>getSightReadingArchive());
  const [selectedArchive,setSelectedArchive]=useState<SightReadingArchiveItem|null>(null);
  const [archiveSearch,setArchiveSearch]=useState('');
  const [archiveStatus,setArchiveStatus]=useState('');
  const [documentTitle,setDocumentTitle]=useState('');

  const [doubleBar,setDoubleBar]=useState(true);
  const [lines,setLines]=useState<Note[][][]|null>(null);
  const [error,setError]=useState('');
  const selected=useMemo(()=>new Set(approved),[approved]);


  const filteredArchive=archive.filter(item=>{
    const term=archiveSearch.trim().toLocaleLowerCase('he');
    return !term||[item.title,item.id,item.metadata.meter,item.metadata.low,item.metadata.high,
      item.metadata.clef,item.metadata.intervalMode,...item.metadata.patternIds].some(v=>v.toLocaleLowerCase().includes(term));
  });
  const generate=()=>{
    try {
      const lowNote=NOTE_OPTIONS.find(n=>n.value===low),highNote=NOTE_OPTIONS.find(n=>n.value===high);
      if(!lowNote||!highNote||lowNote.degree>highNote.degree||!allowed.length) throw new Error('יש לבחור תווים ומנעד תקין');
      const pitchChoices=[] as {step:string;octave:number;degree:number}[];
      for(const note of NOTE_OPTIONS) if(note.degree>=lowNote.degree&&note.degree<=highNote.degree&&allowed.includes(STEPS.indexOf(note.step)))pitchChoices.push({step:note.step,octave:note.octave,degree:note.degree});
      if(!pitchChoices.length) throw new Error('אין תווים בטווח הנבחר');
      let last: number | null=null, consecutiveLeaps=0, lastNote: {step:string;octave:number;degree:number}|null=null, previousShort=false;
      const result:Note[][][]=[];
      for(let row=0;row<16;row++){
        const newRow:Note[][]=[];
        for(let bar=0;bar<bars;bar++){
          const events=buildRhythmBar(beats,approved);
          const notes=events.map(e=>{
            if(e.rest) return {...e};
            const isShort=e.units<=2;
            const maxDistance=intervalMode==='steps'?1:intervalMode==='thirds'?2:intervalMode==='wide'?7:4;
            const candidates=pitchChoices.filter(pitch=>{
              const delta=last===null?0:Math.abs(pitch.degree-last);
              return delta<=maxDistance&&(delta<=1||consecutiveLeaps<2)&&(!repeatShort||!isShort||!previousShort||!lastNote||pitch.degree===lastNote.degree);
            });
            if(!candidates.length) throw new Error('המנעד אינו מאפשר את המרווחים שבחרת');
            const chosen=candidates[Math.floor(Math.random()*candidates.length)];
            const delta=last===null?0:Math.abs(chosen.degree-last);
            consecutiveLeaps=delta>1?consecutiveLeaps+1:0;
            last=chosen.degree;lastNote=chosen;previousShort=isShort;
            return {...e,step:chosen.step,octave:chosen.octave};
          });
          if(notes.reduce((n,e)=>n+e.units,0)!==beats*4) throw new Error('שגיאת סכום תיבה');
          newRow.push(notes);
        }
        result.push(newRow);
      }
      const nextSerial=Math.max(0,...getSightReadingArchive().map(item=>item.serial))+1;
      const nextTitle=title.trim()||'תרגיל מספר '+nextSerial;
      const item:SightReadingArchiveItem={
        id:randomId(),serial:nextSerial,createdAt:new Date().toISOString(),title:nextTitle,
        xml:makeXML(result,nextTitle,beats,clef,fifths,doubleBar),
        metadata:{meter:beats+'/4',barsPerLine:bars,clef,low,high,
          allowedSteps:allowed.map(i=>STEPS[i]),patternIds:[...approved],
          intervalMode,repeatedShortNotes:repeatShort}
      };
      addSightReadingArchiveItem(item);
      setArchive(getSightReadingArchive());setSelectedArchive(null);
      setArchiveStatus('התרגיל נוסף למאגר והועבר לסנכרון Dropbox. נדרש אימות שמירה בענן.');
      setLines(result);setDocumentTitle(nextTitle);setError('');
    } catch(e){setError(e instanceof Error?e.message:String(e));setLines(null);}
  };
  return <div className="rounded-xl border bg-background p-5 space-y-5" dir="rtl">
    <h2 className="text-xl font-bold">מחולל קריאה מהדף — סביבת פיתוח</h2>
    <p className="text-sm text-muted-foreground">74 תבניות המקצב נלקחו מקובץ המקור, כולל הוראות הקורות המדויקות. הצגת המקצבים והתרגיל מתבצעת במנוע Verovio עם גופני תיווי Bravura המובנים באתר. אין צורך לפתוח תוכנה אחרת.</p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <label>כותרת<input className="block w-full border rounded p-2" value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>משקל<select className="block w-full border rounded p-2" value={beats} onChange={e=>setBeats(Number(e.target.value) as 2|3|4|5)}>{[2,3,4,5].map(n=><option key={n} value={n}>{n}/4</option>)}</select></label>
      <label>תיבות בשורה<select className="block w-full border rounded p-2" value={bars} onChange={e=>setBars(Number(e.target.value))}>{[2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label>
      <label>מפתח<select className="block w-full border rounded p-2" value={clef} onChange={e=>setClef(e.target.value as 'G'|'F')}><option value="G">סול</option><option value="F">פה</option></select></label>
      <label>סימניות סולם<select className="block w-full border rounded p-2" value={fifths} onChange={e=>setFifths(Number(e.target.value))}>{Array.from({length:15},(_,i)=>i-7).map(n=><option key={n} value={n}>{n===0?'ללא':n>0?n+' דיאזים':(-n)+' במולים'}</option>)}</select></label>
      <label>הצליל הנמוך ביותר<select className="block w-full border rounded p-2" value={low} onChange={e=>setLow(e.target.value)}>{NOTE_OPTIONS.map(n=><option key={n.value} value={n.value}>{n.label} ({n.value})</option>)}</select></label>
      <label>הצליל הגבוה ביותר<select className="block w-full border rounded p-2" value={high} onChange={e=>setHigh(e.target.value)}>{NOTE_OPTIONS.map(n=><option key={n.value} value={n.value}>{n.label} ({n.value})</option>)}</select></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={doubleBar} onChange={e=>setDoubleBar(e.target.checked)}/>קו כפול בסוף שורה</label>
    </div>
    <p className="text-xs text-muted-foreground">לה ראשון (A4) = 440Hz. סול קטן = G3, דו שני = C5. ברירת המחדל: סול קטן עד דו שני.</p>
    <fieldset className="border rounded p-3"><legend>צלילים מותרים</legend><div className="flex flex-wrap gap-3">{LABELS.map((label,i)=><label key={label} className="flex items-center gap-1"><input type="checkbox" checked={allowed.includes(i)} onChange={e=>setAllowed(prev=>e.target.checked?[...prev,i].sort():prev.filter(n=>n!==i))}/>{label}</label>)}</div></fieldset>
    <fieldset className="border rounded p-3 space-y-2"><legend>הגבלות מלודיות</legend>
      <label>מרווחים מותרים<select className="block w-full border rounded p-2" value={intervalMode} onChange={e=>setIntervalMode(e.target.value as typeof intervalMode)}>
        <option value="steps">צעדים בלבד (עד סקונדה)</option>
        <option value="thirds">צעדים וטרצות בלבד</option>
        <option value="fifth">קפיצות עד קווינטה — ברירת מחדל</option>
        <option value="wide">מאפשר גם קפיצות מעל קווינטה (עד אוקטבה)</option>
      </select></label>
      <label className="flex gap-2 items-center"><input type="checkbox" checked={repeatShort} onChange={e=>setRepeatShort(e.target.checked)}/>שמיניות ושש־עשריות רצופות באותו צליל בלבד</label>
      <p className="text-xs text-muted-foreground">לא יותר משתי קפיצות רצופות נשמר גם במצב המורחב.</p>
    </fieldset>
    <fieldset className="border rounded p-3"><legend>תבניות מקצב מותרות — {approved.length}/74</legend>
      <div className="flex gap-2 mb-3"><button className="border rounded p-2" onClick={()=>setApproved(RHYTHM_PATTERNS.map(p=>p.id))}>בחרי הכול</button><button className="border rounded p-2" onClick={()=>setApproved([])}>בטלי הכול</button></div>
      <div className="max-h-[520px] overflow-y-auto space-y-4">{RHYTHM_GROUPS.map(group=><section key={group.units}>
      <h3 className="font-semibold mb-2">{group.label}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{RHYTHM_PATTERNS.filter(p=>rhythmGroup(p.events)===group.units).map(p=><label key={p.id} className="border rounded-lg p-2 bg-white text-slate-900 flex flex-col gap-1 cursor-pointer"><span className="flex items-center justify-between"><span className="font-medium">{p.id}</span><input type="checkbox" checked={selected.has(p.id)} onChange={e=>setApproved(prev=>e.target.checked?[...prev,p.id]:prev.filter(x=>x!==p.id))}/></span><EngravedPattern id={p.id} events={p.events}/></label>)}</div></section>)}</div>
      <p className="text-xs text-muted-foreground mt-2">המקצבים מוצגים ללא חמשה או משקל. התווים, הדמימות והקורות מבוססים על ההוראות המקוריות בקובץ שסיפקת.</p>
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <button className="bg-primary text-primary-foreground rounded px-4 py-2" onClick={generate}>צרי 16 שורות</button>
      <button className="border rounded px-4 py-2" disabled={!lines} onClick={()=>lines&&downloadXml(makeXML(lines,documentTitle,beats,clef,fifths,doubleBar))}>הורדת MusicXML</button>
      
    </div>
    {error&&<p className="text-red-600" role="alert">{error}</p>}
    {lines&&<div className="space-y-3" id="sight-reading-preview"><p role="status">נוצרו 16 שורות, {16*bars} תיבות, והתבניות בכל תיבה אומתו. התרגיל מוצג כאן למטה.</p><EngravedScore xml={makeXML(lines,documentTitle,beats,clef,fifths,doubleBar)}/></div>}
    <section className="border rounded p-3 space-y-3">
      <h3 className="font-bold">מאגר תרגילי קריאה מהדף ({archive.length})</h3>
      <input className="border rounded p-2 w-full" value={archiveSearch} onChange={e=>setArchiveSearch(e.target.value)} placeholder="חיפוש לפי כותרת, משקל, מנעד, מפתח או מזהה תבנית"/>
      <div className="max-h-72 overflow-auto space-y-2">{filteredArchive.map(item=><button key={item.id} className="block w-full text-right border rounded p-2 hover:bg-muted" onClick={()=>setSelectedArchive(item)}>
        <strong>{item.title}</strong> · {item.metadata.meter} · {item.metadata.low}–{item.metadata.high} · {item.createdAt.slice(0,10)}
      </button>)}</div>
      {selectedArchive&&<div className="border rounded p-2 space-y-2"><p>נבחר: {selectedArchive.title}</p>
      <button className="border rounded p-2" onClick={()=>downloadXml(selectedArchive.xml)}>הורדת MusicXML מהמאגר</button>
      <EngravedScore xml={selectedArchive.xml}/></div>}
      {archiveStatus&&<p role="status">{archiveStatus}</p>}
      <p className="text-xs text-muted-foreground">שיוך משימות לתלמידות, שליחת PDF במייל, ואימות ענן: עדיין בפיתוח. אין לשלוח לפני חיבור למנגנון המשימות המאומת.</p>
    </section>
    <section className="border rounded p-3 text-sm"><strong>תרגול פסנתר — שתי חמשות</strong><p>מתוכנן לשלב מתקדם לאחר הגדרת כללי שתי הידיים, המפתחות והקצב. עדיין אינו פעיל.</p></section>
  </div>;
}
