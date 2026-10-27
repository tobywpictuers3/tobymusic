import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ensureSchoolYearRollover, getSchoolYearForDate } from '@/lib/schoolYear';
import { preparePriorYearSettlementRowsDurably } from '@/lib/priorYearSettlementFlow';

const verifiedKey = (year: number) => `toby_year_close_verified_${year}`;

/**
 * Blocks the admin only until the rollover for the current school year has been
 * verified once on this device. After that, normal entry is not blocked; the
 * same idempotent check runs in the background and a failure is shown as a
 * banner (reports/closing live under Payments › prior years).
 */
export default function FinancialYearGate({ children }: { children: ReactNode }) {
  const currentSchoolYear = getSchoolYearForDate();
  const alreadyVerified = (() => {
    try { return localStorage.getItem(verifiedKey(currentSchoolYear)) === '1'; } catch { return false; }
  })();
  const [state, setState] = useState<'pending' | 'ready' | 'error'>(alreadyVerified ? 'ready' : 'pending');
  const [errorCode, setErrorCode] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    if (!alreadyVerified) setState('pending');
    setErrorCode('');

    void (async () => {
      try {
        const rollover = await ensureSchoolYearRollover();
        await preparePriorYearSettlementRowsDurably(currentSchoolYear, { forceSync: rollover.changed });
        try { localStorage.setItem(verifiedKey(currentSchoolYear), '1'); } catch { /* ignore */ }
        if (active) setState('ready');
      } catch (error) {
        if (!active) return;
        setErrorCode(error instanceof Error ? error.message : 'FINANCIAL_YEAR_GATE_FAILED');
        // Critical guard: block only when this year's close was never verified.
        if (!alreadyVerified) setState('error');
      }
    })();

    return () => { active = false; };
  }, [retry]);

  if (state === 'ready') {
    return (
      <>
        {errorCode && (
          <div className="border-b bg-destructive/10 px-3 py-2 text-sm text-destructive" dir="rtl">
            בדיקת סגירת השנה ברקע לא אומתה ({errorCode}). יש לבדוק בתשלומים › שנים קודמות וסגירת שנה.
            <Button size="sm" variant="outline" className="mr-2" onClick={() => setRetry(v => v + 1)}>בדיקה חוזרת</Button>
          </div>
        )}
        {children}
      </>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-lg rounded-xl border bg-background p-6 text-center shadow-sm">
          <div className="font-semibold text-destructive">סגירת שנת הלימודים לא אומתה</div>
          <p className="mt-2 text-sm text-muted-foreground leading-6">
            מסך הניהול נשאר חסום עד אימות ראשון של סגירת השנה, כדי ששינוי במחיר או בתשלומי השנה החדשה לא ישנה בטעות את יתרת השנה הקודמת.
          </p>
          <div className="mt-2 text-xs font-mono" dir="ltr">{errorCode}</div>
          <Button className="mt-4" onClick={() => setRetry(value => value + 1)}>נסי שוב</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
      <div className="rounded-xl border bg-background p-6 text-center shadow-sm">
        <div className="font-semibold">מכינה את סגירת שנת הלימודים…</div>
        <div className="mt-2 text-sm text-muted-foreground">אימות חד-פעמי לשנה זו; כניסות הבאות לא ייחסמו.</div>
      </div>
    </div>
  );
}
