import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ensureSchoolYearRollover, getSchoolYearForDate } from '@/lib/schoolYear';
import { preparePriorYearSettlementRowsDurably } from '@/lib/priorYearSettlementFlow';

/**
 * Year-close is a task inside Payments, not an entry requirement.
 * Never hide the whole admin area when a Dropbox verification cannot complete:
 * that made it impossible to open the repair/settlement UI.
 * A visible warning preserves the unverified status; durability checks inside
 * the settlement mutation functions remain mandatory before claiming success.
 */
export default function FinancialYearGate({ children }: { children: ReactNode }) {
  const currentSchoolYear = getSchoolYearForDate();
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [errorCode, setErrorCode] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setState('checking');
    setErrorCode('');
    void (async () => {
      try {
        const rollover = await ensureSchoolYearRollover();
        const verification = await preparePriorYearSettlementRowsDurably(currentSchoolYear, { forceSync: rollover.changed });
        if (!verification.verified) throw new Error('PRIOR_YEAR_PREPARE_READBACK_MISMATCH');
        if (active) setState('ready');
      } catch (error) {
        if (!active) return;
        setErrorCode(error instanceof Error ? error.message : 'FINANCIAL_YEAR_GATE_FAILED');
        setState('error');
      }
    })();
    return () => { active = false; };
  }, [currentSchoolYear, retry]);

  return (
    <>
      {state !== 'ready' && (
        <div className="border-b border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" dir="rtl" role="status" data-year-close-status={state}>
          <strong>{state === 'checking' ? 'בודקת סגירת שנה ברקע' : 'סגירת השנה טרם אומתה'}</strong>
          <span className="mr-2">{state === 'checking'
            ? 'אפשר להמשיך לעבוד ולהיכנס לתשלומים > שנים קודמות וסגירת שנה.'
            : 'אפשר להיכנס לדוחות ולטפל בחריגים. אין לראות בשמירה כספית אישור עד שהמערכת מאמתת אותה מול Dropbox.'}</span>
          {state === 'error' && (
            <>
              <span className="mx-2 font-mono text-xs" dir="ltr">{errorCode}</span>
              <Button size="sm" variant="outline" onClick={() => setRetry(v => v + 1)}>בדיקה חוזרת</Button>
            </>
          )}
        </div>
      )}
      {children}
    </>
  );
}
