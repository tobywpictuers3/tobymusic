import { useEffect, useMemo, useState } from "react";
import { getFiles, getStudents, addFile, getSightReadingArchive, isDevMode, getTeacherFileMasters, ensureTeacherFileMasters } from "@/lib/storage";
import { workerApi } from "@/lib/workerApi";
import { hybridSync } from "@/lib/hybridSync";
import { downloadCanonicalDropboxLatest } from "@/lib/canonicalDropboxRead";
import { toast } from "@/hooks/use-toast";
import type { FileEntry } from "@/lib/types";
import StudentFiles from "@/components/student/StudentFiles";

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
  const [editingStudentId, setEditingStudentId] = useState("");
  const [filterStudentId, setFilterStudentId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [revision, setRevision] = useState(0);
  const [assignmentSource,setAssignmentSource] = useState<FileEntry | null>(null);
  const [assignmentStudentId,setAssignmentStudentId] = useState("");
  const [busy,setBusy] = useState(false);
  const [notationStudent,setNotationStudent] = useState("");
  const [notationId,setNotationId] = useState("");
  const [notationBusy,setNotationBusy] = useState(false);
  useEffect(() => {
    const imported = ensureTeacherFileMasters();
    if(imported>0)setRevision(n=>n+1);
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener("toby:canonical-sync-applied", refresh);
    return () => window.removeEventListener("toby:canonical-sync-applied", refresh);
  }, []);
  const students = useMemo(() => getStudents(), [revision]);
  const allMasters = useMemo(() => getTeacherFileMasters(), [revision]);
  const availableTags = useMemo(() => [...new Set(allMasters.flatMap(file => file.tags || []))].sort(new Intl.Collator("he").compare), [allMasters]);
  const entries = useMemo(() => {
    const names = new Map(students.map(s => [s.id, (s.firstName + " " + s.lastName).trim()]));
    const collator = new Intl.Collator("he");
    return allMasters.map(file => ({ file, student: names.get(file.studentId) || "תלמידה לא מזוהה" }))
      .filter(row => (!filterStudentId || row.file.studentId === filterStudentId) &&
        (!filterType || typeOf(row.file) === filterType) &&
        (!filterTag || row.file.tags?.includes(filterTag)) &&
        (!dateFrom || (row.file.uploadDate || "").slice(0, 10) >= dateFrom) &&
        (!dateTo || (row.file.uploadDate || "").slice(0, 10) <= dateTo) &&
        [row.file.name, row.file.subject, row.file.description, row.file.tags?.join(" "), row.file.mimeType, row.student, typeOf(row.file), row.file.uploadDate]
          .some(value => (value || "").toLocaleLowerCase("he").includes(search.trim().toLocaleLowerCase("he"))))
      .sort((a,b) => {
        if (sort === "date") return b.file.uploadDate.localeCompare(a.file.uploadDate);
        const val = (x: typeof a) => sort === "name" ? x.file.name : sort === "student" ? x.student : sort === "topic" ? x.file.subject || x.file.description || "" : typeOf(x.file);
        return collator.compare(val(a),val(b));
      });
  }, [search, sort, allMasters, students, filterStudentId, filterType, filterTag, dateFrom, dateTo]);
  const importNotation=async()=>{
    const item=getSightReadingArchive().find(x=>x.id===notationId);
    if(!item||!notationStudent||notationBusy)return;
    if(isDevMode()){toast({title:"העברה לענן חסומה במצב פיתוח",variant:"destructive"});return;}
    if(!getStudents().some(s=>s.id===notationStudent))return;
    const flag="sight-reading:"+item.id;
    if(getFiles().some(file=>file.studentId===notationStudent&&file.description?.includes(flag))){toast({title:"התרגיל כבר משויך לתלמידה"});return;}
    setNotationBusy(true);
    try {
      const {makeSightReadingPdf}=await import("@/components/admin/SightReadingVerovio");
      const pdf=await makeSightReadingPdf(item.xml);
      const filename=(item.title||"תרגיל תווים")+".pdf";
      const upload=await workerApi.uploadAttachment(new File([pdf],filename,{type:"application/pdf"}));
      if(!upload.success||!upload.data)throw new Error(upload.error||"ההעלאה נכשלה");
      const record=addFile({studentId:notationStudent,name:filename,kind:"pdf",mimeType:"application/pdf",
        subject:"קריאה",tags:["קריאה"],description:"תרגיל קריאה מהדף · "+flag,
        size:pdf.size,webViewLink:upload.data.webViewLink,dropboxPath:upload.data.path});
      setRevision(n=>n+1);
      const synced=await hybridSync.manualSync();
      if(!synced)throw new Error("נדרשת שמירה חוזרת לענן");
      const remote=await downloadCanonicalDropboxLatest();
      const d=remote.data as Record<string,unknown>|undefined;
      const files=(d?.musicSystem_files??d?.files) as unknown;
      if(!remote.success||!Array.isArray(files)||!files.some(f=>f&&typeof f==="object"&&(f as FileEntry).id===record.id&&(f as FileEntry).studentId===notationStudent))throw new Error("לא התקבל אישור שמירת שיוך ב-Dropbox");
      toast({title:"דף התווים צורף ואומת"});
      setNotationId("");
    }catch(e){toast({title:"צירוף התווים טרם אומת",description:String(e),variant:"destructive"});}
    finally{setNotationBusy(false);}
  };

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
    <div id="teacher-student-file-editor" className="rounded-xl border p-3 space-y-3">
      <h3 className="font-semibold">ניהול קבצים לפי תלמידה</h3>
      <p className="text-sm text-muted-foreground">בחרי תלמידה כדי ליצור דף, לערוך קובץ, לצרף שמע, להעלות קובץ או לשנות תגיות. פעולות אלה זמינות רק כאן, בחשבון המנהלת.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="בחרי תלמידה לניהול קבצים" className="rounded-md border bg-background p-2 min-w-52 flex-1" value={editingStudentId} onChange={e=>setEditingStudentId(e.target.value)}>
          <option value="">בחרי תלמידה לניהול</option>
          {students.map(student => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}
        </select>
        {editingStudentId && <button className="rounded-md border px-3 py-2 text-sm" onClick={()=>setEditingStudentId("")}>סגירת אזור העריכה</button>}
      </div>
      {editingStudentId && <StudentFiles key={editingStudentId} studentId={editingStudentId} />}
    </div>
    <p className="text-sm text-muted-foreground">ספריית מקור יציבה: הקובץ נשמר כאן גם אם התלמידה הסירה את השיוך שלה, ללא שכפול קבצים.</p>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">צירוף תרגיל ממנוע התווים</summary>
      <div className="flex gap-2 flex-wrap mt-3">
        <select className="border rounded bg-background p-2 flex-1 min-w-40" aria-label="בחירת תרגיל" value={notationId} onChange={e=>setNotationId(e.target.value)}><option value="">בחרי תרגיל מהארכיון</option>{getSightReadingArchive().map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select>
        <select className="border rounded bg-background p-2 flex-1 min-w-40" aria-label="בחירת תלמידה" value={notationStudent} onChange={e=>setNotationStudent(e.target.value)}><option value="">בחרי תלמידה</option>{getStudents().map(student=><option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}</select>
        <button className="rounded bg-primary text-primary-foreground px-3 py-2" disabled={!notationId||!notationStudent||notationBusy} onClick={()=>void importNotation()}>{notationBusy?"מעביר…":"צרפי לאזור האישי"}</button>
      </div>
    </details>
    <h3 className="font-semibold">חיפוש בכל ספריית המורה</h3>
    <div className="flex flex-wrap gap-3">
      <input className="rounded-md border bg-background p-2 flex-1 min-w-44" aria-label="חיפוש ספריית קבצים" placeholder="חיפוש שם קובץ, תלמידה, נושא, תגית, סוג או תאריך" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select className="rounded-md border bg-background p-2" aria-label="מיון ספריית קבצים" value={sort} onChange={e=>setSort(e.target.value as SortKey)}>
        <option value="date">תאריך — חדשים תחילה</option><option value="name">שם</option><option value="student">תלמידה</option><option value="topic">נושא</option><option value="type">סוג</option>
      </select>
      <select aria-label="סינון לפי תלמידה" value={filterStudentId} onChange={e=>setFilterStudentId(e.target.value)} className="rounded-md border bg-background p-2">
        <option value="">כל התלמידות</option>
        {students.map(student => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}
      </select>
      <select aria-label="סינון לפי סוג קובץ" value={filterType} onChange={e=>setFilterType(e.target.value)} className="rounded-md border bg-background p-2">
        <option value="">כל סוגי הקבצים</option>
        {["דף מהעורך","PDF","הקלטה","שמע / הקלטה","העלאה","קישור"].map(type=><option key={type} value={type}>{type}</option>)}
      </select>
      <select aria-label="סינון לפי תגית" value={filterTag} onChange={e=>setFilterTag(e.target.value)} className="rounded-md border bg-background p-2">
        <option value="">כל התגיות</option>
        {availableTags.map(tag=><option key={tag} value={tag}>{tag}</option>)}
      </select>
      <label className="flex items-center gap-1 text-sm">מתאריך <input type="date" aria-label="מתאריך" className="rounded-md border bg-background p-2" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label>
      <label className="flex items-center gap-1 text-sm">עד תאריך <input type="date" aria-label="עד תאריך" className="rounded-md border bg-background p-2" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label>
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
        {students.some(s=>s.id===file.studentId) && <button className="rounded-md border px-3 py-2 text-sm" onClick={()=>{setEditingStudentId(file.studentId);document.getElementById("teacher-student-file-editor")?.scrollIntoView({behavior:"smooth",block:"start"});}}>ניהול קבצי התלמידה</button>}
      </div>)}
    </div>
  </section>;
}
