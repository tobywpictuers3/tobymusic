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

import { workerApi } from "@/lib/workerApi";
import { hybridSync } from "@/lib/hybridSync";
import { downloadCanonicalDropboxLatest } from "@/lib/canonicalDropboxRead";
import { makeSightReadingPdf } from "@/components/admin/SightReadingVerovio";
import { getCurrentUser } from "@/lib/storage";

import DocumentEditor, { editorSourceFromFile } from "./DocumentEditor";
import PdfAnnotationEditor from "./PdfAnnotationEditor";

interface StudentFilesProps {
  studentId: string;
}

type AddMode = "upload" | "link" | "newpage";
type NewPageTemplate = "blank" | "staff" | "piano";
type EditPickMode = "from_app" | "from_device";
type FileSort = "date" | "name" | "topic" | "type";

function getFileCategory(f: FileEntry): string {
  const mime = (f.mimeType || "").toLowerCase();
  const name = f.name.toLowerCase();
  if (f.kind === "handwrite") return "דף שנוצר בעורך";
  if (f.kind === "recording") return "הקלטה";
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
  return null;
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
  const [readingPickerOpen, setReadingPickerOpen] = useState(false);
  const [readingItemId,setReadingItemId] = useState("");
  const [busyFiles,setBusyFiles] = useState(false);
  const isTeacher = getCurrentUser()?.type === "admin";
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTargetRef = useRef<string | null>(null);
  const linkedAudioInput = useRef<HTMLInputElement | null>(null);
  const [linkedAudioParent,setLinkedAudioParent] = useState<string | null>(null);

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
  const [editorOriginal, setEditorOriginal] = useState<FileEntry | null>(null);

  const verifySavedFile = async (id: string): Promise<void> => {
    const synced=await hybridSync.manualSync();
    if (!synced) throw new Error("נוצרה רשומה מקומית אך הסנכרון לענן לא אומת. שמרי שוב באמצעות כפתור השמירה הראשי.");
    const read=await downloadCanonicalDropboxLatest();
    if(!read.success||!read.data)throw new Error("נשמר מקומית אך לא התקבל אישור קריאה חוזרת מ-Dropbox.");
    const raw=read.data as Record<string,unknown>;
    const files=(raw.musicSystem_files??raw.files) as unknown;
    if(!Array.isArray(files) || !files.some(entry=>entry && typeof entry==="object" && (entry as FileEntry).id===id && (entry as FileEntry).studentId===studentId))
      throw new Error("הקובץ טרם אומת ב-Dropbox. הנתונים המקומיים נשמרו ויש לנסות לסנכרן.");
  };

  const addNotationFromEngine = async () => {
    const item=getSightReadingArchive().find(a=>a.id===readingItemId);
    if(!item||!isTeacher)return;
    const existing=getFiles().find(f=>f.studentId===studentId&&f.description?.includes("sight-reading:"+item.id));
    if(existing){toast({title:"כבר קיים",description:"התווים כבר משויכים לתלמידה"});return;}
    setBusyFiles(true);
    try {
      const pdf=await makeSightReadingPdf(item.xml);
      const name=(item.title||"תרגיל תווים")+".pdf";
      const upload=await workerApi.uploadAttachment(new File([pdf],name,{type:"application/pdf"}));
      if(!upload.success||!upload.data)throw new Error(upload.error||"העלאת תווים נכשלה");
      const record=addFile({studentId,name,description:"תרגיל קריאה מהדף · sight-reading:"+item.id,subject:"קריאה",tags:["קריאה"],kind:"upload",template:undefined,
        mimeType:"application/pdf",size:pdf.size,dropboxPath:upload.data.path,webViewLink:upload.data.webViewLink});
      setRefreshTick(t=>t+1);
      await verifySavedFile(record.id);
      setReadingPickerOpen(false);
      toast({title:"נשמר ואומת",description:"דף התווים נוסף לאזור האישי ולספריית המורה"});
    }catch(e){toast({title:"העברת התווים לא הושלמה",description:String(e),variant:"destructive"});}
    finally{setBusyFiles(false);}
  };

  const toggleRecording = async (parentFileId: string | null = null) => {
    if (recorderRef.current?.state === "recording") { recorderRef.current.stop(); setRecording(false); return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("הדפדפן אינו תומך בהקלטה");
      recordingTargetRef.current = parentFileId;
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
        const associated = recordingTargetRef.current;
        recordingTargetRef.current = null;
        try {
          const format = rec.mimeType.includes("mp4") ? "m4a" : "webm";
          const mime = rec.mimeType || "audio/webm";
          const name = "הקלטה " + nowStamp();
          const file = new File([new Blob(chunks,{type:mime})], name + "." + format,{type:mime});
          if (!file.size) throw new Error("ההקלטה ריקה");
          const upload = await workerApi.uploadAttachment(file);
          if (!upload.success || !upload.data) throw new Error(upload.error || "העלאת ההקלטה נכשלה");
          const record=addFile({studentId,name:file.name,mimeType:mime,kind:"recording",parentFileId:associated||undefined,webViewLink:upload.data.webViewLink,dropboxPath:upload.data.path,size:file.size});
          setRefreshTick(n=>n+1);
          await verifySavedFile(record.id);
          toast({title:"ההקלטה נשמרה ואומתה",description:"הקובץ נוסף לספרייה"});
        } catch (error) {toast({title:"לא ניתן לשמור הקלטה",description:String(error),variant:"destructive"});}
      };
      rec.start(); setRecording(true);
    } catch(error) {recordingStreamRef.current?.getTracks().forEach(t=>t.stop());recordingTargetRef.current=null;toast({title:"לא ניתן להתחיל הקלטה",description:String(error),variant:"destructive"});}
  };

  const attachAudioFromDevice = async (file: File, parentFileId: string) => {
    if (!file.type.startsWith("audio/") && !/\.(wav|mp3|m4a|ogg|webm|aac|flac)$/i.test(file.name)) {
      toast({title:"יש לבחור קובץ שמע",variant:"destructive"});return;
    }
    setBusyFiles(true);
    try{
      const upload=await workerApi.uploadAttachment(file);
      if(!upload.success||!upload.data)throw new Error(upload.error||"העלאת שמע נכשלה");
      const record=addFile({studentId,name:file.name,kind:"upload",mimeType:file.type||"audio/mpeg",size:file.size,
        parentFileId,webViewLink:upload.data.webViewLink,dropboxPath:upload.data.path});
      setRefreshTick(n=>n+1);
      await verifySavedFile(record.id);
      toast({title:"קובץ השמע צורף ואומת"});
      setOpenChoices(null);
    }catch(e){toast({title:"קובץ השמע לא אומת",description:String(e),variant:"destructive"});}
    finally{setBusyFiles(false);setLinkedAudioParent(null);}
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
    setEditorOriginal(null);
    setEditorOpen(true);
  };

  const openEditorForEdit = (nameBase: string, source: { kind: "image" | "pdf"; blob: Blob }, file?: FileEntry) => {
    setEditorMode("edit");
    setEditorInitialName(nameBase);
    setEditorSource(source);
    setEditorOriginal(file || null);
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

        const record=addFile({
          studentId,
          name: title.trim(),
          webViewLink: linkUrl.trim(),
          kind: "link",
          uploadDate: new Date().toISOString(),
        });

        setRefreshTick(t=>t+1);
        await verifySavedFile(record.id);
        toast({ title: "נוסף", description: "הקישור נשמר ואומת" });
        setAddOpen(false);
        setRefreshTick((x) => x + 1);
        return;
      }

      if (addMode === "newpage") {
        openEditorForNew(title.trim() || "דף חדש", template);
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

      const record=addFile({
        studentId,
        name: title.trim() || f.name,
        webViewLink: result.data.webViewLink,
        dropboxPath: result.data.path,
        mimeType: result.data.type || f.type,
        size: result.data.size || f.size,
        kind: "upload",
        uploadDate: new Date().toISOString(),
      });

      setRefreshTick(t=>t+1);
      await verifySavedFile(record.id);
      toast({ title: "הועלה", description: "הקובץ נוסף ואומת" });
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

      const kind = inferKindFromNameOrMime(fe.name, fe.mimeType);
      if (getFileCategory(fe) === "קובץ שמע" || fe.kind === "link") {
        toast({title:"עריכה אינה זמינה לסוג קובץ זה",description:"הקובץ המקורי נשמר ללא שינוי. ניתן לפתוח אותו במכשיר או להוריד.",variant:"destructive"});
        return;
      }
      if(!kind)throw new Error("סוג קובץ זה אינו נתמך בעריכה");
      const blob = await fetchBlob(fe.webViewLink);

      openEditorForEdit(baseNameWithoutExt(fe.name) || "עריכה", { kind, blob }, fe);
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
      const record=addFile({
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

      setRefreshTick(t=>t+1);
      await verifySavedFile(record.id);
      toast({ title: "נשמר ואומת", description: editorMode === "edit" ? "נשמרה גרסה חדשה" : "נשמר קובץ PDF A4" });
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
          {isTeacher && <Button variant="secondary" onClick={() => {setReadingItemId(getSightReadingArchive()[0]?.id||"");setReadingPickerOpen(true);}} title="ממנוע התווים">ממנוע התווים</Button>}
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
              return <div key={f.id} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{f.name}</div>
                    <div className="text-xs opacity-70">{new Date(f.uploadDate).toLocaleString("he-IL")} • {getFileCategory(f)} {f.parentFileId ? `• צורף לדף: ${files.find(parent=>parent.id===f.parentFileId)?.name||"קובץ קודם"}` : ""} {f.subject ? `• ${f.subject}` : ""} {f.tags?.length ? `• ${f.tags.join(", ")}` : ""}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setOpenChoices(f)}>פתיחה / הורדה</Button>
                    <Button variant="destructive" onClick={() => void handleDelete(f)}>מחיקה</Button>
                  </div>
                </div>

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
                if (!kind || ["קובץ שמע","הקלטה"].includes(getFileCategory(openChoices)) || openChoices.kind === "link") {
                  toast({title:"סוג קובץ שאינו נתמך",description:"אפשר לפתוח במכשיר או להוריד קובץ זה",variant:"destructive"}); return;
                }
                const blob = await fetchBlob(openChoices.webViewLink);
                openEditorForEdit(baseNameWithoutExt(openChoices.name), {kind, blob}, openChoices);
                setOpenChoices(null);
              } catch (e) { toast({title:"לא ניתן לפתוח בעורך",description:String(e),variant:"destructive"}); }
            }}>פתיחה בעורך לעריכה</Button>
            <Button variant="secondary" onClick={() => { if (openChoices) window.open(openChoices.webViewLink, "_blank", "noopener,noreferrer"); setOpenChoices(null); }}>פתיחה במכשיר</Button>
            {openChoices && !["הקלטה","קובץ שמע"].includes(getFileCategory(openChoices)) && <>
              <Button variant="secondary" onClick={()=>{if(openChoices){void toggleRecording(openChoices.id);setOpenChoices(null);}}}>הקלטה חדשה מצורפת לדף</Button>
              <Button variant="secondary" disabled={busyFiles} onClick={()=>{setLinkedAudioParent(openChoices.id);linkedAudioInput.current?.click();}}>צירוף קובץ שמע מהמכשיר</Button>
            </>}
            <Button variant="secondary" onClick={async () => {
              const file=openChoices;if(!file)return;
              try {
                const blob=await fetchBlob(file.webViewLink);
                const url=URL.createObjectURL(blob);
                const link=document.createElement("a");link.href=url;link.download=file.name;link.rel="noopener noreferrer";
                document.body.appendChild(link);link.click();link.remove();
                window.setTimeout(()=>URL.revokeObjectURL(url),20000);
                setOpenChoices(null);
              } catch(e) {
                toast({title:"ההורדה הישירה נחסמה",description:"הקובץ ייפתח במכשיר; אפשר להוריד אותו משם.",variant:"destructive"});
                window.open(file.webViewLink,"_blank","noopener,noreferrer");
              }
            }}>הורדה</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={readingPickerOpen} onOpenChange={setReadingPickerOpen}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>הוספת תווים ממנוע היצירה</DialogTitle></DialogHeader>
        <select className="p-2 rounded border bg-background text-foreground w-full" aria-label="תרגיל תווים" value={readingItemId} onChange={e=>setReadingItemId(e.target.value)}>
          {getSightReadingArchive().map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <Button disabled={!readingItemId||busyFiles} onClick={()=>void addNotationFromEngine()}>{busyFiles?"מעביר תווים…":"צירוף לתלמידה"}</Button>
      </DialogContent>
      </Dialog>
      <input ref={linkedAudioInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" className="hidden" aria-label="קובץ שמע לצירוף לדף" onChange={e=>{const f=e.target.files?.[0];if(f&&linkedAudioParent)void attachAudioFromDevice(f,linkedAudioParent);e.target.value="";}} />
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
                  <Button variant={template === "piano" ? "default" : "secondary"} onClick={() => setTemplate("piano")}>
                    תווים לפסנתר
                  </Button>
                  <Button variant={template === "staff" ? "default" : "secondary"} onClick={() => setTemplate("staff")}>
                    תווים רגיל
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
            {editorSource?.kind === "pdf" ? (
              <PdfAnnotationEditor
                blob={editorSource.blob}
                initialFileName={editorInitialName}
                initialSubject={editorOriginal?.subject}
                initialTags={editorOriginal?.tags}
                onCancel={() => setEditorOpen(false)}
                onSave={handleEditorSave}
              />
            ) : (
              <DocumentEditor
                mode={editorMode}
                initialFileName={editorInitialName}
                initialTemplate={editorTemplate}
                source={editorSource}
                onCancel={() => setEditorOpen(false)}
                onSave={handleEditorSave}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
