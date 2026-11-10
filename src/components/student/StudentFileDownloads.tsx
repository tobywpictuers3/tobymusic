import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getCurrentUser, getFiles } from "@/lib/storage";
import type { FileEntry } from "@/lib/types";

type SortKey = "date" | "name" | "topic" | "type";

function fileType(file: FileEntry): string {
  const mime = (file.mimeType || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (file.kind === "recording") return "הקלטה";
  if (file.kind === "handwrite") return "דף מהעורך";
  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(name)) return "קובץ שמע";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  return file.kind === "link" ? "קישור" : "העלאה";
}

/** Student-facing view intentionally contains no upload, editor, microphone or mutation controls. */
export default function StudentFileDownloads({ studentId }: { studentId: string }) {
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [downloading, setDownloading] = useState<string | null>(null);
  const currentUser = getCurrentUser();
  const permitted = currentUser?.type === "admin" ||
    (currentUser?.type === "student" && currentUser.studentId === studentId);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("toby:canonical-sync-applied", refresh);
    return () => window.removeEventListener("toby:canonical-sync-applied", refresh);
  }, []);

  const files = useMemo(() => {
    if (!permitted) return [];
    const collator = new Intl.Collator("he");
    const query = search.trim().toLocaleLowerCase("he");
    return getFiles().filter(file => file.studentId === studentId &&
      [file.name, file.subject, file.description, file.tags?.join(" "), fileType(file)]
        .some(value => (value || "").toLocaleLowerCase("he").includes(query)))
      .sort((a, b) => {
        if (sort === "name") return collator.compare(a.name, b.name);
        if (sort === "topic") return collator.compare(a.subject || a.description || "", b.subject || b.description || "");
        if (sort === "type") return collator.compare(fileType(a), fileType(b));
        return (b.uploadDate || "").localeCompare(a.uploadDate || "");
      });
  }, [studentId, permitted, revision, search, sort]);

  const downloadFile = async (file: FileEntry) => {
    if (!permitted || downloading) return;
    let url: URL;
    try {
      url = new URL(file.webViewLink);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid link");
    } catch {
      toast({ title: "הקישור לקובץ אינו תקין", variant: "destructive" });
      return;
    }
    setDownloading(file.id);
    try {
      // First try a real Blob download, which preserves the original filename.
      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      if (!blob.size) throw new Error("קובץ ריק");
      const local = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = local;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(local), 30000);
    } catch {
      // Cross-origin Dropbox sharing links often disallow fetch; request direct download
      // from Dropbox instead of exposing any manager-only Worker endpoint to students.
      if (url.hostname === "dropbox.com" || url.hostname.endsWith(".dropbox.com")) {
        url.searchParams.set("dl", "1");
      }
      const anchor = document.createElement("a");
      anchor.href = url.toString();
      anchor.download = file.name;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast({ title: "ההורדה נפתחה דרך ספק הקובץ", description: "אם הדפדפן פתח תצוגה מקדימה, ניתן לבחור בהורדה משם." });
    } finally {
      setDownloading(null);
    }
  };

  if (!permitted) {
    return <Card><CardContent className="p-4 text-sm">אין הרשאה לצפות בקבצים של תלמידה אחרת.</CardContent></Card>;
  }

  return (
    <Card dir="rtl">
      <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />הקבצים שלי</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">הקבצים שהמורה שייכה לך זמינים להורדה למכשיר.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="חיפוש קבצים להורדה" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="חיפוש לפי שם, נושא או תגית" className="min-w-44 flex-1" />
          <select aria-label="מיון קבצים להורדה" value={sort} onChange={event => setSort(event.target.value as SortKey)}
            className="rounded-md border bg-background p-2 text-sm">
            <option value="date">תאריך — חדשים תחילה</option>
            <option value="name">שם</option>
            <option value="topic">נושא</option>
            <option value="type">סוג</option>
          </select>
        </div>
        {files.length === 0 && <p className="text-sm text-muted-foreground">אין קבצים זמינים להורדה.</p>}
        <div className="grid gap-2">
          {files.map(file => (
            <div key={file.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="break-words font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {fileType(file)} · {file.uploadDate ? new Date(file.uploadDate).toLocaleDateString("he-IL") : ""}
                  {file.subject ? ` · ${file.subject}` : ""}
                </div>
                {!!file.tags?.length && <div className="text-xs text-muted-foreground">{file.tags.join(" · ")}</div>}
              </div>
              <Button variant="secondary" disabled={downloading === file.id}
                onClick={() => void downloadFile(file)}>
                <Download className="h-4 w-4 ml-2" />{downloading === file.id ? "מוריד…" : file.kind === "link" ? "מעבר לקישור" : "הורדה"}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
