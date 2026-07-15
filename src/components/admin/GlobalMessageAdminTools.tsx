import { useMemo, useState } from 'react';
import { AlertTriangle, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getMessages } from '@/lib/messages';
import { Message } from '@/lib/types';
import { deleteMessageGloballyAsAdmin } from '@/lib/adminGlobalDelete';

const normalize = (value: unknown): string => String(value || '').toLocaleLowerCase('he-IL');

const messageTime = (message: Message): string => {
  try {
    return new Date(message.createdAt).toLocaleString('he-IL');
  } catch {
    return String(message.createdAt || '');
  }
};

export default function GlobalMessageAdminTools() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const messages = useMemo(() => {
    const search = normalize(query).trim();
    // Use the central message collection rather than the admin mailbox filter.
    // This intentionally includes broadcasts sent by students to "all", even
    // when the original message did not name admin as a direct recipient.
    return getMessages()
      .filter(message => !message.isDraft)
      .filter(message => {
        if (!search) return true;
        return [message.subject, message.content, message.senderName, message.id]
          .some(value => normalize(value).includes(search));
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);
  }, [query, isOpen]);

  const deleteGlobally = async (message: Message) => {
    const confirmed = window.confirm(
      `למחוק את ההודעה "${message.subject || '(ללא נושא)'}" מכל הדואר בפלטפורמה ומרשימת ההשמעה בימות?\n\n` +
      'הפעולה יוצרת סימון מחיקה קבוע ואינה ניתנת לביטול.'
    );
    if (!confirmed) return;

    const managerCode = window.prompt('הקישי את קוד המנהל לאישור המחיקה המערכתית:');
    if (!managerCode?.trim()) return;

    setDeletingId(message.id);
    try {
      const result = await deleteMessageGloballyAsAdmin(message.id, managerCode.trim());
      const emailNotice = message.emailSent
        ? ' מייל שכבר נמסר לתיבה פרטית אינו ניתן למשיכה מרחוק.'
        : '';
      const yemotNotice = result.removedFromYemotPlayback
        ? ' רשימת ההשמעה בימות רועננה.'
        : ' רענון ימות לא הושלם ויש לבדוק את הדוח.';
      toast.success(`ההודעה נמחקה מכל הפלטפורמה.${yemotNotice}${emailNotice}`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      console.error('Global delete failed:', error);
      toast.error(error instanceof Error ? error.message : 'המחיקה המערכתית נכשלה');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-destructive/30 bg-background/90 shadow-sm" dir="rtl">
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-between rounded-xl p-4 h-auto"
        onClick={() => setIsOpen(value => !value)}
      >
        <span className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-destructive" />
          כלי מנהל — מחיקה מכל המערכת
        </span>
        <Badge variant="outline">{isOpen ? 'סגירה' : 'פתיחה'}</Badge>
      </Button>

      {isOpen && (
        <div className="border-t p-4 space-y-4">
          <div className="flex gap-2 items-start rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p>
              מחיקה כאן מסירה את הרשומה המקורית מדואר נכנס, דואר יוצא, בקשות החלפה ורשימת ההשמעה בימות.
              מייל שכבר הגיע לתיבה פרטית של תלמידה אינו ניתן למחיקה מרחוק.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="חיפוש לפי שולחת, נושא, תוכן או מזהה"
              className="pr-9"
            />
          </div>

          <div className="max-h-80 overflow-y-auto divide-y rounded-lg border">
            {messages.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">לא נמצאו הודעות</div>
            ) : messages.map(message => (
              <div key={message.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{message.subject || '(ללא נושא)'}</div>
                  <div className="text-xs text-muted-foreground">
                    מאת {message.senderName || 'לא ידוע'} · {messageTime(message)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-1">
                    {message.content || 'ללא תוכן טקסטואלי'}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={deletingId === message.id}
                  onClick={() => deleteGlobally(message)}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4 ml-2" />
                  {deletingId === message.id ? 'מוחק...' : 'מחק מכל המערכת'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
