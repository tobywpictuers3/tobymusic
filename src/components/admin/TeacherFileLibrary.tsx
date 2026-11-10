import { useEffect, useMemo, useState } from "react";
import { getFiles, getStudents, addFile } from "@/lib/storage";
import { hybridSync } from "@/lib/hybridSync";
import { downloadCanonicalDropboxLatest } from "@/lib/canonicalDropboxRead";
import { toast } from "@/hooks/use-toast";
import type { FileEntry } from "@/lib/types";

type SortKey = "date" | "name" | "student" | "topic" | "type";
const typeOf = (f: FileEntry) => {
  const mime = (f.mimeType || "").toLowerCase();
  if (f.kind === "handwrite") return "דף מהעורך";
  if (f.kind === "recording") return "הקלטה";
  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|webm)$/i.test(f.name)) return "שמע / הקלטה";
  if (mime === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) return "PDF";
  return f.kind === "link" ? "קישור" : "העלאה";
};

/** Single catalog view of existing canonical file records; never duplicates Dropbox attachments. */
export default function TeacherFileLibrary() {
  const [sort, setSort] = useState<SortKey>("date");
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [assignmentSource,setAssignmentSource] = useState<FileEntry | null>(null);
  const [assignmentStudentId,setAssignmentStudentId] = useState("");
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener("toby:canonical-sync-applied", refresh);
    return () => window.removeEventListener("toby:canonical-sync-applied", refresh);
  }, []);
  const entries = useMemo(() => {
    const students = new Map(getStudents().map(s => [s.id, (s.firstName + " " + s.lastName).trim()]));
    const collator = new Intl.Collator("he");
    return getFiles().map(file => ({ file, student: students.get(file.studentId) || "תלמידה לא מזוהה" }))
      .filter(row => [row.file.name, row.file.subject, row.file.description, row.file.tags?.join(" "), row.student, typeOf(row.file)]
        .some(value => (value || "").toLocaleLowerCase("he").includes(search.toLocaleLowerCase("he"))))
      .sort((a,b) => {
        if (sort === "date") return b.file.uploadDate.localeCompare(a.file.uploadDate);
        const val = (x: typeof a) => sort === "name" ? x.file.name : sort === "student" ? x.student : sort === "topic" ? x.file.subject || x.file.description || "" : typeOf(x.file);
        return collator.compare(val(a),val(b));
      });
  }, [search, sort, revision]);
  const assign=async()=>{
    const source=assignmentSource;
    if(!source||!assignmentStudentId||busy)return;
    if(!getStudents().some(student=>student.id===assignmentStudentId)){toast({title:"תלמידה לא נמצאה",variant:"destructive"});return;}
    const exists=getFiles().some(file=>file.studentId===assignmentStudentId && (
      file.id===source.id || file.sourceFileId===(source.sourceFileId||source.id) ||
      (!!file.dropboxPath && file.dropboxPath===source.dropboxPath)
    ));
    if(exists){toast({title:"הקובץ כבר משויך לתלמידה"});setAssignmentSource(null);return;}
    setBusy(true);
    try{
      const {id:originalId,lastModified,...metadata}=source;
      const record=addFile({...metadata,studentId:assignmentStudentId,sourceFileId:source.sourceFileId||originalId,uploadDate:new Date().toISOString()});
      setRevision(v=>v+1);
      const synced=await hybridSync.manualSync();
      if(!synced)throw new Error("לא התקבל אישור סנכרון Dropbox");
      const remote=await downloadCanonicalDropboxLatest();
      if(!remote.success||!remote.data)throw new Error("לא ניתן לאמת שיוך בענן");
      const raw=remote.data as Record<string,unknown>;
      const files=(raw.musicSystem_files??raw.files) as unknown;
      if(!Array.isArray(files)||!files.some(x=>x&&typeof x==="object"&&(x as FileEntry).id===record.id&&(x as FileEntry).studentId===assignmentStudentId))throw new Error("השיוך טרם אומת בענן");
      toast({title:"שויך ואומת",description:"התלמידה תראה את הקובץ באזור האישי"});
      setAssignmentSource(null);
    }catch(e){toast({title:"השיוך לא אומת",description:String(e),variant:"destructive"});}
    finally{setBusy(false);}
  };
  return <section className="rounded-xl border bg-background/95 p-4 space-y-4" dir="rtl">
    <h2 className="text-xl font-semibold">ספריית הקבצים של המורה</h2>
    <p className="text-sm text-muted-foreground">מוצגים קבצים המשויכים לתלמידות, כולל פרטי הקובץ המקוריים. אין כאן שכפול קבצים.</p>
    <div className="flex flex-wrap gap-3">
      <input className="rounded-md border bg-background p-2 flex-1 min-w-44" aria-label="חיפוש ספריית קבצים" placeholder="חיפוש שם, תלמידה, נושא או תגית" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select className="rounded-md border bg-background p-2" aria-label="מיון ספריית קבצים" value={sort} onChange={e=>setSort(e.target.value as SortKey)}>
        <option value="date">תאריך — חדשים תחילה</option><option value="name">שם</option><option value="student">תלמידה</option><option value="topic">נושא</option><option value="type">סוג</option>
      </select>
    </div>
    {assignmentSource && <div role="dialog" aria-label="שיוך קובץ לתלמידה" className="rounded-lg border p-3 space-y-2">
      <h3 className="font-medium">שייכי לתלמידה: {assignmentSource.name}</h3>
      <select aria-label="תלמידה לשיוך" className="border rounded p-2 bg-background w-full" value={assignmentStudentId} onChange={e=>setAssignmentStudentId(e.target.value)}><option value="">בחרי תלמידה</option>{getStudents().map(student=><option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}</select>
      <div className="flex gap-2"><button className="border rounded p-2" onClick={()=>setAssignmentSource(null)}>ביטול</button><button disabled={!assignmentStudentId||busy} className="rounded bg-primary text-primary-foreground p-2" onClick={()=>void assign()}>{busy?"מאמת…":"שייך קובץ"}</button></div>
    </div>}
    <div className="space-y-2">
      {entries.length === 0 && <p className="text-sm text-muted-foreground">לא נמצאו קבצים</p>}
      {entries.map(({file,student}) => <div key={file.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <div className="flex-1 min-w-48"><div className="font-medium break-words">{file.name}</div>
          <div className="text-xs text-muted-foreground">{student} · {typeOf(file)} · {new Date(file.uploadDate).toLocaleDateString("he-IL")}</div>
          {file.subject && <div className="text-sm">נושא: {file.subject}</div>}
          {!!file.tags?.length && <div className="text-xs">{file.tags.join(" · ")}</div>}
        </div>
        <a className="rounded-md border px-3 py-2 text-sm" href={file.webViewLink} target="_blank" rel="noopener noreferrer">פתיחה</a>
        <button className="rounded-md border px-3 py-2 text-sm" onClick={()=>{setAssignmentSource(file);setAssignmentStudentId("");}}>שייך לתלמידה</button>
      </div>)}
    </div>
  </section>;
}
