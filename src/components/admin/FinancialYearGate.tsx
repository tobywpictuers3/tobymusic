import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ensureSchoolYearRollover, getSchoolYearForDate } from '@/lib/schoolYear';
import { preparePriorYearSettlementRowsDurably } from '@/lib/priorYearSettlementFlow';

export default function FinancialYearGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'pending' | 'ready' | 'error'>('pending');
  const [errorCode, setErrorCode] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setState('pending');
    setErrorCode('');

    void (async () => {
      try {
        const currentSchoolYear = getSchoolYearForDate();
        const rollover = await ensureSchoolYearRollover();
        await preparePriorYearSettlementRowsDurably(currentSchoolYear, {
          forceSync: rollover.changed,
        });
        if (active) setState('ready');
      } catch (error) {
        if (!active) return;
        setErrorCode(error instanceof Error ? error.message : 'FINANCIAL_YEAR_GATE_FAILED');
        setState('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [retry]);

  if (state === 'ready') return <>{children}</>;

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-lg rounded-xl border bg-background p-6 text-center shadow-sm">
          <div className="font-semibold text-destructive">סגירת שנת הלימודים לא אומתה</div>
          <p className="mt-2 text-sm text-muted-foreground leading-6">
            מסך הניהול נשאר חסום כדי ששינוי במחיר או בתשלומי השנה החדשה לא ישנה בטעות את יתרת השנה הקודמת.
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
        <div className="mt-2 text-sm text-muted-foreground">הניהול ייפתח לאחר אימות יתרות השנה הקודמת.</div>
      </div>
    </div>
  );
}
