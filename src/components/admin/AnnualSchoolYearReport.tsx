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
  getStudentSchoolYearRecords,
  isYearEndReportAvailable,
} from '@/lib/schoolYear';

const money = (value: number) => `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

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
  const rows = students.map(student => ({
    student,
    snapshot: calculateStudentYearSnapshot(student, selectedYear),
  }));

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
              {rows.map(({ student, snapshot }) => (
                <TableRow key={student.id}>
                  <TableCell className="font-semibold">{student.firstName} {student.lastName}</TableCell>
                  <TableCell>{snapshot.expectedLessons}</TableCell>
                  <TableCell>{snapshot.completedLessons}</TableCell>
                  <TableCell>{snapshot.bankMinutesThisYear > 0 ? '+' : ''}{snapshot.bankMinutesThisYear} דק׳</TableCell>
                  <TableCell>{formatLessonSixths(snapshot.effectiveSixths)}</TableCell>
                  <TableCell>{money(snapshot.baseTarget)}</TableCell>
                  <TableCell className={snapshot.yearEndAdjustment < 0 ? 'text-destructive' : ''}>
                    {snapshot.yearEndAdjustment < 0 ? `-${money(Math.abs(snapshot.yearEndAdjustment))}` : '—'}
                  </TableCell>
                  <TableCell>{money(snapshot.finalTarget)}</TableCell>
                  <TableCell>{money(snapshot.paidTotal)}</TableCell>
                  <TableCell className={snapshot.closingFinancialBalance > 0 ? 'text-green-700 dark:text-green-400' : snapshot.closingFinancialBalance < 0 ? 'text-destructive' : ''}>
                    {snapshot.closingFinancialBalance > 0
                      ? `זכות ${money(snapshot.closingFinancialBalance)}`
                      : snapshot.closingFinancialBalance < 0
                        ? `לתשלום ${money(Math.abs(snapshot.closingFinancialBalance))}`
                        : 'מאוזן'}
                  </TableCell>
                  <TableCell>
                    {snapshot.excessSixths > 0
                      ? `${snapshot.carryoverWholeLessons} שיעורים${snapshot.carryoverBankMinutes ? ` + ${snapshot.carryoverBankMinutes} דק׳` : ''}`
                      : snapshot.shortfallSixths > 0
                        ? `חסר ${formatLessonSixths(snapshot.shortfallSixths)} · קוזז כספית`
                        : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
