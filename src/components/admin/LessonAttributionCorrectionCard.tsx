import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  AYALA_ALPHA_CORRECTION,
  applyLessonAttributionDurably,
  previewLessonAttribution,
} from '@/lib/lessonAttributionCorrection';

/** Preview-first, explicit, idempotent lesson re-attribution. Payments are never changed. */
export default function LessonAttributionCorrectionCard() {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const plan = previewLessonAttribution(AYALA_ALPHA_CORRECTION);
  void revision;

  const apply = async () => {
    if (!window.confirm(`לשייך ${plan.pendingCount} שיעורים לחוזה תשפ"ז בכרטיס הפעיל? התאריך המקורי נשמר, תשלומים לא ישתנו.`)) return;
    setBusy(true);
    try {
      const result = await applyLessonAttributionDurably(AYALA_ALPHA_CORRECTION);
      toast({ description: result.changed ? 'התיקון הוחל ונשמר' : 'התיקון כבר הוחל בעבר — לא בוצע שינוי' });
    } catch (error) {
      toast({ title: 'התיקון לא הוחל', description: error instanceof Error ? error.message : 'שגיאה', variant: 'destructive' });
    } finally {
      setBusy(false);
      setRevision(v => v + 1);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>תיקון חשבונאי: שיוך שיעורים לתשפ"ז (אילה אלפא)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm" dir="rtl">
        <ul className="space-y-1">
          {plan.items.map(item => (
            <li key={item.lessonId} className="font-mono text-xs" dir="ltr">
              {item.lessonId} · {item.date} · {item.action}
            </li>
          ))}
        </ul>
        {plan.exceptions.length > 0 && (
          <div className="rounded-md border border-destructive/40 p-2">
            <div className="font-semibold">דו"ח חריגים</div>
            {plan.exceptions.map(e => <div key={e} className="font-mono text-xs" dir="ltr">{e}</div>)}
          </div>
        )}
        <Button disabled={busy || !plan.canApply || plan.pendingCount === 0} onClick={apply}>
          {plan.pendingCount === 0 && plan.canApply ? 'הוחל / אין מה להחיל' : 'החלת התיקון'}
        </Button>
      </CardContent>
    </Card>
  );
}
