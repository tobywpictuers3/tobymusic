import { useMemo, useState } from 'react';
import { RHYTHM_PATTERNS, buildRhythmBar, type RhythmEvent } from '@/lib/sightReadingPatterns';
import { EngravedPattern, EngravedScore, makeSightReadingPdf } from './SightReadingVerovio';
import { addSightReadingArchiveItem, getSightReadingArchive, getStudents, getFiles, addFile, isDevMode, type SightReadingArchiveItem } from '@/lib/storage';
import { workerApi } from '@/lib/workerApi';
import { RHYTHM_GROUPS, updatePatternSelection } from '@/lib/sightReadingRhythmGroups';
import { searchSightReadingArchive } from '@/lib/sightReadingSearch';

type Note = RhythmEvent & { step?: string; octave?: number; alter?: number };
const STEPS = ['C','D','E','F','G','A','B'];
const LABELS = ['דו','רה','מי','פה','סול','לה','סי'];
const NOTE_OPTIONS=Array.from({length:35},(_,index)=>{
  const octave=Math.floor(index/7)+2,step=STEPS[index%7];
  const register=octave===2?'גדול':octave===3?'קטן':octave===4?'ראשון':octave===5?'שני':'שלישי';
  return {degree:octave*7+index%7,step,octave,label:LABELS[index%7]+' '+register,value:step+octave};
});
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
  const [studentIds,setStudentIds]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [deliveryStatus,setDeliveryStatus]=useState('');
  const [documentTitle,setDocumentTitle]=useState('');
  const [mailStatus,setMailStatus]=useState('');

  const [doubleBar,setDoubleBar]=useState(true);
  const [lines,setLines]=useState<Note[][][]|null>(null);
  const [error,setError]=useState('');
  const selected=useMemo(()=>new Set(approved),[approved]);
  const setGroupSelection=(ids:string[],checked:boolean)=>setApproved(prev=>updatePatternSelection(prev,ids,checked));
  const groupIds=(group:typeof RHYTHM_GROUPS[number])=>group.sections.flatMap(section=>section.patterns.map(p=>p.id));


  const filteredArchive=archive.filter(item=>searchSightReadingArchive(item,archiveSearch));
  const currentItem=selectedArchive|| (lines ? archive.find(x=>x.title===documentTitle&&x.xml===makeXML(lines,documentTitle,beats,clef,fifths,doubleBar))||null : null);
  const downloadPdf=async(item:SightReadingArchiveItem)=>{
    setBusy(true);setDeliveryStatus('');
    try {
      const pdf=await makeSightReadingPdf(item.xml);
      const url=URL.createObjectURL(pdf),a=document.createElement('a');
      a.href=url;a.download='TOBY-reading-'+item.serial+'.pdf';a.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e){setDeliveryStatus('שגיאה בהפקת PDF: '+String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  };
  const printPdf=async(item:SightReadingArchiveItem)=>{
    // The window is opened synchronously to avoid browser popup blockers.
    const popup=window.open('','_blank');
    if(!popup){setDeliveryStatus('הדפדפן חסם חלון הדפסה. הורידי PDF והדפיסי אותו מהמחשב.');return;}
    popup.document.title='הדפסת תרגיל '+item.serial;
    popup.document.body.textContent='מכין PDF להדפסה...';
    setBusy(true);setDeliveryStatus('');
    try {
      const pdf=await makeSightReadingPdf(item.xml);
      const url=URL.createObjectURL(pdf);
      popup.location.href=url;
      // Browser PDF viewers expose their own Print button / Ctrl+P.
      // Calling popup.print() on a PDF URL is unreliable across browsers.
      setDeliveryStatus('חלון ה-PDF נפתח. לחצי על סמל המדפסת בחלון, או Ctrl+P.');
      window.setTimeout(()=>URL.revokeObjectURL(url),120000);
    }catch(e){
      popup.close();
      setDeliveryStatus('שגיאה בהכנת הדפסה: '+String(e instanceof Error?e.message:e));
    }finally{setBusy(false);}
  };
  const prepareEmail=async(item:SightReadingArchiveItem)=>{
    const students=getStudents().filter(s=>studentIds.includes(s.id));
    const emails=[...new Set(students.map(s=>s.email?.trim()).filter((value):value is string=>Boolean(value)))];
    if(!students.length||emails.length!==students.length){
      setMailStatus('בחרי תלמידות שלכולן כתובת מייל תקינה לפני הכנת הטיוטה.');return;
    }
    await downloadPdf(item);
    const subject='תרגיל קריאה מהדף: '+item.title;
    const body='שלום,\nמצורף תרגיל הקריאה מהדף '+item.title+'.\n';
    // mailto cannot attach binary files. Explicitly require manual attachment.
    const link='mailto:'+emails.map(encodeURIComponent).join(',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
    window.location.href=link;
    setMailStatus('הורד PDF ונפתחה טיוטת מייל. יש לצרף אליה את הקובץ שהורד וללחוץ שליחה. לא נשלח מייל אוטומטי.');
  };
  const assignPdf=async(item:SightReadingArchiveItem)=>{
    if(isDevMode()){setDeliveryStatus('לא ניתן לשלוח מתוך סביבת פיתוח');return;}
    if(!studentIds.length){setDeliveryStatus('בחרי לפחות תלמידה אחת');return;}
    setBusy(true);setDeliveryStatus('');
    try{
      const targetStudents=getStudents().filter(student=>studentIds.includes(student.id));
      if(targetStudents.length!==studentIds.length)throw new Error('יש בחירה שאינה תואמת לתלמידה פעילה במערכת');
      const pdf=await makeSightReadingPdf(item.xml);
      let added=0;
      for(const student of targetStudents){
        const marker='sight-reading:'+item.id;
        if(getFiles().some(file=>file.studentId===student.id&&file.description?.includes(marker)))continue;
        // Use a distinct Dropbox attachment per student: deleting a student's file
        // must not delete a shared master or other students' assignments.
        const fileName='TOBY-reading-'+item.serial+'-'+randomId()+'.pdf';
        const upload=await workerApi.uploadAttachment(new File([pdf],fileName,{type:'application/pdf'}));
        if(!upload.success||!upload.data?.webViewLink)throw new Error(upload.error||'Dropbox לא אישר העלאת קובץ לאחת התלמידות');
        addFile({
          studentId:student.id,
          name:item.title+'.pdf',
          description:'תרגיל קריאה מהדף · '+marker,
          webViewLink:upload.data.webViewLink,
          dropboxPath:upload.data.path,
          kind:'pdf',
          mimeType:'application/pdf',
          size:upload.data.size??pdf.size,
        });
        added++;
      }
      setDeliveryStatus('קובצי PDF הועלו, '+added+' שיוכים נוספו לאזור האישי והועברו לסנכרון. אימות התצוגה בחשבונות התלמידות וקריאה חוזרת מ-Dropbox עדיין נדרשים.');
    }catch(e){setDeliveryStatus('לא ניתן להשלים שיתוף: '+String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  };
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
          allowedSteps:allowed.map(i=>STEPS[i]),patternIds:[...new Set(result.flat(2).map(event=>event.sourceId))],
          intervalMode,repeatedShortNotes:repeatShort}
      };
      addSightReadingArchiveItem(item);
      setArchive(getSightReadingArchive());setSelectedArchive(item);
      setArchiveStatus('התרגיל נוסף למאגר והועבר לסנכרון Dropbox. נדרש אימות שמירה בענן.');
      setLines(result);setDocumentTitle(nextTitle);setError('');
    } catch(e){setError(e instanceof Error?e.message:String(e));setLines(null);}
  };
  return <div className="rounded-xl border bg-background p-3 sm:p-4 space-y-3" dir="rtl">
    <h2 className="font-bold text-lg">מחולל קריאה מהדף</h2>
    
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-sm [&_select]:py-1 [&_input]:py-1">
      <label>כותרת<input className="block w-full border rounded p-2" value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>משקל<select className="block w-full border rounded p-2" value={beats} onChange={e=>setBeats(Number(e.target.value) as 2|3|4|5)}>{[2,3,4,5].map(n=><option key={n} value={n}>{n}/4</option>)}</select></label>
      <label>תיבות בשורה<select className="block w-full border rounded p-2" value={bars} onChange={e=>setBars(Number(e.target.value))}>{[2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label>
      <label>מפתח<select className="block w-full border rounded p-2" value={clef} onChange={e=>setClef(e.target.value as 'G'|'F')}><option value="G">סול</option><option value="F">פה</option></select></label>
      <label>סימניות סולם<select className="block w-full border rounded p-2" value={fifths} onChange={e=>setFifths(Number(e.target.value))}>{Array.from({length:15},(_,i)=>i-7).map(n=><option key={n} value={n}>{n===0?'ללא':n>0?n+' דיאזים':(-n)+' במולים'}</option>)}</select></label>
      <label>הצליל הנמוך ביותר<select className="block w-full border rounded p-2" value={low} onChange={e=>setLow(e.target.value)}>{NOTE_OPTIONS.map(n=><option key={n.value} value={n.value}>{n.label} ({n.value})</option>)}</select></label>
      <label>הצליל הגבוה ביותר<select className="block w-full border rounded p-2" value={high} onChange={e=>setHigh(e.target.value)}>{NOTE_OPTIONS.map(n=><option key={n.value} value={n.value}>{n.label} ({n.value})</option>)}</select></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={doubleBar} onChange={e=>setDoubleBar(e.target.checked)}/>קו כפול בסוף שורה</label>
    </div>
    
    <fieldset className="border rounded px-2 py-1 text-sm"><legend>צלילים מותרים</legend><div className="flex flex-wrap gap-3">{LABELS.map((label,i)=><label key={label} className="flex items-center gap-1"><input type="checkbox" checked={allowed.includes(i)} onChange={e=>setAllowed(prev=>e.target.checked?[...prev,i].sort():prev.filter(n=>n!==i))}/>{label}</label>)}</div></fieldset>
    <fieldset className="border rounded px-2 py-1 text-sm"><legend>הגבלות מלודיות</legend>
      <label>מרווחים מותרים<select className="block w-full border rounded p-2" value={intervalMode} onChange={e=>setIntervalMode(e.target.value as typeof intervalMode)}>
        <option value="steps">צעדים בלבד (עד סקונדה)</option>
        <option value="thirds">צעדים וטרצות בלבד</option>
        <option value="fifth">קפיצות עד קווינטה — ברירת מחדל</option>
        <option value="wide">מאפשר גם קפיצות מעל קווינטה (עד אוקטבה)</option>
      </select></label>
      <label className="flex gap-2 items-center"><input type="checkbox" checked={repeatShort} onChange={e=>setRepeatShort(e.target.checked)}/>שמיניות ושש־עשריות רצופות באותו צליל בלבד</label>
      
    </fieldset>
    <section className="border rounded px-2 py-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <strong>תבניות מקצב: {approved.length}/74</strong>
        <div className="flex gap-2">
          <button className="underline" onClick={()=>setApproved(RHYTHM_PATTERNS.map(p=>p.id))}>בחרי הכול</button>
          <button className="underline" onClick={()=>setApproved([])}>בטלי הכול</button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
        {RHYTHM_GROUPS.map(group=>{
          const ids=groupIds(group),selectedCount=ids.filter(id=>selected.has(id)).length;
          return <details key={group.key} className="border rounded-md p-2 text-sm min-w-0">
            <summary className="cursor-pointer font-semibold select-none">{group.label} <span className="text-muted-foreground font-normal">({selectedCount}/{ids.length})</span></summary>
            <div className="flex gap-2 mt-2">
              <button type="button" className="underline" onClick={()=>setGroupSelection(ids,true)}>סמני הכול</button>
              <button type="button" className="underline" onClick={()=>setGroupSelection(ids,false)}>בטלי הכול</button>
            </div>
            {group.sections.map(section=>{
              const subset=section.patterns.map(p=>p.id);
              return <details key={section.key} className="border-t mt-2 pt-1">
                <summary className="cursor-pointer">{section.label} ({subset.filter(id=>selected.has(id)).length}/{subset.length})</summary>
                <div className="flex gap-2 my-1">
                  <button className="underline" onClick={()=>setGroupSelection(subset,true)}>סמני</button>
                  <button className="underline" onClick={()=>setGroupSelection(subset,false)}>בטלי</button>
                </div>
                <div className="grid grid-cols-1 gap-1 max-h-64 overflow-auto">
                  {section.patterns.map(p=><label key={p.id} className="border rounded px-1 py-1 bg-white text-slate-900">
                    <span className="flex justify-between"><span>{p.id}</span><input type="checkbox" checked={selected.has(p.id)} onChange={e=>setGroupSelection([p.id],e.target.checked)}/></span>
                    <EngravedPattern id={p.id} events={p.events}/>
                  </label>)}
                </div>
              </details>;
            })}
          </details>;
        })}
      </div>
    </section>
    <div className="flex flex-wrap gap-2">
      <button className="bg-primary text-primary-foreground rounded px-4 py-2" onClick={generate}>צרי 16 שורות</button>
      <button className="border rounded px-3 py-1.5" disabled={!currentItem} onClick={()=>currentItem&&downloadXml(currentItem.xml)}>XML</button>
      <button className="border rounded px-3 py-1.5" disabled={!currentItem||busy} onClick={()=>currentItem&&void downloadPdf(currentItem)}>הורדת PDF</button>
      <button className="border rounded px-3 py-1.5" disabled={!currentItem||busy} onClick={()=>currentItem&&void printPdf(currentItem)}>הדפסה</button>
      <button className="border rounded px-3 py-1.5" disabled={!currentItem} onClick={()=>document.getElementById('sightreading-delivery')?.scrollIntoView({behavior:'smooth',block:'start'})}>שליחה לתלמידות</button>
      <span className="text-xs text-muted-foreground self-center">{currentItem?'נשמר במאגר: '+currentItem.title:'צרי תרגיל כדי להפעיל שמירה והפצה'}</span>
      
    </div>
    {error&&<p className="text-red-600" role="alert">{error}</p>}
    {lines&&<details className="border rounded p-2" id="sight-reading-preview">
       <summary className="cursor-pointer font-medium">הצגת התרגיל החדש — {documentTitle} (16 שורות)</summary>
       <EngravedScore xml={makeXML(lines,documentTitle,beats,clef,fifths,doubleBar)}/>
     </details>}
    <section className="border rounded p-2 space-y-2">
      <h3 className="font-bold text-sm">מאגר התרגילים ({archive.length})</h3>
      <input className="border rounded p-2 w-full" value={archiveSearch} onChange={e=>setArchiveSearch(e.target.value)} placeholder="חיפוש חופשי: שמיניות, רבעים, מדו עד סול, 4/4..."/>
      <div className="max-h-40 overflow-auto space-y-1">{filteredArchive.map(item=><button key={item.id} className="block w-full text-right border rounded p-2 hover:bg-muted" onClick={()=>setSelectedArchive(item)}>
        <strong>{item.title}</strong> · {item.metadata.meter} · {item.metadata.low}–{item.metadata.high} · {item.createdAt.slice(0,10)}
      </button>)}</div>
      {selectedArchive&&<div className="border rounded p-2 space-y-2"><p>נבחר: {selectedArchive.title}</p>
      <div className="flex gap-2 flex-wrap"><button className="border rounded p-2" onClick={()=>downloadXml(selectedArchive.xml)}>הורדת MusicXML מהמאגר</button>
      <button className="border rounded p-2" disabled={busy} onClick={()=>void downloadPdf(selectedArchive)}>הורדת PDF למחשב</button>
      <button className="border rounded p-2" disabled={busy} onClick={()=>void printPdf(selectedArchive)}>הדפסת התרגיל</button></div>
      <fieldset id="sightreading-delivery" className="border rounded p-2"><legend>שיוך PDF לאזור האישי ושליחה</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">{getStudents().map(student=><label key={student.id} className="flex gap-2 items-center"><input type="checkbox" checked={studentIds.includes(student.id)} onChange={e=>setStudentIds(ids=>e.target.checked?[...ids,student.id]:ids.filter(id=>id!==student.id))}/>{student.firstName} {student.lastName}</label>)}</div>
      <button className="border rounded p-2 mt-2" disabled={busy||!studentIds.length} onClick={()=>void assignPdf(selectedArchive)}>העלה PDF ושייך לתלמידות שנבחרו</button>
      <div className="flex gap-2 flex-wrap"><button className="border rounded p-2 mt-2" disabled={busy||!studentIds.length} onClick={()=>void prepareEmail(selectedArchive)}>הכנת מייל והורדת PDF לצירוף</button></div>
      <p className="text-xs text-muted-foreground">השליחה האוטומטית עם צרופה עדיין אינה פעילה; הכנת המייל פותחת טיוטה, ואת הקובץ יש לצרף ידנית.</p>
      {mailStatus&&<p role="status">{mailStatus}</p>}
      {deliveryStatus&&<p role="status">{deliveryStatus}</p>}
      </fieldset>
      <details className="border rounded p-2"><summary className="cursor-pointer">תצוגת התרגיל השמור</summary><EngravedScore xml={selectedArchive.xml}/></details></div>}
      {archiveStatus&&<p role="status">{archiveStatus}</p>}
      <p className="text-xs text-muted-foreground">שיוך PDF משתמש במנגנון הקבצים הקיים; שליחה כצרופה במייל ואימות סנכרון בענן טרם הושלמו.</p>
    </section>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">תרגול פסנתר בשתי חמשות (בפיתוח)</summary>בהמשך, לאחר הגדרת כללי שתי הידיים והמקצב.</details>
  </div>;
}
