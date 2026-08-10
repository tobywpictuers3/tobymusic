import { Badge } from '@/components/safe-ui/badge';
import type { Student } from '@/lib/types';
import {
  calculateStudentYearSnapshot,
  formatLessonSixths,
  getSchoolYearForDate,
  getSchoolYearLabel,
  getSchoolYearStartReasonLabel,
  getStudentSchoolYearRecords,
  isYearEndReportAvailable,
  type StudentSchoolYearRecord,
  type StudentYearSnapshot,
} from '@/lib/schoolYear';

const money = (value: number | undefined) => `₪${Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

const balanceLabel = (balance: number) => {
  if (balance > 0.009) return { text: `זכות לתשלום ${money(balance)}`, className: 'text-green-700 dark:text-green-400' };
  if (balance < -0.009) return { text: `נותר לתשלום ${money(Math.abs(balance))}`, className: 'text-destructive' };
  return { text: 'מאוזן', className: 'text-muted-foreground' };
};

const YearDetails = ({ record }: { record: StudentYearSnapshot | StudentSchoolYearRecord }) => {
  const snapshot = record as StudentYearSnapshot;
  const shortfallSixths = snapshot.shortfallSixths || 0;
  const excessSixths = snapshot.excessSixths || 0;
  const balance = balanceLabel(snapshot.closingFinancialBalance || 0);
  return (
    <div className="space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
        <span>מיספור פתיחה: <b>#{record.startingLessonNumber}</b></span>
        <span>שיעורים לחיוב: <b>{record.expectedLessons}</b></span>
        <span>מחיר שנה מלאה: <b>{money(record.annualAmountFull)}</b></span>
        <span>יעד בסיס: <b>{money(record.baseTarget)}</b></span>
        {snapshot.completedLessons !== undefined && <span>שיעורים בפועל: <b>{snapshot.completedLessons}</b></span>}
        {snapshot.bankMinutesThisYear !== undefined && <span>בנק זמן השנה: <b>{snapshot.bankMinutesThisYear > 0 ? '+' : ''}{snapshot.bankMinutesThisYear} דק׳</b></span>}
        {snapshot.effectiveSixths !== undefined && <span>שיעורים אפקטיביים: <b>{formatLessonSixths(snapshot.effectiveSixths)}</b></span>}
        {snapshot.finalTarget !== undefined && <span>יעד סופי: <b>{money(snapshot.finalTarget)}</b></span>}
        {snapshot.paidTotal !== undefined && <span>שולם בפועל: <b>{money(snapshot.paidTotal)}</b></span>}
      </div>

      {(record.openingCarryoverLessons > 0 || record.openingCarryoverBankMinutes !== 0) && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50/60 p-2 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          ↪ העברה משנה קודמת: {record.openingCarryoverLessons > 0 ? `${record.openingCarryoverLessons} שיעורים` : ''}
          {record.openingCarryoverLessons > 0 && record.openingCarryoverBankMinutes !== 0 ? ' + ' : ''}
          {record.openingCarryoverBankMinutes !== 0 ? `${record.openingCarryoverBankMinutes} דקות בנק זמן` : ''}.
          המיספור המועבר אינו מפחית את 38 השיעורים לחיוב.
        </div>
      )}

      {Math.abs(record.openingFinancialBalance) > 0.009 && (
        <div className="rounded-md border p-2">
          יתרה כספית שהועברה משנה קודמת: <b className={record.openingFinancialBalance > 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'}>
            {record.openingFinancialBalance > 0 ? 'זכות ' : 'חוב '}{money(Math.abs(record.openingFinancialBalance))}
          </b>
        </div>
      )}

      {shortfallSixths > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
          חוב שיעורים: <b>{formatLessonSixths(shortfallSixths)} שיעורים</b> · שווי <b>{money(snapshot.lessonDebtValue)}</b>.
          הסכום הופחת אוטומטית מיעד השנה.
        </div>
      )}

      {excessSixths > 0 && (
        <div className="rounded-md border border-green-600/30 bg-green-50/60 p-2 dark:bg-green-950/20">
          זכות שיעורים לשנה הבאה: <b>{snapshot.carryoverWholeLessons || 0} שיעורים</b>
          {(snapshot.carryoverBankMinutes || 0) !== 0 ? ` + ${snapshot.carryoverBankMinutes} דקות` : ''}.
        </div>
      )}

      {snapshot.closingFinancialBalance !== undefined && (
        <div className={`font-semibold ${balance.className}`}>{balance.text}</div>
      )}

      {snapshot.payments?.length > 0 && (
        <details className="rounded-md border p-2">
          <summary className="cursor-pointer font-medium">דו״ח תשלומים ספטמבר–אוגוסט</summary>
          <div className="mt-2 grid gap-1">
            {snapshot.payments.map(payment => (
              <div key={payment.id} className="flex flex-wrap justify-between gap-2 border-b border-border/50 py-1 last:border-0">
                <span>{payment.month}</span>
                <span>{money(payment.amount)}</span>
                <span>{payment.status === 'paid' ? 'שולם' : payment.status === 'pending' ? 'ממתין' : payment.status === 'debt' ? 'חוב' : 'לא שולם'}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default function StudentSchoolYearSummary({ student }: { student: Student }) {
  if (student.paymentType === 'per_lesson') return null;

  const currentYear = getSchoolYearForDate();
  const currentSnapshot = calculateStudentYearSnapshot(student, currentYear);
  const reportAvailable = isYearEndReportAvailable(currentYear);
  const archives = getStudentSchoolYearRecords(student.id).filter(record => record.status === 'closed');

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-primary/20 bg-background/70 p-3 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">כרטסת שנת לימודים {getSchoolYearLabel(currentYear)}</div>
        <Badge variant="outline">{getSchoolYearStartReasonLabel(currentSnapshot.startReason)}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-1 text-xs">
        <span>מיספור פתיחה: <b>#{currentSnapshot.startingLessonNumber}</b></span>
        <span>שיעורים לחיוב: <b>{currentSnapshot.expectedLessons}</b></span>
        <span>מחיר שנה מלאה: <b>{money(currentSnapshot.annualAmountFull)}</b></span>
        <span>יעד בסיס: <b>{money(currentSnapshot.baseTarget)}</b></span>
      </div>

      {(currentSnapshot.openingCarryoverLessons > 0 || currentSnapshot.openingCarryoverBankMinutes !== 0) && (
        <div className="rounded-md bg-amber-100/70 p-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          ↪ קיימת העברה משנה קודמת — המיספור מתחיל ב־#{currentSnapshot.startingLessonNumber}, אך החיוב נשאר עבור {currentSnapshot.expectedLessons} שיעורים.
        </div>
      )}

      {reportAvailable ? (
        <details className="rounded-md border p-2" open={new Date().toISOString().slice(5, 10) === '08-31'}>
          <summary className="cursor-pointer font-semibold">דו״ח שנתי {currentYear}</summary>
          <div className="mt-2"><YearDetails record={currentSnapshot} /></div>
        </details>
      ) : (
        <div className="text-xs text-muted-foreground">דו״ח סוף שנה {currentYear} ייפתח אוטומטית ב־31 באוגוסט.</div>
      )}

      {archives.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <div className="text-xs font-semibold">ארכיון</div>
          {archives.map(record => (
            <details key={record.id} className="rounded-md border p-2">
              <summary className="cursor-pointer font-semibold">{record.schoolYear}</summary>
              <div className="mt-2"><YearDetails record={record} /></div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
