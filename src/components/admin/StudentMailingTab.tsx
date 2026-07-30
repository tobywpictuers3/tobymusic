import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStudents } from '@/lib/storage';
import { TOBY_EMAIL_BLOCKS, TOBY_EMOJIS, wrapTobyEmail } from '@/lib/tobyMailingTemplate';
import { ExternalLink, MailCheck, RefreshCw, Send, TestTube2 } from 'lucide-react';

const SITE_ORIGIN = 'https://tobymusic.club';
const BRIDGE_URL = `${SITE_ORIGIN}/students-mail-bridge`;

type TplFields = {
  headline: string;
  imageUrl: string;
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  psLine: string;
};

const DEFAULT_TPL: TplFields = {
  headline: '',
  imageUrl: '',
  bodyText: '',
  ctaText: 'לפרטים נוספים באתר',
  ctaUrl: 'https://tobymusic.club',
  psLine: '',
};

function renderTemplateHtml(f: TplFields): string {
  const paras = f.bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:19px;color:#F8F4EC;line-height:1.95;margin:0 0 22px;text-align:center;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return `${f.imageUrl.trim() ? `<img src="${f.imageUrl.trim()}" alt="" width="536" style="max-width:100%;height:auto;display:block;margin:0 auto 22px;border-radius:8px;" />` : ''}
${f.headline.trim() ? `<p style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;color:#FFE5A0;margin:0 0 22px;line-height:1.3;text-align:center;">${f.headline}</p>` : ''}
${paras}
${f.ctaText.trim() ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0;"><tr><td align="center"><a href="${f.ctaUrl.trim() || 'https://tobymusic.club'}" style="display:inline-block;padding:15px 38px;background:linear-gradient(110deg,#8B2A37,#C9A961,#FFE5A0,#C9A961,#6B1F2A);color:#0F0F12;font-family:Arial,sans-serif;font-weight:700;font-size:18px;border-radius:8px;text-decoration:none;">✨ ${f.ctaText}</a></td></tr></table>` : ''}
${f.psLine.trim() ? `<p style="font-family:Georgia,'Times New Roman',serif;font-size:15px;font-style:italic;color:#C9A961;line-height:1.9;margin:0 0 14px;text-align:center;">${f.psLine}</p>` : ''}`;
}

type BridgeMessage = Record<string, unknown> & { type: string };

type ListStatus = {
  account1?: { id: number; count: number };
  account2?: { id: number; count: number };
};

export default function StudentMailingTab() {
  const [mode, setMode] = useState<'template' | 'html'>('template');
  const [subject, setSubject] = useState('');
  const [tpl, setTpl] = useState<TplFields>(DEFAULT_TPL);
  const [rawHtml, setRawHtml] = useState('');
  const [light, setLight] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [state, setState] = useState('');
  const [bridgeReady, setBridgeReady] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [lists, setLists] = useState<ListStatus | null>(null);
  const [syncResult, setSyncResult] = useState('');
  const [busy, setBusy] = useState(false);

  const bridgeRef = useRef<Window | null>(null);
  const queuedRef = useRef<BridgeMessage | null>(null);
  const afterSyncRef = useRef<BridgeMessage | null>(null);
  const syncedAfterConnectRef = useRef(false);
  const htmlRef = useRef<HTMLTextAreaElement>(null);

  const currentBody = mode === 'template' ? renderTemplateHtml(tpl) : rawHtml;
  const preview = useMemo(
    () => wrapTobyEmail(subject || 'תצוגה מקדימה', currentBody, { theme: light ? 'light' : 'dark' }),
    [subject, currentBody, light]
  );

  const studentsPayload = () => {
    const students = getStudents().filter((s) => s.isActive !== false);
    const rows: { email: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const student of students) {
      const name = `${student.firstName || ''} ${student.lastName || ''}`.trim();
      const emails = [student.email, ...(student.additionalEmails || [])]
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e.includes('@'));
      for (const email of emails) {
        if (seen.has(email)) continue;
        seen.add(email);
        rows.push({ email, name });
      }
    }
    return rows;
  };

  const postToBridge = (message: BridgeMessage) => {
    if (bridgeReady && bridgeRef.current && !bridgeRef.current.closed) {
      bridgeRef.current.postMessage(message, SITE_ORIGIN);
      return true;
    }
    queuedRef.current = message;
    const popup = window.open(BRIDGE_URL, 'toby-students-mail-bridge', 'width=580,height=720,resizable=yes,scrollbars=yes');
    if (!popup) {
      setState('הדפדפן חסם את חלון החיבור. אשרי חלונות קופצים לאתר ונסי שוב.');
      setBusy(false);
      return false;
    }
    bridgeRef.current = popup;
    setState('נפתח חלון חיבור מאובטח לאתר. אם תתבקשי — הזיני שם את קוד המנהלת.');
    return true;
  };

  const sendSync = (after?: BridgeMessage) => {
    if (after) afterSyncRef.current = after;
    const rows = studentsPayload();
    setBusy(true);
    setSyncResult(`מסנכרנת ${rows.length} כתובות תלמידות…`);
    postToBridge({ type: 'TOBY_STUDENTS_SYNC', students: rows });
  };

  const requestStatus = () => {
    setBusy(true);
    postToBridge({ type: 'TOBY_STUDENTS_STATUS', draftId: draftId || null });
  };

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== SITE_ORIGIN) return;
      if (bridgeRef.current && event.source !== bridgeRef.current) return;
      const data = event.data || {};

      if (data.type === 'TOBY_STUDENTS_BRIDGE_READY') {
        setBridgeReady(true);
        setState('החיבור לאתר פעיל ומאובטח ✅');
        const queued = queuedRef.current;
        queuedRef.current = null;
        if (queued && bridgeRef.current) {
          bridgeRef.current.postMessage(queued, SITE_ORIGIN);
        } else if (!syncedAfterConnectRef.current) {
          setTimeout(() => sendSync(), 50);
        }
        return;
      }

      if (data.type === 'TOBY_STUDENTS_SYNC_RESULT') {
        setBusy(false);
        if (data.ok) {
          syncedAfterConnectRef.current = true;
          setSyncResult(`סונכרן ✅ · חשבון 1: ${data.account1?.desired ?? 0} · חשבון 2: ${data.account2?.desired ?? 0}`);
          setLists({
            account1: { id: data.account1?.listId, count: data.account1?.desired ?? 0 },
            account2: { id: data.account2?.listId, count: data.account2?.desired ?? 0 },
          });
          const after = afterSyncRef.current;
          afterSyncRef.current = null;
          if (after && bridgeRef.current && !bridgeRef.current.closed) {
            setBusy(true);
            if (after.action === 'prepare') setState('הרשימה מעודכנת. מכינה עכשיו את הקמפיין ב-Brevo…');
            if (after.action === 'send') setState('הרשימה מעודכנת. שולחת עכשיו לתלמידות…');
            bridgeRef.current.postMessage(after, SITE_ORIGIN);
          }
        } else {
          afterSyncRef.current = null;
          setSyncResult(`הסנכרון נכשל: ${data.error || 'שגיאה לא ידועה'}`);
          setState('הפעולה נעצרה כדי שלא תישלח תפוצה לרשימת תלמידות לא מעודכנת.');
        }
        return;
      }

      if (data.type === 'TOBY_STUDENTS_STATUS_RESULT') {
        setBusy(false);
        if (data.ok) {
          setLists(data.lists || null);
          const found = data.campaigns?.found || [];
          if (found.length) {
            setState(found.map((c: any) => `${c.account === 'acc1' ? 'חשבון 1' : 'חשבון 2'}: ${c.ok ? `${c.status || 'נמצא'} #${c.id}` : 'חסר'}`).join(' · '));
          } else {
            setState('מצב רשימות Brevo נטען ✅');
          }
        } else {
          setState(`בדיקת Brevo נכשלה: ${data.error || 'שגיאה'}`);
        }
        return;
      }

      if (data.type === 'TOBY_STUDENTS_MAIL_RESULT') {
        setBusy(false);
        if (!data.ok) {
          setState(`הפעולה נכשלה: ${data.error || 'שגיאה לא ידועה'}`);
          return;
        }
        if (data.action === 'test') {
          setState('טסט נשלח ל-tobyw.tobymusic@gmail.com ✅');
        } else if (data.action === 'prepare') {
          setDraftId(data.draftId || '');
          setState('הקמפיין הוכן ב-Brevo ולא נשלח ✅');
        } else if (data.action === 'send') {
          setState(data.ok ? 'השליחה הסופית לתלמידות יצאה ✅' : 'השליחה הושלמה חלקית — בדקי ב-Brevo');
        }
        return;
      }

      if (data.type === 'TOBY_STUDENTS_BRIDGE_ERROR') {
        setBusy(false);
        setBridgeReady(false);
        afterSyncRef.current = null;
        setState('החיבור לאתר דורש התחברות מחדש. פתחי את חלון החיבור והתחברי בקוד המנהלת.');
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeReady, draftId]);

  const validate = () => {
    if (!subject.trim()) { setState('נא למלא נושא למייל'); return false; }
    if (!currentBody.trim()) { setState('נא למלא תוכן'); return false; }
    return true;
  };

  const runMailAction = (action: 'test' | 'prepare') => {
    if (!validate()) return;
    const message: BridgeMessage = { type: 'TOBY_STUDENTS_MAIL', action, subject, bodyHtml: currentBody };
    if (action === 'test') {
      setBusy(true);
      setState('שולחת טסט…');
      postToBridge(message);
      return;
    }
    setState('מסנכרנת קודם את רשימת התלמידות העדכנית…');
    sendSync(message);
  };

  const sendFinal = () => {
    if (!draftId) { setState('קודם לחצי “הכן ב-Brevo”'); return; }
    const c1 = lists?.account1?.count ?? 0;
    const c2 = lists?.account2?.count ?? 0;
    if (!window.confirm(`שליחה סופית לתלמידות בלבד.\nחשבון 1: ${c1}\nחשבון 2: ${c2}\n\nלשלוח עכשיו?`)) return;
    setState('מסנכרנת שוב את רשימת התלמידות לפני השליחה הסופית…');
    sendSync({ type: 'TOBY_STUDENTS_MAIL', action: 'send', draftId, confirmSend: true, subject, bodyHtml: currentBody });
  };

  const insertBlock = (html: string) => {
    const el = htmlRef.current;
    const at = el?.selectionStart ?? rawHtml.length;
    const next = rawHtml.slice(0, at) + (rawHtml ? '\n' : '') + html + '\n' + rawHtml.slice(at);
    setRawHtml(next);
    setDraftId('');
    setTimeout(() => {
      if (!el) return;
      el.focus();
      const pos = at + html.length + 2;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const insertEmoji = (emoji: string) => {
    if (mode === 'template') {
      setTpl((cur) => ({ ...cur, bodyText: cur.bodyText + emoji }));
    } else {
      const el = htmlRef.current;
      const at = el?.selectionStart ?? rawHtml.length;
      setRawHtml(rawHtml.slice(0, at) + emoji + rawHtml.slice(at));
    }
    setDraftId('');
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>שליחה לתפוצת תלמידות</span>
            <div className="flex flex-wrap gap-2 text-sm font-normal">
              <Button type="button" variant="outline" size="sm" onClick={() => postToBridge({ type: 'TOBY_STUDENTS_STATUS', draftId: draftId || null })}>
                <ExternalLink className="h-4 w-4 ml-1" /> {bridgeReady ? 'מחובר לאתר' : 'חיבור מאובטח לאתר'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => sendSync()} disabled={busy}>
                <RefreshCw className={`h-4 w-4 ml-1 ${busy ? 'animate-spin' : ''}`} /> סנכרון תלמידות
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            המיילים נשלחים דרך Brevo של האתר, בלי שמפתחות Brevo נחשפים בפלטפורמה. הרשימה כוללת את כל התלמידות הפעילות ואת כתובות המייל הנוספות שלהן.
          </p>
          <div className="rounded-md border p-3 text-sm">
            רשימת “תלמידות” — חשבון 1: <b>{lists?.account1?.count ?? '—'}</b> · חשבון 2: <b>{lists?.account2?.count ?? '—'}</b>
            {syncResult && <div className="mt-1 text-muted-foreground">{syncResult}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex gap-2">
            <Button type="button" variant={mode === 'template' ? 'default' : 'outline'} size="sm" onClick={() => setMode('template')}>🎨 טמפלייט</Button>
            <Button type="button" variant={mode === 'html' ? 'default' : 'outline'} size="sm" onClick={() => setMode('html')}>&lt;/&gt; HTML חופשי</Button>
          </div>

          <div className="space-y-2">
            <Label>נושא המייל</Label>
            <Input value={subject} onChange={(e) => { setSubject(e.target.value); setDraftId(''); }} />
          </div>

          {mode === 'template' ? (
            <>
              <div className="space-y-2"><Label>כותרת ראשית</Label><Input value={tpl.headline} onChange={(e) => { setTpl({ ...tpl, headline: e.target.value }); setDraftId(''); }} /></div>
              <div className="space-y-2"><Label>תמונה — קישור (לא חובה)</Label><Input dir="ltr" value={tpl.imageUrl} onChange={(e) => { setTpl({ ...tpl, imageUrl: e.target.value }); setDraftId(''); }} /></div>
              <div className="space-y-2"><Label>תוכן — שורה ריקה = פסקה חדשה</Label><Textarea rows={9} value={tpl.bodyText} onChange={(e) => { setTpl({ ...tpl, bodyText: e.target.value }); setDraftId(''); }} /></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2"><Label>טקסט כפתור</Label><Input value={tpl.ctaText} onChange={(e) => { setTpl({ ...tpl, ctaText: e.target.value }); setDraftId(''); }} /></div>
                <div className="space-y-2"><Label>קישור הכפתור</Label><Input dir="ltr" value={tpl.ctaUrl} onChange={(e) => { setTpl({ ...tpl, ctaUrl: e.target.value }); setDraftId(''); }} /></div>
              </div>
              <div className="space-y-2"><Label>שורת סיום קטנה</Label><Input value={tpl.psLine} onChange={(e) => { setTpl({ ...tpl, psLine: e.target.value }); setDraftId(''); }} /></div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {TOBY_EMAIL_BLOCKS.map((block) => (
                  <Button key={block.id} type="button" variant="outline" size="sm" onClick={() => insertBlock(block.html)}>+ {block.label}</Button>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setShowEmoji((v) => !v)}>😊 אימוג'ים</Button>
              </div>
              {showEmoji && <div className="flex flex-wrap gap-1 rounded-md border p-2">{TOBY_EMOJIS.map((e) => <button type="button" key={e} className="text-xl p-1" onClick={() => insertEmoji(e)}>{e}</button>)}</div>}
              <div className="space-y-2"><Label>קוד HTML — גוף המייל</Label><Textarea ref={htmlRef} dir="ltr" rows={18} className="font-mono text-xs" value={rawHtml} onChange={(e) => { setRawHtml(e.target.value); setDraftId(''); }} /></div>
            </>
          )}

          {mode === 'template' && (
            <div className="flex flex-wrap gap-1 rounded-md border p-2">
              {TOBY_EMOJIS.slice(0, 20).map((e) => <button type="button" key={e} className="text-lg p-1" onClick={() => insertEmoji(e)}>{e}</button>)}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Label>תצוגה מקדימה — אותו טמפלייט של האתר</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setLight((v) => !v)}>{light ? '🌙 גרסה כהה' : '🌞 גרסה בהירה'}</Button>
          </div>
          <iframe title="תצוגה מקדימה של התפוצה" sandbox="" srcDoc={preview} className="w-full min-h-[520px] rounded-lg border" style={{ background: light ? '#E9DFC9' : '#0F0F12' }} />

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => runMailAction('test')} disabled={busy}>
              <TestTube2 className="h-4 w-4 ml-2" /> טסט אליי
            </Button>
            <Button type="button" variant="outline" onClick={() => runMailAction('prepare')} disabled={busy}>
              <MailCheck className="h-4 w-4 ml-2" /> הכן ב-Brevo
            </Button>
            <Button type="button" variant="outline" onClick={requestStatus} disabled={busy}>
              <RefreshCw className="h-4 w-4 ml-2" /> בדוק ב-Brevo
            </Button>
            <Button type="button" onClick={sendFinal} disabled={busy || !draftId}>
              <Send className="h-4 w-4 ml-2" /> שליחה סופית לתלמידות
            </Button>
          </div>

          {state && <div className="rounded-md border border-primary/30 bg-background/70 p-3 text-sm">{state}</div>}
          {draftId && <div className="text-xs text-muted-foreground" dir="ltr">draft: {draftId}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
