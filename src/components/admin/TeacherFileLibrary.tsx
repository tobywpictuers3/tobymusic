import { useEffect, useMemo, useState } from "react";
import { getFiles, getStudents } from "@/lib/storage";
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
  return <section className="rounded-xl border bg-background/95 p-4 space-y-4" dir="rtl">
    <h2 className="text-xl font-semibold">ספריית הקבצים של המורה</h2>
    <p className="text-sm text-muted-foreground">מוצגים קבצים המשויכים לתלמידות, כולל פרטי הקובץ המקוריים. אין כאן שכפול קבצים.</p>
    <div className="flex flex-wrap gap-3">
      <input className="rounded-md border bg-background p-2 flex-1 min-w-44" aria-label="חיפוש ספריית קבצים" placeholder="חיפוש שם, תלמידה, נושא או תגית" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select className="rounded-md border bg-background p-2" aria-label="מיון ספריית קבצים" value={sort} onChange={e=>setSort(e.target.value as SortKey)}>
        <option value="date">תאריך — חדשים תחילה</option><option value="name">שם</option><option value="student">תלמידה</option><option value="topic">נושא</option><option value="type">סוג</option>
      </select>
    </div>
    <div className="space-y-2">
      {entries.length === 0 && <p className="text-sm text-muted-foreground">לא נמצאו קבצים</p>}
      {entries.map(({file,student}) => <div key={file.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <div className="flex-1 min-w-48"><div className="font-medium break-words">{file.name}</div>
          <div className="text-xs text-muted-foreground">{student} · {typeOf(file)} · {new Date(file.uploadDate).toLocaleDateString("he-IL")}</div>
          {file.subject && <div className="text-sm">נושא: {file.subject}</div>}
          {!!file.tags?.length && <div className="text-xs">{file.tags.join(" · ")}</div>}
        </div>
        <a className="rounded-md border px-3 py-2 text-sm" href={file.webViewLink} target="_blank" rel="noopener noreferrer">פתיחה</a>
      </div>)}
    </div>
  </section>;
}
