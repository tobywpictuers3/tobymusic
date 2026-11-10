// StudentFiles.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload, Mic, Square } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

import type { FileEntry } from "@/lib/types";
import { addFile, deleteFile, getFiles, getSightReadingArchive } from "@/lib/storage";
import { EngravedScore } from "@/components/admin/SightReadingVerovio";
import { workerApi } from "@/lib/workerApi";
import { hybridSync } from "@/lib/hybridSync";

import DocumentEditor, { editorSourceFromFile } from "./DocumentEditor";

interface StudentFilesProps {
  studentId: string;
}

type AddMode = "upload" | "link" | "newpage";
type NewPageTemplate = "blank" | "lines" | "staff";
type EditPickMode = "from_app" | "from_device";
type FileSort = "date" | "name" | "topic" | "type";

function getFileCategory(f: FileEntry): string {
  const mime = (f.mimeType || "").toLowerCase();
  const name = f.name.toLowerCase();
  if (f.kind === "handwrite") return "דף שנוצר בעורך";
  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|webm)$/.test(name)) return "קובץ שמע";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (f.kind === "link") return "קישור";
  return "העלאה";
}

function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}.${mi}`;
}

function baseNameWithoutExt(name: string) {
  const n = (name || "").trim();
  if (!n) return "";
  const lastDot = n.lastIndexOf(".");
  if (lastDot > 0) return n.slice(0, lastDot);
  return n;
}

function inferKindFromNameOrMime(fileName: string, mime?: string) {
  const m = (mime || "").toLowerCase();
  const n = (fileName || "").toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return "pdf" as const;
  if (m.startsWith("image/") || n.match(/\.(png|jpg|jpeg|webp|gif)$/)) return "image" as const;
  return "image" as const;
}

async function fetchBlob(url: string): Promise<Blob> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`FETCH_FAILED: ${r.status}`);
  return await r.blob();
}

export default function StudentFiles({ studentId }: StudentFilesProps) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [sortBy, setSortBy] = useState<FileSort>("date");
  const [openChoices, setOpenChoices] = useState<FileEntry | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const [visibleReadingId,setVisibleReadingId] = useState<string | null>(null);
  const [refreshingFiles,setRefreshingFiles]=useState(false);
  useEffect(()=>{
    const refresh=()=>setRefreshTick(tick=>tick+1);
    window.addEventListener('toby:canonical-sync-applied',refresh);
    return()=>window.removeEventListener('toby:canonical-sync-applied',refresh);
  },[]);
  const refreshFromCloud=async()=>{
    setRefreshingFiles(true);
    try{
      const result=await hybridSync.pullCanonicalLatest();
      if(!result.success)throw new Error(result.message||'קריאת קבצים נכשלה');
      setRefreshTick(tick=>tick+1);
      toast({title:'עודכן',description:'רשימת הקבצים עודכנה מתוך Dropbox'});
    }catch(e){toast({title:'לא ניתן לרענן מהענן',description:String(e instanceof Error?e.message:e),variant:'destructive'});}
    finally{setRefreshingFiles(false);}
  };


  const files = useMemo(() => {
    const all = getFiles();
    const collator = new Intl.Collator("he");
    return all.filter(f => f.studentId === studentId).sort((a, b) => {
      if (sortBy === "name") return collator.compare(a.name, b.name);
      if (sortBy === "topic") return collator.compare(a.subject || a.description || "", b.subject || b.description || "") || collator.compare(a.name, b.name);
      if (sortBy === "type") return collator.compare(getFileCategory(a), getFileCategory(b)) || collator.compare(a.name, b.name);
      return (b.uploadDate || "").localeCompare(a.uploadDate || "");
    });
  }, [studentId, refreshTick, sortBy]);

  // ---- Add dialog ----
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("upload");
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [template, setTemplate] = useState<NewPageTemplate>("blank");
  const addFileInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Edit picker dialog ----
  const [editPickOpen, setEditPickOpen] = useState(false);
  const [editPickMode, setEditPickMode] = useState<EditPickMode>("from_app");
  const [pickedAppFileId, setPickedAppFileId] = useState<string>("");
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Editor modal ----
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"new" | "edit">("new");
  const [editorInitialName, setEditorInitialName] = useState("");
  const [editorTemplate, setEditorTemplate] = useState<NewPageTemplate>("blank");
  const [editorSource, setEditorSource] = useState<{ kind: "image" | "pdf"; blob: Blob } | undefined>(undefined);

  const toggleRecording = async () => {
    if (recorderRef.current?.state === "recording") { recorderRef.current.stop(); setRecording(false); return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("הדפדפן אינו תומך בהקלטה");
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      recordingStreamRef.current = stream;
      const chunks: BlobPart[] = [];
      const preferred = ["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(stream, preferred ? {mimeType: preferred} : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = e => {if (e.data.size) chunks.push(e.data);};
      rec.onerror = () => {setRecording(false); stream.getTracks().forEach(t=>t.stop()); toast({title:"שגיאה בהקלטה",variant:"destructive"});};
      rec.onstop = async () => {
        setRecording(false); stream.getTracks().forEach(t=>t.stop()); recordingStreamRef.current = null; recorderRef.current = null;
        try {
          const format = rec.mimeType.includes("mp4") ? "m4a" : "webm";
          const mime = rec.mimeType || "audio/webm";
          const name = "הקלטה " + nowStamp();
          const file = new File([new Blob(chunks,{type:mime})], name + "." + format,{type:mime});
          if (!file.size) throw new Error("ההקלטה ריקה");
          const upload = await workerApi.uploadAttachment(file);
          if (!upload.success || !upload.data) throw new Error(upload.error || "העלאת ההקלטה נכשלה");
          addFile({studentId,name:file.name,mimeType:mime,kind:"upload",webViewLink:upload.data.webViewLink,dropboxPath:upload.data.path,size:file.size});
          setRefreshTick(n=>n+1);
          toast({title:"ההקלטה נשמרה",description:"הקובץ נוסף לספרייה"});
        } catch (error) {toast({title:"לא ניתן לשמור הקלטה",description:String(error),variant:"destructive"});}
      };
      rec.start(); setRecording(true);
    } catch(error) {recordingStreamRef.current?.getTracks().forEach(t=>t.stop());toast({title:"לא ניתן להתחיל הקלטה",description:String(error),variant:"destructive"});}
  };

  const resetAddForm = () => {
    setAddMode("upload");
    setTitle("");
    setLinkUrl("");
    setTemplate("blank");
    if (addFileInputRef.current) addFileInputRef.current.value = "";
  };

  const openEditorForNew = (nameBase: string, t: NewPageTemplate) => {
    setEditorMode("new");
    setEditorInitialName(nameBase);
    setEditorTemplate(t);
    setEditorSource(undefined);
    setEditorOpen(true);
  };

  const openEditorForEdit = (nameBase: string, source: { kind: "image" | "pdf"; blob: Blob }) => {
    setEditorMode("edit");
    setEditorInitialName(nameBase);
    setEditorSource(source);
    setEditorOpen(true);
  };

  const ensureTitle = () => {
    if (!title.trim()) {
      toast({ title: "חסר שם", description: "נא לתת שם לקובץ לפני פתיחה", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleAddSubmit = async () => {
    try {
      if (addMode === "link") {
        if (!ensureTitle()) return;
        if (!linkUrl.trim()) {
          toast({ title: "שגיאה", description: "יש להדביק קישור", variant: "destructive" });
          return;
        }

        addFile({
          studentId,
          name: title.trim(),
          webViewLink: linkUrl.trim(),
          kind: "link",
          uploadDate: new Date().toISOString(),
        });

        toast({ title: "נוסף", description: "הקישור נשמר" });
        setAddOpen(false);
        setRefreshTick((x) => x + 1);
        return;
      }

      if (addMode === "newpage") {
        if (!ensureTitle()) return;
        openEditorForNew(title.trim(), template);
        setAddOpen(false);
        return;
      }

      // upload
      const f = addFileInputRef.current?.files?.[0];
      if (!f) {
        toast({ title: "שגיאה", description: "נא לבחור קובץ", variant: "destructive" });
        return;
      }

      const result = await workerApi.uploadAttachment(f);
      if (!result.success || !result.data) {
        toast({ title: "שגיאה", description: result.error || "העלאה נכשלה", variant: "destructive" });
        return;
      }

      addFile({
        studentId,
        name: title.trim() || f.name,
        webViewLink: result.data.webViewLink,
        dropboxPath: result.data.path,
        mimeType: result.data.type || f.type,
        size: result.data.size || f.size,
        kind: "upload",
        uploadDate: new Date().toISOString(),
      });

      toast({ title: "הועלה", description: "הקובץ נוסף לתלמידה" });
      setAddOpen(false);
      setRefreshTick((x) => x + 1);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message || "תקלה בהוספה", variant: "destructive" });
    }
  };

  const handleOpenEditPicker = () => {
    setEditPickMode("from_app");
    setPickedAppFileId(files[0]?.id || "");
    if (editFileInputRef.current) editFileInputRef.current.value = "";
    setEditPickOpen(true);
  };

  const handleEditPickContinue = async () => {
    try {
      if (editPickMode === "from_device") {
        const f = editFileInputRef.current?.files?.[0];
        if (!f) {
          toast({ title: "שגיאה", description: "נא לבחור קובץ", variant: "destructive" });
          return;
        }
        openEditorForEdit(baseNameWithoutExt(f.name) || "עריכה", editorSourceFromFile(f));
        setEditPickOpen(false);
        return;
      }

      // from app
      const fe = files.find((x) => x.id === pickedAppFileId);
      if (!fe) {
        toast({ title: "שגיאה", description: "נא לבחור קובץ מתוך התוכנה", variant: "destructive" });
        return;
      }

      const blob = await fetchBlob(fe.webViewLink);
      const kind = inferKindFromNameOrMime(fe.name, fe.mimeType);

      openEditorForEdit(baseNameWithoutExt(fe.name) || "עריכה", { kind, blob });
      setEditPickOpen(false);
    } catch (e: any) {
      toast({
        title: "שגיאה",
        description:
          e?.message ||
          "לא הצלחתי למשוך את הקובץ לעריכה. אם יש חסימת CORS נוכל להעביר את ההורדה דרך ה-Worker לפי path.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (file: FileEntry) => {
    try {
      // Remove only this student assignment. Do not delete the shared Dropbox attachment:
      // the same source may still be referenced by another student or the teacher library.
      const ok = await deleteFile(file.id);
      if (!ok) {
        toast({ title: "שגיאה", description: "לא נמצא למחיקה", variant: "destructive" });
        return;
      }
      toast({ title: "נמחק", description: "הקובץ הוסר" });
      setRefreshTick((x) => x + 1);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message || "מחיקה נכשלה", variant: "destructive" });
    }
  };

  const handleEditorSave = async (payload: { fileNameBase: string; pdf: Blob; subject: string; tags: string[] }) => {
    try {
      const base = payload.fileNameBase;
      const stamp = nowStamp();
      const finalBase = editorMode === "edit" ? `${base} - ערוך ${stamp}` : base;

      const pdfFile = new File([payload.pdf], `${finalBase}.pdf`, { type: "application/pdf" });

      const upPdf = await workerApi.uploadAttachment(pdfFile);
      if (!upPdf.success || !upPdf.data) {
        toast({ title: "שגיאה", description: upPdf.error || "העלאת PDF נכשלה", variant: "destructive" });
        return;
      }

      // Save as NEW VERSION(s): add entries without deleting originals
      addFile({
        studentId,
        name: `${finalBase}.pdf`,
        subject: payload.subject,
        tags: payload.tags,
        webViewLink: upPdf.data.webViewLink,
        dropboxPath: upPdf.data.path,
        mimeType: upPdf.data.type || "application/pdf",
        size: upPdf.data.size,
        kind: editorMode === "edit" ? "upload" : "handwrite",
        template: editorMode === "edit" ? undefined : editorTemplate,
        uploadDate: new Date().toISOString(),
      });

      toast({ title: "נשמר", description: editorMode === "edit" ? "נשמרה גרסה חדשה" : "נשמר קובץ חדש" });
      setEditorOpen(false);
      setRefreshTick((x) => x + 1);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message || "שמירה נכשלה", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>הקבצים שלי</CardTitle>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={refreshingFiles} onClick={() => void refreshFromCloud()}>
            {refreshingFiles ? "טוען מהענן…" : "רענון מ-Dropbox"}
          </Button>
          <Button variant="secondary" onClick={handleOpenEditPicker}>
            עריכת קובץ
          </Button>
          <Button variant="secondary" onClick={() => { resetAddForm(); setAddMode("newpage"); setAddOpen(true); }} title="דף חדש"><Plus className="h-4 w-4 ml-1" /> דף חדש</Button>
          <Button variant="secondary" onClick={() => { resetAddForm(); setAddMode("upload"); setAddOpen(true); }} title="העלאת קובץ"><Upload className="h-4 w-4 ml-1" /> העלאה</Button>
          <Button variant={recording ? "destructive" : "secondary"} onClick={() => void toggleRecording()} title={recording ? "סיום הקלטה" : "הקלטה חדשה"}>{recording ? <Square className="h-4 w-4 ml-1" /> : <Mic className="h-4 w-4 ml-1" />}{recording ? "סיום הקלטה" : "הקלטה"}</Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2"><Label htmlFor="student-file-sort">מיון לפי</Label><select id="student-file-sort" aria-label="מיון קבצים" value={sortBy} onChange={e => setSortBy(e.target.value as FileSort)} className="rounded-md border bg-background text-foreground p-2"><option value="date">תאריך — החדשים תחילה</option><option value="name">שם</option><option value="topic">נושא</option><option value="type">סוג</option></select></div>
        {files.length === 0 ? (
          <div className="text-sm opacity-70">אין קבצים שמורים לתלמידה</div>
        ) : (
          <div className="grid gap-2">
            {files.map((f) => {
              const isReading = f.description?.includes('sight-reading:') && (f.mimeType === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
              const isOpen = visibleReadingId === f.id;
              const sourceExerciseId = f.description?.match(/sight-reading:([a-zA-Z0-9-]+)/)?.[1];
              const archivedExercise = isReading && sourceExerciseId ? getSightReadingArchive().find(item => item.id === sourceExerciseId) : undefined;
              return <div key={f.id} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{f.name}</div>
                    <div className="text-xs opacity-70">{new Date(f.uploadDate).toLocaleString("he-IL")} • {getFileCategory(f)} {f.subject ? `• ${f.subject}` : ""} {f.tags?.length ? `• ${f.tags.join(", ")}` : ""}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isReading && <Button variant="secondary" onClick={() => setVisibleReadingId(isOpen ? null : f.id)}>{isOpen ? 'סגירת תווים' : 'הצגת התווים כאן'}</Button>}
                    <Button variant="secondary" onClick={() => setOpenChoices(f)}>פתיחה / הורדה</Button>
                    <Button variant="destructive" onClick={() => void handleDelete(f)}>מחיקה</Button>
                  </div>
                </div>
                {isReading && isOpen && <div className="rounded-md border bg-white p-2" dir="ltr">
                  {archivedExercise?.xml ? (
                    <EngravedScore xml={archivedExercise.xml} />
                  ) : (
                    <iframe title={`תווים — ${f.name}`} src={f.webViewLink} className="w-full h-[72vh] min-h-[500px] border-0" loading="lazy" />
                  )}
                  <p className="text-xs text-slate-600 text-center" dir="rtl">תיווי ישיר בדף, ללא תוכנה חיצונית. אם התרגיל אינו זמין בתצוגה הפנימית, לחצי על פתיחה / הורדה.</p>
                </div>}
              </div>;
            })}          </div>
        )}
      </CardContent>

      <Dialog open={!!openChoices} onOpenChange={open => { if (!open) setOpenChoices(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>פתיחת קובץ: {openChoices?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Button variant="secondary" onClick={async () => {
              if (!openChoices) return;
              try {
                const kind = inferKindFromNameOrMime(openChoices.name, openChoices.mimeType);
                if (kind === "pdf") { toast({title:"עריכת PDF קיים עדיין לא נתמכת",description:"המסמך נשמר ללא שינוי. אפשר לפתוח במכשיר או להוריד.",variant:"destructive"}); return; }
                const blob = await fetchBlob(openChoices.webViewLink);
                if (getFileCategory(openChoices) === "קובץ שמע" || openChoices.kind === "link") {
                  toast({title:"סוג קובץ שאינו נתמך",description:"אפשר לפתוח במכשיר או להוריד קובץ זה",variant:"destructive"}); return;
                }
                openEditorForEdit(baseNameWithoutExt(openChoices.name), {kind, blob});
                setOpenChoices(null);
              } catch (e) { toast({title:"לא ניתן לפתוח בעורך",description:String(e),variant:"destructive"}); }
            }}>פתיחה בעורך לעריכה</Button>
            <Button variant="secondary" onClick={() => { if (openChoices) window.open(openChoices.webViewLink, "_blank", "noopener,noreferrer"); setOpenChoices(null); }}>פתיחה במכשיר</Button>
            <Button variant="secondary" onClick={() => {
              if (!openChoices) return;
              const a = document.createElement("a"); a.href = openChoices.webViewLink; a.download = openChoices.name; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); a.remove(); setOpenChoices(null);
            }}>הורדה</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>הוספת קובץ</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>סוג הוספה</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant={addMode === "upload" ? "default" : "secondary"} onClick={() => setAddMode("upload")}>
                  העלאה (מכשיר/Drive/מצלמה)
                </Button>
                <Button
                  variant={addMode === "newpage" ? "default" : "secondary"}
                  onClick={() => setAddMode("newpage")}
                >
                  קובץ חדש
                </Button>
                <Button variant={addMode === "link" ? "default" : "secondary"} onClick={() => setAddMode("link")}>
                  קישור
                </Button>
              </div>
            </div>

            {addMode === "upload" ? (
              <div className="grid gap-2">
                <Label>בחרי קובץ</Label>
                <input ref={addFileInputRef} type="file" />
                <div className="grid gap-2">
                  <Label>שם (אופציונלי)</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="אם ריק – ישמור בשם המקורי"
                  />
                </div>
              </div>
            ) : null}

            {addMode === "newpage" ? (
              <div className="grid gap-2">
                <Label>שם הקובץ</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: שיעור 5" />
                <Label>סוג דף</Label>
                <div className="flex gap-2">
                  <Button variant={template === "blank" ? "default" : "secondary"} onClick={() => setTemplate("blank")}>
                    ריק
                  </Button>
                  <Button variant={template === "lines" ? "default" : "secondary"} onClick={() => setTemplate("lines")}>
                    שורות
                  </Button>
                  <Button variant={template === "staff" ? "default" : "secondary"} onClick={() => setTemplate("staff")}>
                    חמשות
                  </Button>
                </div>
              </div>
            ) : null}

            {addMode === "link" ? (
              <div className="grid gap-2">
                <Label>שם הקובץ</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: דף תווים" />
                <Label>קישור</Label>
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddOpen(false)}>
                ביטול
              </Button>
              <Button onClick={() => void handleAddSubmit()}>המשך</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit picker dialog */}
      <Dialog open={editPickOpen} onOpenChange={setEditPickOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>עריכת קובץ</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>מאיפה להביא קובץ לעריכה?</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={editPickMode === "from_app" ? "default" : "secondary"}
                  onClick={() => setEditPickMode("from_app")}
                >
                  מהתוכנה (Dropbox)
                </Button>
                <Button
                  variant={editPickMode === "from_device" ? "default" : "secondary"}
                  onClick={() => setEditPickMode("from_device")}
                >
                  מהמכשיר / Drive
                </Button>
              </div>
            </div>

            {editPickMode === "from_app" ? (
              <div className="grid gap-2">
                <Label>בחרי קובץ קיים</Label>
                <select
                  value={pickedAppFileId}
                  onChange={(e) => setPickedAppFileId(e.target.value)}
                  className="h-10 rounded-md border border-white/10 bg-black/20 px-3"
                >
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {editPickMode === "from_device" ? (
              <div className="grid gap-2">
                <Label>בחרי קובץ מהמכשיר/Drive</Label>
                <input ref={editFileInputRef} type="file" accept="image/*" />
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditPickOpen(false)}>
                ביטול
              </Button>
              <Button onClick={() => void handleEditPickContinue()}>פתיחה לעורך</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editor dialog (near full screen) */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-hidden p-4">
          <div className="h-full">
            <DocumentEditor
              mode={editorMode}
              initialFileName={editorInitialName}
              initialTemplate={editorTemplate}
              source={editorSource}
              onCancel={() => setEditorOpen(false)}
              onSave={handleEditorSave}
            />
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
