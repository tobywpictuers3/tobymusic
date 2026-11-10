import {useState} from "react";
import type {FileEntry} from "@/lib/types";
import {updateFile} from "@/lib/storage";
import {hybridSync} from "@/lib/hybridSync";
import {downloadCanonicalDropboxLatest} from "@/lib/canonicalDropboxRead";
import {toast} from "@/hooks/use-toast";

const PREDEFINED=["פסנתר","חליל","קריאה","שליפה","יצירה","מקצבים","קואורדינציה","רמה 1","רמה 2","רמה 3","דואט","ליווי","עיבוד"];

export default function StudentFileMetadataEditor({file,onCancel,onSaved}:{file:FileEntry;onCancel:()=>void;onSaved:()=>void}) {
  const [name,setName]=useState(file.name);
  const [subject,setSubject]=useState(file.subject||"");
  const [tags,setTags]=useState<string[]>(file.tags||[]);
  const [custom,setCustom]=useState("");
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    if(!name.trim()||saving)return;
    setSaving(true);
    try{
      const next=updateFile(file.id,{name:name.trim(),subject:subject.trim(),tags:[...new Set(tags)]});
      if(!next)throw new Error("הקובץ אינו קיים עוד");
      const synced=await hybridSync.manualSync();
      if(!synced)throw new Error("השינוי שמור מקומית אך טרם סונכרן בענן");
      const read=await downloadCanonicalDropboxLatest();
      const raw=read.data as Record<string,unknown>|undefined;
      const files=(raw?.musicSystem_files??raw?.files) as unknown;
      if(!read.success||!Array.isArray(files))throw new Error("לא התקבל אישור מהגיבוי הראשי");
      const saved=files.find(row=>row&&typeof row==="object"&&(row as FileEntry).id===file.id) as FileEntry|undefined;
      if(!saved||saved.name!==name.trim()||(saved.subject||"")!==subject.trim()||
        JSON.stringify(saved.tags||[])!==JSON.stringify([...new Set(tags)]))
        throw new Error("עדכון המטא־דאטה טרם אומת בענן");
      toast({title:"פרטי הקובץ נשמרו ואומתו"});
      onSaved();
    }catch(e){toast({title:"נדרש אימות של פרטי הקובץ",description:String(e),variant:"destructive"});}
    finally{setSaving(false);}
  };
  return <div className="space-y-4" dir="rtl">
    <label className="grid gap-1 text-sm">שם הקובץ
      <input className="border rounded bg-background p-2" value={name} onChange={e=>setName(e.target.value)} aria-label="שם הקובץ"/>
    </label>
    <label className="grid gap-1 text-sm">נושא
      <input className="border rounded bg-background p-2" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="לדוגמה: סולמות" aria-label="נושא הקובץ"/>
    </label>
    <div className="space-y-2"><div className="text-sm">תגיות</div>
      <div className="flex flex-wrap gap-2">{[...new Set([...PREDEFINED,...tags])].map(tag=>
        <label key={tag} className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs cursor-pointer">
          <input type="checkbox" checked={tags.includes(tag)} onChange={e=>setTags(v=>e.target.checked?[...v,tag]:v.filter(t=>t!==tag))}/>{tag}
        </label>
      )}</div>
      <div className="flex gap-2">
        <input value={custom} aria-label="תגית חדשה" placeholder="תגית נוספת" onChange={e=>setCustom(e.target.value)} className="border rounded bg-background p-2 flex-1"/>
        <button type="button" className="border rounded px-3" onClick={()=>{const tag=custom.trim();if(tag&&!tags.includes(tag))setTags(v=>[...v,tag]);setCustom("");}}>הוספה</button>
      </div>
    </div>
    <div className="flex justify-end gap-2">
      <button type="button" className="rounded border p-2" onClick={onCancel}>ביטול</button>
      <button type="button" className="rounded bg-primary text-primary-foreground p-2" onClick={()=>void save()} disabled={saving||!name.trim()}>{saving?"מאמת שמירה…":"שמירת פרטים ותגיות"}</button>
    </div>
  </div>;
}
