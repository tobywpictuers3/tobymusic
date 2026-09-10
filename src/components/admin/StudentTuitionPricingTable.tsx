import { useState } from 'react';
import { Button } from '@/components/safe-ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/safe-ui/table';
import { Badge } from '@/components/safe-ui/badge';
import { getStudents, updateStudent } from '@/lib/storage';
import {
  calculateBaseAnnualTarget,
  getSchoolYearForDate,
  getSchoolYearLabel,
  getStudentSchoolYearRecord,
  upsertStudentSchoolYearTerms,
  type SchoolYearStartReason,
} from '@/lib/schoolYear';
import {
  calculateCohortAnnualRate,
  getCohortDiscountPercent,
  getCohortSchoolYear,
  getTuitionSettings,
} from '@/lib/tuitionSettings';
import { toast } from '@/hooks/use-toast';

const money = (value: number) => `₪${Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export default function StudentTuitionPricingTable() {
  const [revision, setRevision] = useState(0);
  const settings = getTuitionSettings();
  const students = getStudents().filter(student => student.paymentType !== 'per_lesson');
  const currentSchoolYear = getSchoolYearForDate();

  const rows = students.map(student => {
    const cohortSchoolYear = getCohortSchoolYear(student.startDate);
    const cohortDiscount = getCohortDiscountPercent(settings, student.startDate);
    const calculatedAnnualRate = calculateCohortAnnualRate(settings, student.startDate);
    const currentRecord = getStudentSchoolYearRecord(student.id, currentSchoolYear);
    const startingLessonNumber = currentRecord?.startingLessonNumber || student.startingLessonNumber || 1;
    const startReason: SchoolYearStartReason = currentRecord?.startReason || (startingLessonNumber > 1 ? 'midyear_join' : 'regular');
    const baseTarget = calculateBaseAnnualTarget(calculatedAnnualRate, startingLessonNumber, startReason);
    const openingBalance = currentRecord?.openingFinancialBalance || 0;
    const currentYearTarget = roundMoney(Math.max(0, baseTarget - openingBalance));
    const storedFullAnnual = Number(currentRecord?.annualAmountFull ?? student.annualAmount ?? 0);
    const isDifferent = Math.abs(storedFullAnnual - calculatedAnnualRate) > 0.009;

    return {
      student,
      cohortSchoolYear,
      cohortDiscount,
      calculatedAnnualRate,
      currentRecord,
      startReason,
      startingLessonNumber,
      currentYearTarget,
      storedFullAnnual,
      isDifferent,
    };
  });

  const applyCalculatedPrice = (row: (typeof rows)[number]) => {
    const { student, currentRecord, startReason, startingLessonNumber, calculatedAnnualRate, currentYearTarget } = row;
    try {
      const calculatedAmount = Math.abs(currentYearTarget - calculatedAnnualRate) > 0.009
        ? currentYearTarget
        : undefined;
      const paymentMonths = Math.max(1, Number(student.paymentMonths || 12));

      updateStudent(student.id, {
        annualAmount: calculatedAnnualRate,
        calculatedAmount,
        monthlyAmount: roundMoney(currentYearTarget / paymentMonths),
        annualDiscountEnabled: false,
        annualDiscountPercent: 0,
        annualRateManuallyOverridden: false,
      } as any);

      upsertStudentSchoolYearTerms(student.id, currentSchoolYear, {
        startReason,
        startingLessonNumber,
        annualAmountFull: calculatedAnnualRate,
        openingFinancialBalance: currentRecord?.openingFinancialBalance || 0,
        openingCarryoverLessons: currentRecord?.openingCarryoverLessons || 0,
        openingCarryoverBankMinutes: currentRecord?.openingCarryoverBankMinutes || 0,
        source: currentRecord?.source || 'manual',
      });

      setRevision(value => value + 1);
      toast({
        title: 'המחיר עודכן',
        description: `${student.firstName} ${student.lastName}: המחיר השנתי הוגדר ל־${money(calculatedAnnualRate)} לפי שנת ההתחלה.`,
      });
    } catch (error) {
      toast({
        title: 'לא ניתן לעדכן את המחיר',
        description: error instanceof Error && error.message === 'closed_school_year_requires_correction'
          ? 'שנה סגורה אינה ניתנת לשינוי דרך מסך התמחור.'
          : 'השינוי לא הושלם. נדרש אימות.',
        variant: 'destructive',
      });
    }
  };

  void revision;

  return (
    <Card>
      <CardHeader>
        <CardTitle>מחיר מחושב לכל תלמידה</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          החישוב משתמש בתאריך ההתחלה שכבר נשמר בכרטיס התלמידה. המחיר המלא נקבע לפי קבוצת הוותק; במקרה של הצטרפות באמצע השנה, יעד השנה ממשיך להיות יחסי לפי מנגנון 38 השיעורים הקיים.
        </p>
        <div className="rounded-lg border overflow-auto max-h-[62vh]" dir="rtl">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow>
                <TableHead>תלמידה</TableHead>
                <TableHead>תאריך התחלה</TableHead>
                <TableHead>שנת התחלה</TableHead>
                <TableHead>הנחת ותק</TableHead>
                <TableHead>מחיר שנתי מחושב</TableHead>
                <TableHead>מחיר שנתי שמור</TableHead>
                <TableHead>יעד השנה הנוכחית</TableHead>
                <TableHead>פעולה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={`${row.student.id}-${revision}`}>
                  <TableCell className="font-semibold">{row.student.firstName} {row.student.lastName}</TableCell>
                  <TableCell>{row.student.startDate || 'לא הוגדר'}</TableCell>
                  <TableCell>{row.cohortSchoolYear ? getSchoolYearLabel(row.cohortSchoolYear) : 'לא ידוע'}</TableCell>
                  <TableCell>{row.cohortDiscount}%</TableCell>
                  <TableCell className="font-semibold">{money(row.calculatedAnnualRate)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{money(row.storedFullAnnual)}</span>
                      {row.isDifferent ? <Badge variant="outline">שונה</Badge> : <Badge variant="secondary">תואם</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{money(row.currentYearTarget)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={row.isDifferent ? 'default' : 'outline'}
                      disabled={!row.isDifferent}
                      onClick={() => applyCalculatedPrice(row)}
                    >
                      {row.isDifferent ? 'החל מחיר מחושב' : 'מעודכן'}
                    </Button>
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
