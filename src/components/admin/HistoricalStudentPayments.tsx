import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/safe-ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/safe-ui/table';
import { getPayments, getPerLessonPayments, getStudents } from '@/lib/storage';
import { getSchoolYearBounds, getSchoolYearForDate, getSchoolYearLabel, getStudentSchoolYearRecords } from '@/lib/schoolYear';
import type { Payment } from '@/lib/types';

const money = (value: number) => `₪${Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

const statusLabel = (status: Payment['status']) => {
  if (status === 'paid') return 'שולם';
  if (status === 'pending') return 'ממתין';
  if (status === 'debt') return 'חוב';
  return 'לא שולם';
};

const methodLabel = (method: Payment['paymentMethod']) => {
  if (method === 'bank') return 'העברה בנקאית';
  if (method === 'check') return 'צ׳ק';
  if (method === 'cash') return 'מזומן';
  return 'לא פעיל';
};

export default function HistoricalStudentPayments() {
  const currentSchoolYear = getSchoolYearForDate();
  const students = getStudents();
  const studentNames = new Map(students.map(student => [student.id, `${student.firstName} ${student.lastName}`.trim()]));

  const availableYears = useMemo(() => {
    const years = new Set<number>();

    getStudentSchoolYearRecords()
      .filter(record => record.status === 'closed' && record.schoolYear < currentSchoolYear)
      .forEach(record => years.add(record.schoolYear));

    getPayments().forEach(payment => {
      const year = getSchoolYearForDate(`${payment.month}-01`);
      if (year < currentSchoolYear) years.add(year);
    });

    getPerLessonPayments().forEach(payment => {
      const year = getSchoolYearForDate(payment.paymentDate);
      if (year < currentSchoolYear) years.add(year);
    });

    return Array.from(years).sort((a, b) => b - a);
  }, [currentSchoolYear]);

  const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] || currentSchoolYear - 1);
  const effectiveYear = availableYears.includes(selectedYear) ? selectedYear : (availableYears[0] || selectedYear);
  const bounds = getSchoolYearBounds(effectiveYear);
  const startMonth = bounds.start.slice(0, 7);
  const endMonth = bounds.end.slice(0, 7);

  const annualRows = getPayments()
    .filter(payment => payment.month >= startMonth && payment.month <= endMonth)
    .slice()
    .sort((a, b) => (b.paidDate || `${b.month}-01`).localeCompare(a.paidDate || `${a.month}-01`));

  const perLessonRows = getPerLessonPayments()
    .filter(payment => payment.paymentDate >= bounds.start && payment.paymentDate <= bounds.end)
    .slice()
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  if (availableYears.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>ארכיון תשלומי תלמידות</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">עדיין אין שנות לימודים קודמות עם תשלומים להצגה.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>ארכיון תשלומי תלמידות</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">תצוגה לקריאה בלבד. התשלומים נשארים בשנה המקורית ואינם מועתקים לשנה הנוכחית.</p>
          </div>
          <Select value={String(effectiveYear)} onValueChange={value => setSelectedYear(Number(value))}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={String(year)}>שנה״ל {getSchoolYearLabel(year)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="font-semibold">תשלומים שנתיים / חודשיים</div>
          <div className="rounded-lg border overflow-auto max-h-[52vh]" dir="rtl">
            <Table className="min-w-[920px]">
              <TableHeader>
                <TableRow>
                  <TableHead>תלמידה</TableHead>
                  <TableHead>חודש</TableHead>
                  <TableHead>סכום</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>אמצעי תשלום</TableHead>
                  <TableHead>תאריך תשלום</TableHead>
                  <TableHead>הערות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {annualRows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">אין תשלומים במסלול שנתי בשנה זו</TableCell></TableRow>
                ) : annualRows.map(payment => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{studentNames.get(payment.studentId) || 'תלמידה לא פעילה / היסטורית'}</TableCell>
                    <TableCell>{payment.month}</TableCell>
                    <TableCell>{money(payment.amount)}</TableCell>
                    <TableCell>{statusLabel(payment.status)}</TableCell>
                    <TableCell>{methodLabel(payment.paymentMethod)}</TableCell>
                    <TableCell>{payment.paidDate || '—'}</TableCell>
                    <TableCell>{payment.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-2">
          <div className="font-semibold">תשלומים לפי שיעור</div>
          <div className="rounded-lg border overflow-auto max-h-[42vh]" dir="rtl">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>תלמידה</TableHead>
                  <TableHead>תאריך תשלום</TableHead>
                  <TableHead>סכום</TableHead>
                  <TableHead>שיעורים שכוסו</TableHead>
                  <TableHead>הערות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perLessonRows.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">אין תשלומים לפי שיעור בשנה זו</TableCell></TableRow>
                ) : perLessonRows.map(payment => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{studentNames.get(payment.studentId) || 'תלמידה לא פעילה / היסטורית'}</TableCell>
                    <TableCell>{payment.paymentDate}</TableCell>
                    <TableCell>{money(payment.amount)}</TableCell>
                    <TableCell>{Number(payment.lessonsCount || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>{payment.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
