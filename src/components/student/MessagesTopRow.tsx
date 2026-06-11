import { useEffect, useState } from "react";
import { Card } from "@/components/safe-ui/card";
import { Badge } from "@/components/safe-ui/badge";
import { Button } from "@/components/safe-ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/safe-ui/dialog";
import { Textarea } from "@/components/safe-ui/textarea";
import { Input } from "@/components/safe-ui/input";
import { Label } from "@/components/safe-ui/label";
import { getMessagesForStudent, markMessageAsRead, addMessage } from "@/lib/messages";
import { Message } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize";
import { toast } from "sonner";
import { Mail, Send, MailOpen } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  studentName: string;
}

export default function MessagesTopRow({ studentId, studentName }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [opened, setOpened] = useState<Message | null>(null);
  const [replyMode, setReplyMode] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyContent, setReplyContent] = useState("");

  const load = () => setMessages(getMessagesForStudent(studentId).filter(m => m.senderId !== studentId));

  useEffect(() => { load(); }, [studentId]);

  const handleOpen = (m: Message) => {
    setOpened(m);
    setReplyMode(false);
    if (!m.isRead?.[studentId]) {
      markMessageAsRead(m.id, studentId);
      load();
    }
  };

  const handleSendReply = () => {
    if (!replyContent.trim()) {
      toast.error("נא למלא תוכן הודעה");
      return;
    }
    addMessage({
      senderId: studentId,
      senderName: studentName,
      recipientIds: [opened?.senderId || "admin"],
      subject: replySubject || `תגובה: ${opened?.subject || ""}`,
      content: replyContent,
      inReplyTo: opened?.id,
      type: "general",
    });
    toast.success("התגובה נשלחה");
    setReplyMode(false);
    setReplyContent("");
    setReplySubject("");
    setOpened(null);
  };

  const count = messages.length;

  if (count === 0) {
    return (
      <Card className="card-homepage p-8 text-center text-muted-foreground">
        אין הודעות חדשות
      </Card>
    );
  }

  return (
    <>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        {messages.map((m, idx) => {
          const isRead = !!m.isRead?.[studentId];
          return (
            <button
              key={m.id}
              onClick={() => handleOpen(m)}
              className={cn(
                "text-right card-homepage hover-sparkle rounded-[var(--radius)] p-4 flex flex-col gap-2 min-h-[140px]",
                "transition-all animate-fade-in",
                !isRead && "border-2 border-primary glow-gold"
              )}
              style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isRead ? <MailOpen className="w-4 h-4 shrink-0 text-muted-foreground" /> : <Mail className="w-4 h-4 shrink-0 text-primary" />}
                  <h4 className="font-display text-base font-semibold truncate">{m.subject || "(ללא נושא)"}</h4>
                </div>
                {!isRead && <Badge className="shrink-0">חדש</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate">מאת: {m.senderName}</p>
              <p className="text-sm line-clamp-3 flex-1 text-foreground/85">{m.content}</p>
              <p className="text-[11px] text-muted-foreground mt-auto">
                {format(new Date(m.createdAt), "dd/MM/yyyy HH:mm", { locale: he })}
              </p>
            </button>
          );
        })}
      </div>

      <Dialog open={!!opened} onOpenChange={(o) => { if (!o) { setOpened(null); setReplyMode(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          {opened && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{opened.subject || "(ללא נושא)"}</DialogTitle>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3">
                  <span>מאת: {opened.senderName}</span>
                  <span>{format(new Date(opened.createdAt), "dd/MM/yyyy HH:mm", { locale: he })}</span>
                </div>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {opened.contentHtml ? (
                  <div
                    className="prose prose-sm max-w-none rtl text-foreground"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(opened.contentHtml) }}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{opened.content}</p>
                )}

                {!replyMode ? (
                  <div className="flex gap-2 pt-2">
                    <Button onClick={() => { setReplyMode(true); setReplySubject(`תגובה: ${opened.subject}`); }} className="btn-gold">
                      <Send className="w-4 h-4 ml-2" /> תגובה
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="space-y-1">
                      <Label htmlFor="reply-subj">נושא</Label>
                      <Input id="reply-subj" value={replySubject} onChange={(e) => setReplySubject(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="reply-cnt">תוכן</Label>
                      <Textarea id="reply-cnt" rows={5} value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="תוכן התגובה" />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSendReply} className="btn-confirm flex-1">
                        <Send className="w-4 h-4 ml-2" /> שלח תגובה
                      </Button>
                      <Button variant="outline" onClick={() => setReplyMode(false)}>ביטול</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}