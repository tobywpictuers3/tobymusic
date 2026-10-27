import { useMemo, useState } from 'react';
import { RHYTHM_PATTERNS, buildRhythmBar, type RhythmEvent } from '@/lib/sightReadingPatterns';
import { EngravedPattern, EngravedScore, makeSightReadingPdf } from './SightReadingVerovio';
import { addSightReadingArchiveItem, getSightReadingArchive, getStudents, getFiles, addFile, isDevMode, type SightReadingArchiveItem } from '@/lib/storage';
import { workerApi, teacherDirectMailStatus, teacherDirectSend, teacherDirectReceipt, probeStudentsGmailOauth } from '@/lib/workerApi';
import { hybridSync } from '@/lib/hybridSync';
import { addMessage, getMessages } from '@/lib/messages';
import { RHYTHM_GROUPS, updatePatternSelection } from '@/lib/sightReadingRhythmGroups';
import { searchSightReadingArchive } from '@/lib/sightReadingSearch';
import { generatePianoXml, type PianoRules } from '@/lib/pianoSightReading';

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
  const [piano,setPiano]=useState(false);
  const [leftClef,setLeftClef]=useState<'G'|'F'>('F');
  const [leftLow,setLeftLow]=useState('C3');
  const [leftHigh,setLeftHigh]=useState('G4');
  const [leftAllowed,setLeftAllowed]=useState<number[]>([0,1,2,3,4,5,6]);
  const [leftInterval,setLeftInterval]=useState<'steps'|'thirds'|'fifth'|'wide'>('fifth');
  const [leftRepeatShort,setLeftRepeatShort]=useState(false);
  const [leftPatterns,setLeftPatterns]=useState<string[]>(RHYTHM_PATTERNS.map(p=>p.id));
  const [pianoRules,setPianoRules]=useState<PianoRules>({oneHandAtATime:false,matchingRhythm:false,tenPercentHand:'none',sameDirection:false});
  const changePianoRules=(rules:Partial<PianoRules>)=>setPianoRules(prev=>({...prev,...rules}));
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
  const [connectionStatus,setConnectionStatus]=useState('');
  const checkDropboxConnection=async()=>{
    setConnectionStatus('בודק גישה לשרת הנתונים…');
    try{
      const response=await workerApi.downloadLatest();
      setConnectionStatus(response.success
        ? 'שרת הנתונים נגיש. בדיקה זו אינה מאמתת עדיין הרשאות העלאה או Gmail.'
        : 'בדיקת שרת הנתונים נכשלה: '+String(response.error||'שגיאה לא ידועה'));
    }catch(e){setConnectionStatus('הדפדפן לא הצליח להגיע לשרת הנתונים: '+String(e instanceof Error?e.message:e));}
  };
  const explainNetworkFailure=(error:unknown,stage:string)=>{
    const value=error instanceof Error?error.message:String(error);
    return /failed to fetch|networkerror|load failed|network request failed/i.test(value)
      ? 'כשל תקשורת בשלב '+stage+'. ייתכן שכתובת ה-Worker חסומה ברשת או שהשרת אינו נגיש. לא ניתן לאשר השלמה. בדקי חיבור לשרת לפני ניסיון נוסף.'
      : 'כשל בשלב '+stage+': '+value;
  };
  const checkGmailOauth=async()=>{
    setMailStatus('בודק את חשבון Gmail המחובר — ללא שליחת הודעה…');
    try{
      const result=await probeStudentsGmailOauth();
      setMailStatus(result.expectedAccountMatched
        ?'הרשאת Gmail תקפה והחשבון המחובר אומת. עדיין נדרש להפעיל בנפרד את מצב השליחה הייעודי.'
        :'בדיקת Gmail הסתיימה ללא אימות החשבון הרצוי.');
    }catch(error){
      setMailStatus('בדיקת Gmail נכשלה: '+String(error instanceof Error?error.message:error)+'. לא נשלח מייל.');
    }
  };
  const sendReadingEmail=async(item:SightReadingArchiveItem)=>{
    if(isDevMode()){setMailStatus('שליחת Gmail חסומה במצב פיתוח.');return;}
    const recipients=getStudents().filter(student=>studentIds.includes(student.id));
    if(!recipients.length||recipients.length!==studentIds.length){setMailStatus('יש לבחור תלמידה אחת לפחות.');return;}
    setMailStatus('מאמת שמנגנון הדואר הייעודי מאושר לשליחה…');
    let mode: Awaited<ReturnType<typeof teacherDirectMailStatus>>;
    try{mode=await teacherDirectMailStatus();}
    catch(e){setMailStatus('לא ניתן לאמת את שירות הדואר החדש: '+String(e instanceof Error?e.message:e));return;}
    if(mode.mode==='disabled'){
      setMailStatus('שירות שליחת Gmail החדש עדיין חסום להפעלה. ניתן לשייך קובץ לאזור האישי ללא מייל.');
      return;
    }
    if(mode.mode==='test_1111_manual'&&
      (recipients.length!==1||String(recipients[0].personalCode||'')!=='1111')){
      setMailStatus('השירות נמצא במצב ניסוי: מותר לשלוח רק לתלמידת בדיקה מורשית.');
      return;
    }
    if(!window.confirm('לשייך את התרגיל לאזור האישי ולשלוח מייל ל-'+recipients.length+' תלמידות?'))return;
    setBusy(true);
    let sent=0,stage='בדיקת שיוכים';
    try{
      const missing=recipients.filter(student=>!getFiles().some(file=>file.studentId===student.id&&file.description?.includes('sight-reading:'+item.id)));
      if(missing.length){
        stage='יצירת והעלאת PDF';
        const pdf=await makeSightReadingPdf(item.xml);
        for(const student of missing){
          const filename='TOBY-reading-'+item.serial+'-'+randomId()+'.pdf';
          const upload=await workerApi.uploadAttachment(new File([pdf],filename,{type:'application/pdf'}));
          if(!upload.success||!upload.data?.webViewLink)throw new Error(upload.error||'העלאת PDF נכשלה');
          addFile({studentId:student.id,name:item.title+'.pdf',
            description:'תרגיל קריאה מהדף · sight-reading:'+item.id,
            webViewLink:upload.data.webViewLink,dropboxPath:upload.data.path,
            kind:'pdf',mimeType:'application/pdf',size:upload.data.size??pdf.size});
        }
      }
      stage='אימות שמירה בענן';
      const synced=await hybridSync.manualSync();
      if(!synced)throw new Error('השמירה ב-Dropbox לא אומתה');
      for(const student of recipients){
        stage='Gmail';
        const subject='תרגיל קריאה מהדף — TOBY Music';
        setMailStatus('בודק אישור שליחה לתלמידה שנבחרה…');
        // Server receipt is canonical. Never rely on browser-only history
        // when deciding whether an uncertain email should be sent again.
        const receipt=await teacherDirectReceipt(student.id,item.id);
        if(receipt.status==='unknown')
          throw new Error('קיים ניסיון שליחה קודם שמצבו אינו ידוע. יש לבדוק Gmail נשלח לפני ניסיון נוסף.');
        const result=receipt.status==='sent'
          ? {ok:true,status:'sent',gmailMessageId:receipt.gmailMessageId,duplicatePrevented:true}
          : await teacherDirectSend(student.id,item.id);
        if(!result.ok||result.status!=='sent')throw new Error('Gmail לא אישר שליחה');
        if(!result.duplicatePrevented)sent++;
        // Preserve the existing internal mailbox behavior. Only create a
        // local platform message AFTER the server confirms the Gmail receipt.
        const existing=getMessages().some(message=>
          message.senderId==='admin'&&message.recipientIds.includes(student.id)&&
          message.gmailMessageId===result.gmailMessageId);
        if(!existing){
          addMessage({senderId:'admin',senderName:'TOBY Music',recipientIds:[student.id],
            subject,content:'תרגיל קריאה מהדף הועלה לאזור האישי שלך. לצפייה: https://students.tobymusic.club/',
            type:'general',gmailMessageId:result.gmailMessageId,
            emailSent:true,emailSentAt:new Date().toISOString(),emailSource:'lovable',
            emailDeliveryStatus:'sent',emailDeliveryRoute:'teacher_direct_send'});
        }
      }
      stage='סנכרון דואר פנימי';
      const stored=await hybridSync.manualSync();
      if(!stored)throw new Error('Gmail אישר שליחה, אך שמירת הודעות הדואר הפנימיות טרם אומתה');
      setMailStatus('אושרו '+sent+' שליחות Gmail חדשות. השיוך והדואר הפנימי סונכרנו; לא נשלחו שוב הודעות שכבר אושרו.');
    }catch(e){
      setMailStatus('אושרו '+sent+' שליחות חדשות לפני עצירה. '+explainNetworkFailure(e,stage)+
        ' אין לנסות שוב לפני בדיקת אישור השליחה בשרת.');
    }finally{setBusy(false);}
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
      setDeliveryStatus('מאמת שמירה של '+added+' שיוכים בענן…');
      const synced=await hybridSync.manualSync();
      if(!synced)throw new Error('הקובץ הועלה, אך שיוך התלמידה עדיין לא נשמר בענן. אין לשלוח לפני תיקון הסנכרון.');
      setDeliveryStatus('שיוך '+added+' קבצים סונכרן ל-Dropbox. נדרש אימות צפייה מתוך חשבון תלמידה.');
    }catch(e){setDeliveryStatus('לא ניתן להשלים שיתוף: '+String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  };
  const generate=()=>{
    try {
      if(piano){
        const nextSerial=Math.max(0,...getSightReadingArchive().map(item=>item.serial))+1;
        const nextTitle=title.trim()||'תרגיל פסנתר מספר '+nextSerial;
        const xml=generatePianoXml({title:nextTitle,beats,bars,rows:16,fifths,doubleBar,
          right:{clef,low,high,allowed,intervalMode,repeatShort,patterns:approved},
          left:{clef:leftClef,low:leftLow,high:leftHigh,allowed:leftAllowed,intervalMode:leftInterval,repeatShort:leftRepeatShort,patterns:leftPatterns},
          rules:pianoRules});
        const item:SightReadingArchiveItem={id:randomId(),serial:nextSerial,createdAt:new Date().toISOString(),title:nextTitle,xml,
          metadata:{meter:beats+'/4',barsPerLine:bars,clef:'piano',low,high,allowedSteps:allowed.map(i=>STEPS[i]),patternIds:approved,intervalMode,repeatedShortNotes:repeatShort}};
        addSightReadingArchiveItem(item);setArchive(getSightReadingArchive());setSelectedArchive(item);
        setArchiveStatus('התרגיל נוצר. נדרש אימות שמירה בענן.');setLines(null);setDocumentTitle(nextTitle);setError('');return;
      }
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
    <label className="flex gap-2 items-center"><input type="checkbox" checked={piano} onChange={e=>setPiano(e.target.checked)}/>פסנתר — שתי חמשות</label>
    {piano&&<p className="text-sm text-muted-foreground">ההגדרות הראשיות שלהלן מיועדות לחמשה העליונה (יד ימין). בהמשך הדף תמצאי הגדרות עצמאיות לחמשה התחתונה (יד שמאל).</p>}
    
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
    {piano&&<fieldset className="border rounded p-3 space-y-2 text-sm">
      <legend className="font-bold">חמשה תחתונה — יד שמאל</legend>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label>מפתח<select className="block w-full border rounded p-2" value={leftClef} onChange={e=>setLeftClef(e.target.value as 'G'|'F')}><option value="G">סול</option><option value="F">פה</option></select></label>
        <label>צליל נמוך<select className="block w-full border rounded p-2" value={leftLow} onChange={e=>setLeftLow(e.target.value)}>{NOTE_OPTIONS.map(n=><option key={n.value} value={n.value}>{n.label} ({n.value})</option>)}</select></label>
        <label>צליל גבוה<select className="block w-full border rounded p-2" value={leftHigh} onChange={e=>setLeftHigh(e.target.value)}>{NOTE_OPTIONS.map(n=><option key={n.value} value={n.value}>{n.label} ({n.value})</option>)}</select></label>
        <label>מרווחים<select className="block w-full border rounded p-2" value={leftInterval} onChange={e=>setLeftInterval(e.target.value as typeof leftInterval)}><option value="steps">עד סקונדה</option><option value="thirds">עד טרצה</option><option value="fifth">עד קווינטה</option><option value="wide">עד אוקטבה</option></select></label>
      </div>
      <div className="flex flex-wrap gap-3">{LABELS.map((label,i)=><label key={i} className="flex gap-1 items-center"><input type="checkbox" checked={leftAllowed.includes(i)} onChange={e=>setLeftAllowed(prev=>e.target.checked?[...prev,i].sort():prev.filter(n=>n!==i))}/>{label}</label>)}</div>
      <label className="flex gap-2"><input type="checkbox" checked={leftRepeatShort} onChange={e=>setLeftRepeatShort(e.target.checked)}/>שמיניות ושש־עשריות רצופות באותו צליל בלבד</label>
      <details><summary>מקצבי יד שמאל ({leftPatterns.length})</summary><div className="grid grid-cols-4 md:grid-cols-8 gap-1">{RHYTHM_PATTERNS.map(p=><label key={p.id}><input type="checkbox" checked={leftPatterns.includes(p.id)} onChange={e=>setLeftPatterns(prev=>e.target.checked?[...prev,p.id]:prev.filter(id=>id!==p.id))}/>{p.id}</label>)}</div></details>
    </fieldset>}
    {piano&&<fieldset className="border rounded p-3 space-y-2 text-sm">
      <legend className="font-bold">כללי התיאום בין הידיים</legend>
      <label className="flex gap-2"><input type="checkbox" checked={pianoRules.oneHandAtATime} onChange={e=>changePianoRules({oneHandAtATime:e.target.checked})}/>רק יד אחת מנגנת בכל רגע</label>
      <label className="flex gap-2"><input type="checkbox" checked={pianoRules.matchingRhythm} onChange={e=>changePianoRules({matchingRhythm:e.target.checked})}/>מקצבים זהים בשתי החמשות</label>
      <label className="flex gap-2"><input type="checkbox" checked={pianoRules.tenPercentHand!=='none'} onChange={e=>changePianoRules({tenPercentHand:e.target.checked?'right':'none'})}/>חלוקה 10%–90%</label>
      {pianoRules.tenPercentHand!=='none'&&<select className="border rounded p-2" value={pianoRules.tenPercentHand} onChange={e=>changePianoRules({tenPercentHand:e.target.value as PianoRules['tenPercentHand']})}><option value="right">10% ביד ימין</option><option value="left">10% ביד שמאל</option></select>}
      <label className="flex gap-2"><input type="checkbox" checked={pianoRules.sameDirection} onChange={e=>changePianoRules({sameDirection:e.target.checked})}/>תנועה מלודית באותו כיוון</label>
    </fieldset>}
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
    {selectedArchive&&<details open className="border rounded p-2" id="sight-reading-preview">
       <summary className="cursor-pointer font-medium">תצוגת התרגיל — {selectedArchive.title}</summary>
       <EngravedScore xml={selectedArchive.xml}/>
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
      <div className="flex gap-2 flex-wrap"><button className="border rounded p-2 mt-2" disabled={busy} onClick={()=>void sendReadingEmail(selectedArchive)}>שיוך PDF + שליחת Gmail ייעודית</button>
      <button className="border rounded p-2 mt-2" disabled={busy||!studentIds.length} onClick={()=>void prepareEmail(selectedArchive)}>טיוטת מייל ידנית</button>
      <button type="button" className="border rounded p-2 mt-2" disabled={busy} onClick={()=>void checkGmailOauth()}>בדיקת הרשאת Gmail (ללא שליחה)</button></div>
      <p className="text-xs text-muted-foreground">השליחה הייעודית מופעלת רק לאחר אישור שרת הדואר, ושומרת אישור Gmail למניעת כפילויות. עד להפעלה ניתן לשייך תרגילים לאזור האישי ללא מייל.</p>
      <div className="flex items-center gap-2 text-xs"><button type="button" className="border rounded px-2 py-1" onClick={()=>void checkDropboxConnection()}>בדיקת חיבור לשרת</button><span role="status">{connectionStatus}</span></div>
      {mailStatus&&<p role="status">{mailStatus}</p>}
      {deliveryStatus&&<p role="status">{deliveryStatus}</p>}
      </fieldset>
      <details className="border rounded p-2"><summary className="cursor-pointer">תצוגת התרגיל השמור</summary><EngravedScore xml={selectedArchive.xml}/></details></div>}
      {archiveStatus&&<p role="status">{archiveStatus}</p>}
      <p className="text-xs text-muted-foreground">שיוך PDF משתמש במנגנון הקבצים הקיים; שליחה כצרופה במייל ואימות סנכרון בענן טרם הושלמו.</p>
    </section>

  </div>;
}
