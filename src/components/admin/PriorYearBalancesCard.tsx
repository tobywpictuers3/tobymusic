import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Input } from '@/components/safe-ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/safe-ui/table';
import { Button } from '@/components/ui/button';
import { getStudents } from '@/lib/storage';
import { getPriorYearBalanceRecords } from '@/lib/priorYearBalances';
import {
  editPriorYearBalanceDurably,
  settlePriorYearBalanceDurably,
  type ManagedPriorYearBalanceRecord,
} from '@/lib/priorYearSettlementFlow';
import { getSchoolYearLabel } from '@/lib/schoolYear';
import { toast } from '@/hooks/use-toast';

interface Props {
  selectedBaseYear: number;
}

const money = (value: number) =>
  `₪${Math.abs(Number(value || 0)).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

const todayInJerusalem = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const balanceText = (amount: number) => {
  if (amount > 0) return `+${money(amount)} זכות לתלמידה`;
  if (amount < 0) return `-${money(amount)} חוב של התלמידה`;
  return '₪0 מאוזן';
};

const statusText = (row: ManagedPriorYearBalanceRecord) => {
  if (row.requiresVerification) return 'נדרש אימות';
  if (row.signedBalance === 0) return 'מאוזן';
  if (!row.settled) return 'ממתין לטיפול';
  if (row.settlementMethod === 'lessons') return 'הועבר לשנה הבאה';
  return row.signedBalance > 0 ? 'הוחזר לתלמידה' : 'שולם על ידי התלמידה';
};

export default function PriorYearBalancesCard({ selectedBaseYear }: Props) {
  const targetSchoolYear = selectedBaseYear + 1;
  const sourceSchoolYear = targetSchoolYear - 1;
  const [rows, setRows] = useState<ManagedPriorYearBalanceRecord[]>([]);
  const [showBalanced, setShowBalanced] = useState(false);
  const [cashModeId, setCashModeId] = useState<string | null>(null);
  const [cashDates, setCashDates] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const students = getStudents();

  const reload = () => {
    setRows((getPriorYearBalanceRecords() as ManagedPriorYearBalanceRecord[])
      .filter(row => row.targetSchoolYear === targetSchoolYear));
  };

  useEffect(() => {
    reload();
    const imported = () => reload();
    window.addEventListener('toby:storage-imported', imported);
    return () => window.removeEventListener('toby:storage-imported', imported);
  }, [targetSchoolYear]);

  const actionable = useMemo(
    () => rows.filter(row => row.signedBalance !== 0 || row.requiresVerification),
    [rows],
  );
  const balancedCount = rows.length - actionable.length;
  const creditTotal = actionable
    .filter(row => !row.requiresVerification && row.signedBalance > 0)
    .reduce((sum, row) => sum + row.signedBalance, 0);
  const debtTotal = actionable
    .filter(row => !row.requiresVerification && row.signedBalance < 0)
    .reduce((sum, row) => sum + Math.abs(row.signedBalance), 0);
  const pendingCount = actionable.filter(row => !row.settled || row.requiresVerification).length;
  const visibleRows = showBalanced ? rows : actionable;

  const run = async (row: ManagedPriorYearBalanceRecord, fn: () => Promise<unknown>, success: string) => {
    setBusyId(row.id);
    try {
      await fn();
      reload();
      setCashModeId(null);
      toast({ title: '✅ נשמר ואומת', description: success });
    } catch (error) {
      toast({
        title: '⚠️ הפעולה לא אומתה בדרופבוקס',
        description: error instanceof Error ? error.message : 'נסי שוב',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const commitBalance = async (row: ManagedPriorYearBalanceRecord, rawValue: string) => {
    const amount = Number(rawValue);
    if (!Number.isFinite(amount)) {
      toast({ title: 'סכום לא תקין', description: 'יש להזין מספר חוקי', variant: 'destructive' });
      reload();
      return;
    }
    if (Math.abs(amount - row.signedBalance) < 0.005 && !row.requiresVerification) return;
    await run(
      row,
      () => editPriorYearBalanceDurably(row.id, amount),
      'הסכום עודכן והוחזר למצב ממתין לבחירת אופן הסגירה.',
    );
  };

  const openCash = (row: ManagedPriorYearBalanceRecord) => {
    setCashModeId(row.id);
    setCashDates(current => ({ ...current, [row.id]: current[row.id] || todayInJerusalem() }));
  };

  return (
    <Card className="mt-5 border-primary/30 shadow-sm" data-prior-year-balances>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">יתרות שנותרו משנת הלימודים {getSchoolYearLabel(sourceSchoolYear)}</CardTitle>
        <p className="text-sm text-muted-foreground leading-6">
          כאן מחליטים במפורש מה עושים בכל זכות או חוב. כסף נכנס לחישובים רק בתאריך הביצוע בפועל; העברה לשנה הבאה משפיעה על כרטסת השנה החדשה רק לאחר אישור שלך. שורות התשלום הישנות אינן מועברות.
        </p>
        <div className="grid gap-2 sm:grid-cols-4 text-sm">
          <div className="rounded-lg border p-2"><span className="text-muted-foreground">ממתינות:</span> <strong>{pendingCount}</strong></div>
          <div className="rounded-lg border p-2 bg-emerald-50/70 dark:bg-emerald-950/20"><span className="text-muted-foreground">זכויות:</span> <strong>{money(creditTotal)}</strong></div>
          <div className="rounded-lg border p-2 bg-rose-50/70 dark:bg-rose-950/20"><span className="text-muted-foreground">חובות:</span> <strong>{money(debtTotal)}</strong></div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowBalanced(value => !value)}>
            {showBalanced ? 'הסתרי מאוזנות' : `הציגי ${balancedCount} מאוזנות`}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-auto max-h-[62vh]" dir="rtl">
          <Table className="w-full min-w-[1220px] table-fixed">
            <TableHeader className="sticky top-0 z-20 bg-background/95">
              <TableRow>
                <TableHead className="text-right w-[180px]">תלמידה</TableHead>
                <TableHead className="text-right w-[105px]">מסלול</TableHead>
                <TableHead className="text-right w-[210px]">יתרת סגירה</TableHead>
                <TableHead className="text-right w-[170px]">פירוט מקור</TableHead>
                <TableHead className="text-right w-[150px]">מצב</TableHead>
                <TableHead className="text-right w-[310px]">פעולה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(row => {
                const student = students.find(item => item.id === row.studentId);
                const isCredit = row.signedBalance > 0;
                const isDebt = row.signedBalance < 0;
                const isBusy = busyId === row.id;
                const date = cashDates[row.id] || todayInJerusalem();

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold text-right">
                      {student ? `${student.firstName} ${student.lastName}`.trim() : 'תלמידה לא נמצאה'}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.paymentTrack === 'per_lesson' || student?.paymentType === 'per_lesson' ? 'לפי שיעור' : 'קבועה'}
                    </TableCell>
                    <TableCell className={isCredit
                      ? 'text-right bg-emerald-50 dark:bg-emerald-950/30'
                      : isDebt
                        ? 'text-right bg-rose-50 dark:bg-rose-950/30'
                        : 'text-right'}>
                      <div className="space-y-1">
                        <div className={isCredit
                          ? 'font-bold text-emerald-700 dark:text-emerald-300'
                          : isDebt
                            ? 'font-bold text-rose-700 dark:text-rose-300'
                            : 'text-muted-foreground'}>
                          {balanceText(row.signedBalance)}
                        </div>
                        <Input
                          key={`${row.id}:${row.updatedAt}`}
                          type="number"
                          step="0.01"
                          defaultValue={row.signedBalance}
                          aria-label="סכום חוב או זכות"
                          disabled={isBusy}
                          onBlur={event => void commitBalance(row, event.currentTarget.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                          className="h-8"
                        />
                        {row.requiresVerification && (
                          <div className="text-xs text-amber-700 dark:text-amber-300">נדרש אימות ידני של הסכום לפני סגירה.</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground leading-5">
                      {row.sourceTotalDue !== undefined && <div>נדרש: {money(row.sourceTotalDue)}</div>}
                      {row.sourceTotalPaid !== undefined && <div>שולם: {money(row.sourceTotalPaid)}</div>}
                      {row.sourceLessonPrice !== undefined && <div>מחיר שיעור: {money(row.sourceLessonPrice)}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium">{statusText(row)}</div>
                      {row.settled && row.settlementMethod === 'cash' && row.settlementDate && (
                        <div className="text-xs text-muted-foreground mt-1">{row.settlementDate}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.signedBalance === 0 && !row.requiresVerification ? (
                        <span className="text-sm text-muted-foreground">אין פעולה נדרשת</span>
                      ) : row.settled ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => void run(row, () => settlePriorYearBalanceDurably(row.id, 'reopen'), 'היתרה נפתחה מחדש לטיפול.')}
                        >
                          פתחי מחדש
                        </Button>
                      ) : row.requiresVerification ? (
                        <span className="text-sm text-amber-700 dark:text-amber-300">תקני/אשרי קודם את הסכום בעמודת היתרה</span>
                      ) : cashModeId === row.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            type="date"
                            className="h-9 w-[150px]"
                            value={date}
                            disabled={isBusy}
                            onChange={event => setCashDates(current => ({ ...current, [row.id]: event.target.value }))}
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={isBusy || !date}
                            onClick={() => void run(
                              row,
                              () => settlePriorYearBalanceDurably(row.id, 'cash', date),
                              isCredit ? `ההחזר נרשם בתאריך ${date}.` : `התשלום נרשם בתאריך ${date}.`,
                            )}
                          >
                            {isCredit ? 'סמני שהוחזר' : 'סמני ששולם'}
                          </Button>
                          <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={() => setCashModeId(null)}>ביטול</Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => openCash(row)}>
                            סגירה בכסף
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void run(
                              row,
                              () => settlePriorYearBalanceDurably(row.id, 'lessons'),
                              'היתרה הועברה לכרטסת השנה הבאה בלי להעתיק שורות תשלום ישנות.',
                            )}
                          >
                            העברה לשנה הבאה
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibleRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    אין יתרות פתוחות לטיפול משנה זו
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
