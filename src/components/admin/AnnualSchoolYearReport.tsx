import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/safe-ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/safe-ui/table';
import { getStudents } from '@/lib/storage';
import {
  calculateStudentYearSnapshot,
  ensureSchoolYearRollover,
  formatLessonSixths,
  getSchoolYearForDate,
  getStudentSchoolYearRecord,
  getStudentSchoolYearRecords,
  isYearEndReportAvailable,
  type StudentYearSnapshot,
} from '@/lib/schoolYear';

const money = (value: number) => `₪${Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

export default function AnnualSchoolYearReport() {
  const [revision, setRevision] = useState(0);
  const currentYear = getSchoolYearForDate();

  useEffect(() => {
    void ensureSchoolYearRollover().finally(() => setRevision(value => value + 1));
  }, []);

  const availableYears = useMemo(() => {
    const closed = getStudentSchoolYearRecords()
      .filter(record => record.status === 'closed')
      .map(record => record.schoolYear);
    if (isYearEndReportAvailable(currentYear)) closed.push(currentYear);
    return Array.from(new Set(closed)).sort((a, b) => b - a);
  }, [currentYear, revision]);

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (isYearEndReportAvailable(currentYear)) return currentYear;
    const closed = getStudentSchoolYearRecords().filter(record => record.status === 'closed');
    return closed.sort((a, b) => b.schoolYear - a.schoolYear)[0]?.schoolYear || currentYear;
  });

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  if (availableYears.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader><CardTitle>דו״ח סוף שנת לימודים</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          דו״ח שנת {currentYear} יהיה זמין אוטומטית ב־31 באוגוסט. ב־1 בספטמבר הוא יינעל בארכיון ויתרת שיעורים/בנק זמן/תשלום תועבר לשנה החדשה.
        </CardContent>
      </Card>
    );
  }

  const students = getStudents().filter(student => student.paymentType !== 'per_lesson');
  const rows = students.map(student => {
    const stored = getStudentSchoolYearRecord(student.id, selectedYear);
    const snapshot = stored?.status === 'closed' && stored.completedLessons !== undefined
      ? stored as StudentYearSnapshot
      : calculateStudentYearSnapshot(student, selectedYear);
    return { student, snapshot };
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>דו״ח שנתי — שיעורים ותשלומים</CardTitle>
          <Select value={String(selectedYear)} onValueChange={value => setSelectedYear(Number(value))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[1250px]">
            <TableHeader>
              <TableRow>
                <TableHead>תלמידה</TableHead>
                <TableHead>לחיוב</TableHead>
                <TableHead>בוצעו</TableHead>
                <TableHead>בנק זמן</TableHead>
                <TableHead>אפקטיבי</TableHead>
                <TableHead>יעד בסיס</TableHead>
                <TableHead>הפחתת סוף שנה</TableHead>
                <TableHead>יעד סופי</TableHead>
                <TableHead>שולם</TableHead>
                <TableHead>חוב / זכות כספית</TableHead>
                <TableHead>העברה לשנה הבאה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ student, snapshot }) => {
                const completedLessons = Number(snapshot.completedLessons || 0);
                const bankMinutes = Number(snapshot.bankMinutesThisYear || 0);
                const effectiveSixths = Number(snapshot.effectiveSixths || 0);
                const adjustment = Number(snapshot.yearEndAdjustment || 0);
                const finalTarget = Number(snapshot.finalTarget || 0);
                const paidTotal = Number(snapshot.paidTotal || 0);
                const financialBalance = Number(snapshot.closingFinancialBalance || 0);
                const excessSixths = Number(snapshot.excessSixths || 0);
                const shortfallSixths = Number(snapshot.shortfallSixths || 0);
                return (
                  <TableRow key={student.id}>
                    <TableCell className="font-semibold">{student.firstName} {student.lastName}</TableCell>
                    <TableCell>{snapshot.expectedLessons}</TableCell>
                    <TableCell>{completedLessons}</TableCell>
                    <TableCell>{bankMinutes > 0 ? '+' : ''}{bankMinutes} דק׳</TableCell>
                    <TableCell>{formatLessonSixths(effectiveSixths)}</TableCell>
                    <TableCell>{money(snapshot.baseTarget)}</TableCell>
                    <TableCell className={adjustment < 0 ? 'text-destructive' : ''}>
                      {adjustment < 0 ? `-${money(Math.abs(adjustment))}` : '—'}
                    </TableCell>
                    <TableCell>{money(finalTarget)}</TableCell>
                    <TableCell>{money(paidTotal)}</TableCell>
                    <TableCell className={financialBalance > 0 ? 'text-green-700 dark:text-green-400' : financialBalance < 0 ? 'text-destructive' : ''}>
                      {financialBalance > 0
                        ? `זכות ${money(financialBalance)}`
                        : financialBalance < 0
                          ? `לתשלום ${money(Math.abs(financialBalance))}`
                          : 'מאוזן'}
                    </TableCell>
                    <TableCell>
                      {excessSixths > 0
                        ? `${snapshot.carryoverWholeLessons || 0} שיעורים${snapshot.carryoverBankMinutes ? ` + ${snapshot.carryoverBankMinutes} דק׳` : ''}`
                        : shortfallSixths > 0
                          ? `חסר ${formatLessonSixths(shortfallSixths)} · קוזז כספית`
                          : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
