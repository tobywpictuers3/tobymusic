import { useEffect, useMemo, useState } from 'react';
import type { Student } from '@/lib/types';
import { getStudentsForCurrentYearLists, updateStudent } from '@/lib/storage';
import { NATURAL_PITCHES, getRecallLevels, getInitialRecallProfile, normalizeRecallProfile, validateRecallProfile, type RecallProfile, type RecallPlacement } from '@/lib/musicRecall';
import { noteName } from '@/lib/musicPlay';
import { Button } from '@/components/ui/button';

const INTERVALS = [
  ['0','אוניסון'],['1','סקונדה'],['2','טרצה'],['3','קוורטה'],
  ['4','קוינטה'],['5','סקסטה'],['6','ספטימה'],['7','אוקטבה'],
] as const;
const available=(clef:'treble'|'bass')=>NATURAL_PITCHES.filter(n=>clef==='treble'?n>=48&&n<=84:n>=36&&n<=72);
const ordered = (items:number[])=>[...new Set(items)].sort((a,b)=>a-b);
const newDraft=(student:Student):RecallProfile=>({
  ...getInitialRecallProfile(student.musicPlaySettings),
  id:'pending',
  title:'', minEvents:8, voices:1, clefs:'treble', placement:'treble',intervals:[1],
});
function NoteSelector({clef,selected,onChange}:{clef:'treble'|'bass';selected:number[];onChange:(v:number[])=>void}){
  const all=available(clef);
  const [from,setFrom]=useState(clef==='treble'?60:43);
  const [to,setTo]=useState(clef==='treble'?67:55);
  const [mode,setMode]=useState<'range'|'custom'>('custom');
  const applyRange=()=>onChange(all.filter(n=>n>=Math.min(from,to)&&n<=Math.max(from,to)));
  return <div className="space-y-2 rounded-lg border p-3">
    <div className="font-medium">{clef==='treble'?'מפתח סול':'מפתח פה'} · {selected.length} תווים</div>
    <div className="flex gap-2 flex-wrap text-sm">
      <Button type="button" size="sm" variant={mode==='range'?'default':'outline'} onClick={()=>setMode('range')}>רצף בין שני תווים</Button>
      <Button type="button" size="sm" variant={mode==='custom'?'default':'outline'} onClick={()=>setMode('custom')}>תווים מסוימים בלבד</Button>
    </div>
    {mode==='range'?<div className="flex flex-wrap gap-2 items-end">
      {([['מהתו',from,setFrom],['עד התו',to,setTo]] as const).map(([label,value,set])=><label className="text-xs space-y-1" key={label}>{label}
        <select value={value} onChange={e=>set(Number(e.target.value))} className="block rounded border bg-background p-2">
          {all.map(n=><option key={n} value={n}>{noteName(n)}</option>)}
        </select>
      </label>)}
      <Button type="button" onClick={applyRange}>החל רצף</Button>
    </div>:<div className="flex flex-wrap gap-2">{all.map(n=><label key={n} className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs cursor-pointer ${selected.includes(n)?'bg-indigo-100 text-indigo-950 border-indigo-400':'bg-background'}`}>
      <input type="checkbox" checked={selected.includes(n)} onChange={e=>onChange(ordered(e.target.checked?[...selected,n]:selected.filter(v=>v!==n)))}/>{noteName(n)}
    </label>)}</div>}
    <p className="text-xs text-muted-foreground">בתרגיל יופיעו רק התווים שנבחרו כאן. בחירת רצף מחליפה את הרשימה.</p>
  </div>;
}
export default function MusicRecallSettingsEditor({student,onSaved}:{student:Student;onSaved:()=>void}){
  const current=getRecallLevels(student.musicPlaySettings);
  const [draft,setDraft]=useState<RecallProfile>(()=>newDraft(student));
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  useEffect(()=>{setDraft(newDraft(student));setError('');},[student.id]);
  const nextNumber=current.length+1;
  const change=(part:Partial<RecallProfile>)=>setDraft(v=>({...v,...part}));
  const normalized=useMemo(()=>normalizeRecallProfile(draft),[draft]);
  const enableBoth=normalized.clefs==='both';
  const store=()=>{
    if(saving)return;
    const existing=getStudentsForCurrentYearLists().find(s=>s.id===student.id);
    if(!existing){setError('התלמידה לא נמצאה בנתונים המקומיים');return;}
    const all=getRecallLevels(existing.musicPlaySettings);
    const profile:RecallProfile=normalizeRecallProfile({...normalized,
      id:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now()),
      title:normalized.title||`רמה ${all.length+1}`});
    const issues=validateRecallProfile(profile);
    if(issues.length){setError(issues.join(' · '));return;}
    if(all.length>=60){setError('הגעת למגבלת 60 רמות. אין להחליף רמות היסטוריות.');return;}
    setSaving(true);setError('');
    const settings={...existing.musicPlaySettings,recallLevels:[...all,profile]};
    const ok=updateStudent(student.id,{musicPlaySettings:settings});
    setSaving(false);
    if(!ok){setError('השמירה המקומית נכשלה.');return;}
    onSaved();
  };
  return <section dir="rtl" className="space-y-4 rounded-xl border-2 border-indigo-300 p-4 text-right">
    <div className="space-y-1">
      <h3 className="font-bold text-lg">שליפת תווים — רמות אישיות לתלמידה</h3>
      <p className="text-sm">לכל תלמידה סדר רמות משלה. ההגדרה הראשונה שתשמרי תהיה רמה 1; בפעם הבאה יתווספו הגדרות חדשות כרמה 2. רמות קודמות נשמרות.</p>
    </div>
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="font-semibold">רמות שכבר נשמרו: {current.length}</div>
      <div className="text-xs text-muted-foreground">{current.length?current.map((p,i)=>`${i+1}. ${p.title}`).join(' · '):'אין עדיין רמות אישיות. ישנה תצוגת התחלה המבוססת על הטווחים הישנים בלבד.'}</div>
    </div>
    <h4 className="font-semibold text-indigo-700 dark:text-indigo-300">הגדרה שתישמר כרמה {nextNumber}</h4>
    <label className="block text-sm space-y-1">שם הרמה (אופציונלי)
      <input value={draft.title} maxLength={70} onChange={e=>change({title:e.target.value})} className="block w-full border rounded-md bg-background p-2" placeholder={`רמה ${nextNumber} — שם פנימי למורה`}/>
    </label>
    <div className="grid md:grid-cols-2 gap-3">
      <NoteSelector clef="treble" selected={draft.trebleNotes} onChange={v=>change({trebleNotes:v})}/>
      <NoteSelector clef="bass" selected={draft.bassNotes} onChange={v=>change({bassNotes:v})}/>
    </div>
    <fieldset className="space-y-2 border rounded-lg p-3">
      <legend className="px-1 font-semibold">מרווחים מותרים במעבר בין צלילים</legend>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!draft.intervals.length} onChange={e=>change({intervals:e.target.checked?[]:[1]})}/> חופשי — כל המרווחים</label>
      <div className="flex flex-wrap gap-3">{INTERVALS.map(([distance,label])=><label key={distance} className="text-sm flex gap-1 items-center">
        <input type="checkbox" disabled={!draft.intervals.length} checked={draft.intervals.includes(Number(distance))} onChange={e=>change({intervals:ordered(e.target.checked?[...draft.intervals,Number(distance)]:draft.intervals.filter(n=>n!==Number(distance)))})}/>{label}
      </label>)}</div>
      <p className="text-xs text-muted-foreground">המרווחים מחושבים לפי המרחק הדיאטוני האמיתי, גם כשנבחרו תווים לא רצופים. אין הרחבה אוטומטית של רשימת התווים.</p>
    </fieldset>
    <div className="grid md:grid-cols-2 gap-3">
      <label className="text-sm space-y-1">מפתחות וחמשות
        <select className="block w-full p-2 rounded-md border bg-background" value={draft.clefs} onChange={e=>{
          const clefs=e.target.value as RecallProfile['clefs'];
          change({clefs,placement:clefs==='both'?'random':clefs});
        }}>
          <option value="treble">חמשה אחת — סול</option><option value="bass">חמשה אחת — פה</option><option value="both">שתי חמשות — סול ופה</option>
        </select>
      </label>
      <label className="text-sm space-y-1">כמה תווים בו־זמנית בכל עמודת תווים?
        <select className="block w-full p-2 rounded-md border bg-background" value={draft.voices} onChange={e=>change({voices:Number(e.target.value)})}>
          {[1,2,3,4].map(v=><option value={v} key={v}>{v}</option>)}
        </select>
      </label>
      {enableBoth&&<label className="text-sm space-y-1">היכן ינוגנו התווים?
        <select className="block w-full p-2 rounded-md border bg-background" value={draft.placement} onChange={e=>change({placement:e.target.value as RecallPlacement})}>
          <option value="treble">כולם בסול</option><option value="bass">כולם בפה</option>
          <option value="split">חלוקה בין שתי החמשות</option><option value="random">אקראי: בסול, בפה או מחולק</option>
        </select>
      </label>}
      <label className="text-sm space-y-1">מספר עמודות התווים המינימלי בתרגיל
        <input type="number" min={2} max={64} value={draft.minEvents} onChange={e=>change({minEvents:Number(e.target.value)})} className="block w-full rounded border p-2 bg-background"/>
      </label>
    </div>
    <p className="text-xs text-muted-foreground">התווים מוצגים כראשי תווים חלולים, ללא רגל. כל עמודה יכולה להכיל כמה צלילים בו־זמנית. התלמידה רשאית לבחור תוספת אורך, מהירות ומצב זמן בלבד.</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <Button type="button" onClick={store} disabled={saving} className="w-full">שמרי כרמה {nextNumber} חדשה לתלמידה</Button>
    <p className="text-xs text-muted-foreground">השמירה מתבצעת בנתיב הנתונים הקיים; יש לבדוק את סטטוס סנכרון Dropbox לפני סגירת המערכת. אין לשכתב תוצאות קודמות.</p>
  </section>;
}
