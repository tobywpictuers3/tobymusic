import { useEffect, useMemo, useState } from 'react';
import { noteName } from '@/lib/musicPlay';
import {
  FLUTE_FINGERS, FLUTE_FINGER_LABELS, SUPPORTED_FLUTE_NOTES,
  recognizeRecallFluteFingering, type FluteFinger,
} from '@/lib/recallFlute';

type Props={allowed:readonly number[];active:boolean;onAnswer:(pitch:number)=>void};
const WHITE_CLASSES=[0,2,4,5,7,9,11];
const BLACK_CLASSES=[1,3,6,8,10];
const isWhite=(midi:number)=>WHITE_CLASSES.includes(midi%12);
export function RecallScreenPiano({allowed,active,onAnswer}:Props){
  const first=allowed[0],last=allowed[allowed.length-1];
  if(first===undefined||last===undefined)return null;
  const firstC=Math.floor(first/12)*12;
  const lastC=Math.ceil((last+1)/12)*12;
  const whites=Array.from({length:lastC-firstC},(_,i)=>firstC+i).filter(isWhite);
  const blacks=Array.from({length:lastC-firstC},(_,i)=>firstC+i).filter(n=>BLACK_CLASSES.includes(n%12));
  const width=whites.length*52;
  return <section dir="rtl" aria-label="פסנתר וירטואלי לנגינת התווים" className="space-y-2">
    <p className="text-sm font-medium">🎹 קלידי פסנתר על המסך — רק התווים שנלמדו זמינים להקשה</p>
    <div dir="ltr" className="overflow-x-auto rounded-xl border bg-slate-100 p-2">
      <div role="group" aria-label="קלידי פסנתר" className="relative" style={{height:154,width,minWidth:width}}>
        {whites.map((midi,i)=><button key={midi} type="button"
          disabled={!active||!allowed.includes(midi)} onClick={()=>onAnswer(midi)}
          aria-label={noteName(midi)}
          className="absolute top-0 h-[146px] border-2 border-slate-500 bg-white text-slate-950 rounded-b-lg enabled:active:bg-amber-200 enabled:hover:bg-sky-100 disabled:bg-slate-200 disabled:opacity-55 touch-manipulation"
          style={{left:i*52,width:51}}>
          <span dir="rtl" className="absolute bottom-2 inset-x-0 text-[10px] leading-tight">{noteName(midi)}</span>
        </button>)}
        {blacks.map(midi=>{
          const before=whites.filter(p=>p<midi).length;
          return <button key={midi} type="button"
            disabled={!active||!allowed.includes(midi)} onClick={()=>onAnswer(midi)}
            aria-label={noteName(midi)}
            className="absolute top-0 z-10 h-[91px] rounded-b-md border border-slate-700 bg-slate-900 text-white enabled:hover:bg-indigo-700 disabled:opacity-65 touch-manipulation"
            style={{left:before*52-15,width:30}}/>;
        })}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">אפשר לגלול לרוחב. קלידים אפורים אינם חלק מהרמה האישית.</p>
  </section>;
}
export function RecallScreenFlute({allowed,active,onAnswer}:Props){
  const supported=useMemo(()=>allowed.filter(n=>SUPPORTED_FLUTE_NOTES.includes(n)),[allowed]);
  const [register,setRegister]=useState<4|5|6>(4);
  const [pressed,setPressed]=useState<FluteFinger[]>([]);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    const initial=supported[0];
    setRegister(initial===undefined?4:initial>=84?6:initial>=72?5:4);
    setPressed([]);setMessage('');
  },[supported.join(',')]);
  const toggle=(finger:FluteFinger)=>{
    setPressed(current=>current.includes(finger)?current.filter(k=>k!==finger):[...current,finger]);
    setMessage('');
  };
  const submit=()=>{
    const note=recognizeRecallFluteFingering(pressed,register,supported);
    if(note===null){setMessage('האצבוע שסומן אינו תואם צליל זמין ברמה זו. בדקי את המקשים ואת האוקטבה.');return;}
    setMessage('האצבוע נקלט.');
    onAnswer(note);
  };
  return <section dir="rtl" aria-label="חליל צד וירטואלי" className="space-y-3 rounded-xl border bg-indigo-50/50 p-3">
    <h4 className="font-semibold">🪈 חליל צד על המסך — סמני אצבוע ושלחי כתשובה</h4>
    <p className="text-xs text-muted-foreground">מקשים כחולים = לחוצים; לבנים = פתוחים. זהו תרשים אצבוע של חליל צד סטנדרטי, לא סימולציה של נשיפה. בחרי משלב, הקישי על מקשי החליל ולחצי ״אישור האצבוע״.</p>
    <div className="flex flex-wrap gap-2 items-center">
      <label className="text-sm">משלב:
        <select value={register} disabled={!active} onChange={e=>{setRegister(Number(e.target.value) as 4|5|6);setMessage('');}}
          className="block rounded-md border p-2 bg-white text-slate-900">
          <option value={4}>נמוך (דו ראשון–סי ראשון)</option>
          <option value={5}>אמצעי (דו שני–סי שני)</option>
          <option value={6}>גבוה (דו שלישי)</option>
        </select>
      </label>
      <button type="button" disabled={!active} onClick={()=>{setPressed([]);setMessage('');}} className="rounded-lg border bg-white px-3 py-2 text-sm">שחרור כל המקשים</button>
    </div>
    <div dir="ltr" className="overflow-x-auto rounded-xl border border-slate-300 bg-white p-3">
      <div className="relative mx-auto min-w-[560px] max-w-[760px] h-[135px]">
        <div className="absolute left-0 right-0 top-[47px] h-[38px] rounded-r-lg border-2 border-slate-500 bg-gradient-to-b from-slate-200 to-slate-400"/>
        <div className="absolute left-0 top-[31px] h-[72px] w-[18px] rounded-full border-2 border-slate-600 bg-slate-300"/>
        {FLUTE_FINGERS.map((finger,i)=>{
          const isSide=finger==='T'||finger==='Eb'||finger==='C';
          const x=finger==='T'?19:finger==='Eb'?78:finger==='C'?92:11+(i-1)*11;
          const y=finger==='T'?92:isSide?8:41;
          return <button type="button" key={finger} disabled={!active}
            aria-label={FLUTE_FINGER_LABELS[finger]} aria-pressed={pressed.includes(finger)}
            title={FLUTE_FINGER_LABELS[finger]}
            onClick={()=>toggle(finger)}
            className={`absolute z-10 rounded-full border-2 shadow-sm touch-manipulation disabled:opacity-50 ${pressed.includes(finger)?'border-blue-950 bg-sky-600 text-white':'border-slate-600 bg-slate-50 text-slate-800'}`}
            style={{left:x+'%',top:y,width:isSide?34:45,height:isSide?34:45}}>
            <span className="text-[9px] font-bold">{finger}</span>
          </button>;
        })}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={!active||!supported.length} onClick={submit} className="rounded-lg bg-indigo-700 text-white font-semibold px-5 py-3 disabled:opacity-40">אישור האצבוע</button>
      <p aria-live="polite" className="text-xs text-muted-foreground">{message}</p>
    </div>
    {!supported.length&&<p role="status" className="text-sm text-amber-800">ברמה זו אין צלילים בתחום החליל הווירטואלי הנתמך (דו ראשון עד דו שלישי). השתמשי בפסנתר או ב־MIDI.</p>}
    {supported.length!==allowed.length&&!!supported.length&&<p className="text-xs text-amber-800">חלק מהצלילים ברמה אינם נתמכים באצבוע הווירטואלי. עבורם השתמשי בפסנתר, במיקרופון או ב־MIDI.</p>}
  </section>;
}
