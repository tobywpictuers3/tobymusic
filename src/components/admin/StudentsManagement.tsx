import { useDateMode } from '@/contexts/DateModeContext';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Button } from '@/components/safe-ui/button';
import { Input } from '@/components/safe-ui/input';
import { Textarea } from '@/components/safe-ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/safe-ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/safe-ui/dialog';
import { Label } from '@/components/safe-ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/safe-ui/select';
import { Badge } from '@/components/safe-ui/badge';
import { Grid, List, UserPlus, Edit, Trash2, Users, History, Coins, DoorOpen, Percent } from 'lucide-react';
import { NumberStepper } from '@/components/ui/number-stepper';
import { getStudents, addStudent, updateStudent, deleteStudentCascade, getCompletedLessonsCount, convertAnnualToPerLesson, getPayments } from '@/lib/storage';
import { deleteMessagesForStudentCascade } from '@/lib/messages';
import { Student } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import StudentLessonHistory from './StudentLessonHistory';
import StudentSchoolYearSummary from './StudentSchoolYearSummary';
import TuitionSettingsCard from './TuitionSettingsCard';
import { calculateDiscountedAnnualRate, getTuitionSettings, type TuitionSettings } from '@/lib/tuitionSettings';
import {
  calculateBaseAnnualTarget,
  ensureSchoolYearRollover,
  getBillingLessonCount,
  getSchoolYearBounds,
  getSchoolYearForDate,
  getSchoolYearStartReasonLabel,
  getStudentSchoolYearRecord,
  upsertStudentSchoolYearTerms,
  type SchoolYearStartReason,
} from '@/lib/schoolYear';

const DEFAULT_SCHOOL_YEAR = getSchoolYearForDate();
const DEFAULT_START_DATE = getSchoolYearBounds(DEFAULT_SCHOOL_YEAR).start;
const money = (value: number) => `₪${Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

type StudentPricingFields = {
  annualDiscountEnabled: boolean;
  annualDiscountPercent: number;
  annualRateManuallyOverridden: boolean;
  lessonRateManuallyOverridden: boolean;
};

type StudentForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  personalCode: string;
  startDate: string;
  startingLessonNumber: number;
  annualAmount: number;
  paymentMonths: number;
  notes: string;
  additionalPhones: string[];
  additionalEmails: string[];
  paymentType: 'annual' | 'per_lesson';
  lessonPrice: number;
} & StudentPricingFields;

const createDefaultForm = (settings: TuitionSettings): StudentForm => ({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  personalCode: '',
  startDate: getSchoolYearBounds(getSchoolYearForDate()).start,
  startingLessonNumber: 1,
  annualAmount: settings.annualRate,
  paymentMonths: 12,
  notes: '',
  additionalPhones: [],
  additionalEmails: [],
  paymentType: 'annual',
  lessonPrice: settings.lessonRate,
  annualDiscountEnabled: false,
  annualDiscountPercent: 0,
  annualRateManuallyOverridden: false,
  lessonRateManuallyOverridden: false,
});

const StudentsManagement = () => {
  const { formatDate } = useDateMode();
  const [students, setStudents] = useState<Student[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showDialog, setShowDialog] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [tuitionSettings, setTuitionSettings] = useState<TuitionSettings>(() => getTuitionSettings());
  const [studentForm, setStudentForm] = useState<StudentForm>(() => createDefaultForm(getTuitionSettings()));

  const refreshStudents = () => setStudents(getStudents());

  useEffect(() => {
    void ensureSchoolYearRollover().finally(refreshStudents);
  }, []);

  const resetForm = (settings: TuitionSettings = getTuitionSettings()) => {
    setStudentForm(createDefaultForm(settings));
  };

  const handleTuitionSettingsSaved = (settings: TuitionSettings) => {
    setTuitionSettings(settings);
    if (!editingStudent) {
      setStudentForm(current => ({
        ...current,
        annualAmount: current.annualRateManuallyOverridden
          ? current.annualAmount
          : calculateDiscountedAnnualRate(settings.annualRate, current.annualDiscountEnabled ? current.annualDiscountPercent : 0),
        lessonPrice: current.lessonRateManuallyOverridden ? current.lessonPrice : settings.lessonRate,
      }));
    }
  };

  const handleOpenDialog = () => {
    setEditingStudent(null);
    resetForm(tuitionSettings);
    setShowDialog(true);
  };

  const handleEditStudent = (student: Student) => {
    const pricing = student as Student & Partial<StudentPricingFields>;
    // Legacy students intentionally keep their existing rates. They are treated
    // as explicit overrides until the manager chooses "use generic rate".
    const annualDiscountEnabled = pricing.annualDiscountEnabled === true;
    const annualDiscountPercent = Math.min(100, Math.max(0, Number(pricing.annualDiscountPercent || 0)));
    const annualRateManuallyOverridden = pricing.annualRateManuallyOverridden ?? true;
    const lessonRateManuallyOverridden = pricing.lessonRateManuallyOverridden ?? true;

    setEditingStudent(student);
    setStudentForm({
      firstName: student.firstName,
      lastName: student.lastName,
      phone: student.phone,
      email: student.email,
      personalCode: student.personalCode,
      startDate: student.startDate,
      startingLessonNumber: student.startingLessonNumber,
      annualAmount: student.annualAmount,
      paymentMonths: student.paymentMonths,
      notes: student.notes || '',
      additionalPhones: student.additionalPhones || [],
      additionalEmails: student.additionalEmails || [],
      paymentType: student.paymentType || 'annual',
      lessonPrice: student.lessonPrice || tuitionSettings.lessonRate,
      annualDiscountEnabled,
      annualDiscountPercent,
      annualRateManuallyOverridden,
      lessonRateManuallyOverridden,
    });
    setShowDialog(true);
  };

  const setDiscountEnabled = (enabled: boolean) => {
    setStudentForm(current => {
      const discountPercent = enabled ? current.annualDiscountPercent : 0;
      return {
        ...current,
        annualDiscountEnabled: enabled,
        annualDiscountPercent: discountPercent,
        annualAmount: current.annualRateManuallyOverridden
          ? current.annualAmount
          : calculateDiscountedAnnualRate(tuitionSettings.annualRate, discountPercent),
      };
    });
  };

  const setDiscountPercent = (discountPercentRaw: number) => {
    const discountPercent = Math.min(100, Math.max(0, discountPercentRaw));
    setStudentForm(current => ({
      ...current,
      annualDiscountEnabled: discountPercent > 0 || current.annualDiscountEnabled,
      annualDiscountPercent: discountPercent,
      annualAmount: current.annualRateManuallyOverridden
        ? current.annualAmount
        : calculateDiscountedAnnualRate(tuitionSettings.annualRate, discountPercent),
    }));
  };

  const setAnnualOverride = (enabled: boolean) => {
    setStudentForm(current => ({
      ...current,
      annualRateManuallyOverridden: enabled,
      annualAmount: enabled
        ? current.annualAmount
        : calculateDiscountedAnnualRate(
            tuitionSettings.annualRate,
            current.annualDiscountEnabled ? current.annualDiscountPercent : 0,
          ),
    }));
  };

  const setLessonOverride = (enabled: boolean) => {
    setStudentForm(current => ({
      ...current,
      lessonRateManuallyOverridden: enabled,
      lessonPrice: enabled ? current.lessonPrice : tuitionSettings.lessonRate,
    }));
  };

  const formSchoolYear = getSchoolYearForDate(studentForm.startDate || new Date());
  const storedYearRecord = editingStudent ? getStudentSchoolYearRecord(editingStudent.id, formSchoolYear) : undefined;
  const inferredStartReason: SchoolYearStartReason = storedYearRecord?.startReason ||
    (studentForm.startingLessonNumber > 1 ? 'midyear_join' : 'regular');
  const billedLessonCount = getBillingLessonCount(studentForm.startingLessonNumber, inferredStartReason);
  const baseAnnualTarget = calculateBaseAnnualTarget(
    studentForm.annualAmount,
    studentForm.startingLessonNumber,
    inferredStartReason,
  );
  const openingFinancialBalance = storedYearRecord?.openingFinancialBalance || 0;
  const netAnnualTarget = Math.max(0, baseAnnualTarget - openingFinancialBalance);
  const previewMonthlyAmount = studentForm.paymentMonths > 0 ? netAnnualTarget / studentForm.paymentMonths : netAnnualTarget;
  const autoDiscountedFullRate = calculateDiscountedAnnualRate(
    tuitionSettings.annualRate,
    studentForm.annualDiscountEnabled ? studentForm.annualDiscountPercent : 0,
  );
  const discountValue = Math.max(0, tuitionSettings.annualRate - autoDiscountedFullRate);

  const handleSaveStudent = () => {
    if (!studentForm.firstName || !studentForm.lastName || !studentForm.phone || !studentForm.personalCode) {
      toast({
        title: 'שגיאה',
        description: 'יש למלא את כל השדות הנדרשים (שם, משפחה, טלפון, קוד אישי)',
        variant: 'destructive'
      });
      return;
    }

    if (studentForm.personalCode.length !== 4 || !/^\d{4}$/.test(studentForm.personalCode)) {
      toast({
        title: 'שגיאה',
        description: 'קוד אישי חייב להכיל בדיוק 4 ספרות',
        variant: 'destructive'
      });
      return;
    }

    const schoolYear = getSchoolYearForDate(studentForm.startDate || new Date());
    const existingRecord = editingStudent ? getStudentSchoolYearRecord(editingStudent.id, schoolYear) : undefined;
    const startReason: SchoolYearStartReason = existingRecord?.startReason ||
      (studentForm.startingLessonNumber > 1 ? 'midyear_join' : 'regular');
    const annualBaseTarget = calculateBaseAnnualTarget(
      studentForm.annualAmount,
      studentForm.startingLessonNumber,
      startReason,
    );
    const openingBalance = existingRecord?.openingFinancialBalance || 0;
    const effectiveAmount = studentForm.paymentType === 'annual' ? Math.max(0, annualBaseTarget - openingBalance) : 0;
    const calculatedAmount = studentForm.paymentType === 'annual' && Math.abs(effectiveAmount - studentForm.annualAmount) > 0.009
      ? Math.round(effectiveAmount * 100) / 100
      : undefined;
    const monthlyAmount = studentForm.paymentMonths > 0
      ? Math.round((effectiveAmount / studentForm.paymentMonths) * 100) / 100
      : effectiveAmount;

    const pricingFields: StudentPricingFields = {
      annualDiscountEnabled: studentForm.annualDiscountEnabled,
      annualDiscountPercent: studentForm.annualDiscountEnabled ? studentForm.annualDiscountPercent : 0,
      annualRateManuallyOverridden: studentForm.annualRateManuallyOverridden,
      lessonRateManuallyOverridden: studentForm.lessonRateManuallyOverridden,
    };

    if (editingStudent) {
      const wasAnnual = !editingStudent.paymentType || editingStudent.paymentType === 'annual';
      const isNowPerLesson = studentForm.paymentType === 'per_lesson';

      if (wasAnnual && isNowPerLesson) {
        const existingPayments = getPayments().filter(
          p => p.studentId === editingStudent.id && p.status === 'paid' && p.amount > 0
        );

        if (existingPayments.length > 0) {
          const result = convertAnnualToPerLesson(editingStudent.id, studentForm.lessonPrice);
          if (result) {
            updateStudent(editingStudent.id, pricingFields as any);
            toast({
              title: 'הצלחה',
              description: `התלמידה עברה למסלול חד-פעמי. ${result.convertedPayments.length} תשלומים הועברו (סה"כ ₪${result.totalAmount})`
            });
            refreshStudents();
            setShowDialog(false);
            resetForm(tuitionSettings);
            return;
          }
        }
      }

      updateStudent(editingStudent.id, {
        firstName: studentForm.firstName,
        lastName: studentForm.lastName,
        phone: studentForm.phone,
        email: studentForm.email,
        personalCode: studentForm.personalCode,
        startDate: studentForm.startDate,
        startingLessonNumber: studentForm.startingLessonNumber,
        annualAmount: studentForm.annualAmount,
        paymentMonths: studentForm.paymentMonths,
        calculatedAmount: studentForm.paymentType === 'annual' ? calculatedAmount : undefined,
        monthlyAmount: studentForm.paymentType === 'annual' ? monthlyAmount : 0,
        notes: studentForm.notes,
        additionalPhones: studentForm.additionalPhones,
        additionalEmails: studentForm.additionalEmails,
        paymentType: studentForm.paymentType,
        lessonPrice: studentForm.paymentType === 'per_lesson' ? studentForm.lessonPrice : undefined,
        paidLessonsCount: studentForm.paymentType === 'per_lesson' ? (editingStudent.paidLessonsCount || 0) : undefined,
        ...pricingFields,
      } as any);

      if (studentForm.paymentType === 'annual') {
        upsertStudentSchoolYearTerms(editingStudent.id, schoolYear, {
          startReason,
          startingLessonNumber: studentForm.startingLessonNumber,
          // Freeze the effective full-year rate (after discount/manual override)
          // inside the year record so later generic price changes are not retroactive.
          annualAmountFull: studentForm.annualAmount,
          openingFinancialBalance: openingBalance,
          openingCarryoverLessons: existingRecord?.openingCarryoverLessons || 0,
          openingCarryoverBankMinutes: existingRecord?.openingCarryoverBankMinutes || 0,
          source: existingRecord?.source || 'manual',
        });
      }

      toast({ title: 'הצלחה', description: 'פרטי התלמידה עודכנו בהצלחה' });
    } else {
      const newStudent = addStudent({
        firstName: studentForm.firstName,
        lastName: studentForm.lastName,
        phone: studentForm.phone,
        email: studentForm.email,
        personalCode: studentForm.personalCode,
        swapCode: Math.floor(1000 + Math.random() * 9000).toString(),
        startDate: studentForm.startDate,
        startingLessonNumber: studentForm.startingLessonNumber,
        annualAmount: studentForm.annualAmount,
        paymentMonths: studentForm.paymentMonths,
        calculatedAmount: studentForm.paymentType === 'annual' ? calculatedAmount : undefined,
        monthlyAmount: studentForm.paymentType === 'annual' ? monthlyAmount : 0,
        notes: studentForm.notes,
        additionalPhones: studentForm.additionalPhones,
        additionalEmails: studentForm.additionalEmails,
        paymentType: studentForm.paymentType,
        lessonPrice: studentForm.paymentType === 'per_lesson' ? studentForm.lessonPrice : undefined,
        paidLessonsCount: studentForm.paymentType === 'per_lesson' ? 0 : undefined,
        ...pricingFields,
      } as any);

      if (studentForm.paymentType === 'annual') {
        upsertStudentSchoolYearTerms(newStudent.id, schoolYear, {
          startReason,
          startingLessonNumber: studentForm.startingLessonNumber,
          annualAmountFull: studentForm.annualAmount,
          source: 'manual',
        });
      }

      toast({ title: 'הצלחה', description: 'התלמידה נוספה בהצלחה' });
    }

    refreshStudents();
    setShowDialog(false);
    resetForm(tuitionSettings);
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (window.confirm('האם את בטוחה שברצונך למחוק את התלמידה? כל הנתונים שלה יימחקו לצמיתות.')) {
      try {
        await deleteMessagesForStudentCascade(studentId);
        await deleteStudentCascade(studentId);
        refreshStudents();
        toast({ title: 'הצלחה', description: 'התלמידה וכל הנתונים שלה נמחקו בהצלחה' });
      } catch (error) {
        console.error('Error deleting student:', error);
        toast({ title: 'שגיאה', description: 'שגיאה במחיקת התלמידה', variant: 'destructive' });
      }
    }
  };

  const handleMarkLeft = (student: Student) => {
    const reason = window.prompt(`סיבת עזיבה של ${student.firstName} ${student.lastName} (אפשרי לרשום "סיום שנה" / "עברה" / "הפסקה זמנית"):`);
    if (reason === null) return;
    const leftDate = new Date().toISOString().split('T')[0];
    const updated = { ...student, isActive: false, leftDate, leftReason: reason || 'לא צוין' };
    updateStudent(student.id, updated);
    refreshStudents();
  };

  return (
    <div className="space-y-6">
      <TuitionSettingsCard onSaved={handleTuitionSettingsSaved} />

      <Card className="card-gradient card-shadow">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl flex items-center gap-2">
              <Users className="h-6 w-6" />
              ניהול תלמידות ({students.length})
            </CardTitle>
            <div className="flex gap-2">
              <div className="flex border rounded-lg p-1">
                <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')}>
                  <Grid className="h-4 w-4" />
                </Button>
                <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')}>
                  <List className="h-4 w-4" />
                </Button>
              </div>
              <Button onClick={handleOpenDialog} className="hero-gradient">
                <UserPlus className="h-4 w-4 mr-2" />
                הוספת תלמידה
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {students.map((student) => {
                const isPerLesson = student.paymentType === 'per_lesson';
                const completedLessons = isPerLesson ? getCompletedLessonsCount(student.id) : 0;
                const pricing = student as Student & Partial<StudentPricingFields>;
                return (
                  <Card key={student.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-lg">{student.firstName} {student.lastName}</h3>
                          {isPerLesson && (
                            <Badge variant="secondary" className="text-xs"><Coins className="h-3 w-3 mr-1" />חד-פעמי</Badge>
                          )}
                          {!isPerLesson && pricing.annualDiscountEnabled && Number(pricing.annualDiscountPercent || 0) > 0 && (
                            <Badge variant="outline" className="text-xs"><Percent className="h-3 w-3 mr-1" />הנחת ותק {pricing.annualDiscountPercent}%</Badge>
                          )}
                        </div>
                        <div className="text-sm space-y-1 text-muted-foreground">
                          <p>🔑 קוד: {student.personalCode}</p>
                          <p>📞 {student.phone}</p>
                          {isPerLesson && (
                            <div className="mt-2 p-2 bg-secondary/30 rounded text-xs">
                              <p>📚 שיעורים: {completedLessons} | 💰 ₪{student.lessonPrice}/שיעור</p>
                            </div>
                          )}
                        </div>
                        {!isPerLesson && <StudentSchoolYearSummary student={student} />}
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" onClick={() => { setHistoryStudent(student); setShowHistoryDialog(true); }}><History className="h-3 w-3" /></Button>
                          <Button size="sm" variant="outline" onClick={() => handleEditStudent(student)}><Edit className="h-3 w-3" /></Button>
                          <Button size="sm" variant="outline" className="border-yellow-600 text-yellow-600 hover:bg-yellow-50" onClick={() => handleMarkLeft(student)} title="סמן כ-עזבה (לא ימחק נתונים)"><DoorOpen className="h-3 w-3" /></Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteStudent(student.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>שם</TableHead><TableHead>משפחה</TableHead><TableHead>פרטי התקשרות</TableHead><TableHead>תחילת שנה</TableHead><TableHead>תשלום חודשי</TableHead><TableHead>תשלום שנתי מלא</TableHead><TableHead>פעולות</TableHead></TableRow></TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.firstName}</TableCell>
                      <TableCell>{student.lastName}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>📞 {student.phone}</div>
                          {student.additionalPhones?.map((phone, idx) => <div key={idx} className="text-xs text-muted-foreground">📞 {phone}</div>)}
                          {student.email && <div>📧 {student.email}</div>}
                          {student.additionalEmails?.map((email, idx) => <div key={idx} className="text-xs text-muted-foreground">📧 {email}</div>)}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(student.startDate)}</TableCell>
                      <TableCell>₪{student.monthlyAmount}</TableCell>
                      <TableCell>₪{student.annualAmount}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setHistoryStudent(student); setShowHistoryDialog(true); }}><History className="h-3 w-3" /></Button>
                          <Button size="sm" variant="outline" onClick={() => handleEditStudent(student)}><Edit className="h-3 w-3" /></Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteStudent(student.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingStudent ? 'עריכת תלמידה' : 'הוספת תלמידה חדשה'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><Label htmlFor="firstName">שם פרטי *</Label><Input id="firstName" value={studentForm.firstName} onChange={(e) => setStudentForm({...studentForm, firstName: e.target.value})} placeholder="שם פרטי" /></div>
              <div><Label htmlFor="lastName">שם משפחה *</Label><Input id="lastName" value={studentForm.lastName} onChange={(e) => setStudentForm({...studentForm, lastName: e.target.value})} placeholder="שם משפחה" /></div>
              <div><Label htmlFor="personalCode">קוד אישי (4 ספרות) *</Label><Input id="personalCode" value={studentForm.personalCode} onChange={(e) => setStudentForm({...studentForm, personalCode: e.target.value})} placeholder="0000" maxLength={4} /></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label htmlFor="phone">טלפון *</Label><Input id="phone" value={studentForm.phone} onChange={(e) => setStudentForm({...studentForm, phone: e.target.value})} placeholder="מספר טלפון" /></div>
              <div><Label htmlFor="email">אימייל</Label><Input id="email" type="email" value={studentForm.email} onChange={(e) => setStudentForm({...studentForm, email: e.target.value})} placeholder="כתובת אימייל" /></div>
            </div>

            <div className="space-y-2">
              <Label>טלפונים נוספים</Label>
              {studentForm.additionalPhones.map((phone, index) => (
                <div key={index} className="flex gap-2">
                  <Input value={phone} onChange={(e) => { const updated = [...studentForm.additionalPhones]; updated[index] = e.target.value; setStudentForm({...studentForm, additionalPhones: updated}); }} placeholder="מספר טלפון נוסף" />
                  <Button type="button" variant="destructive" size="sm" onClick={() => setStudentForm({...studentForm, additionalPhones: studentForm.additionalPhones.filter((_, i) => i !== index)})}>הסר</Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setStudentForm({...studentForm, additionalPhones: [...studentForm.additionalPhones, '']})}>הוסף טלפון נוסף</Button>
            </div>

            <div className="space-y-2">
              <Label>כתובות מייל נוספות</Label>
              {studentForm.additionalEmails.map((email, index) => (
                <div key={index} className="flex gap-2">
                  <Input type="email" value={email} onChange={(e) => { const updated = [...studentForm.additionalEmails]; updated[index] = e.target.value; setStudentForm({...studentForm, additionalEmails: updated}); }} placeholder="כתובת מייל נוספת" />
                  <Button type="button" variant="destructive" size="sm" onClick={() => setStudentForm({...studentForm, additionalEmails: studentForm.additionalEmails.filter((_, i) => i !== index)})}>הסר</Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setStudentForm({...studentForm, additionalEmails: [...studentForm.additionalEmails, '']})}>הוסף מייל נוסף</Button>
            </div>

            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <Label className="text-base font-semibold mb-3 block">מסלול תשלום</Label>
              <Select value={studentForm.paymentType} onValueChange={(value: 'annual' | 'per_lesson') => setStudentForm({...studentForm, paymentType: value})}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="annual">תשלום שנתי</SelectItem><SelectItem value="per_lesson">שיעורים חד-פעמיים (מזומן)</SelectItem></SelectContent>
              </Select>

              {studentForm.paymentType === 'per_lesson' && (
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={studentForm.lessonRateManuallyOverridden} onChange={(e) => setLessonOverride(e.target.checked)} />
                    תעריף שיעור ידני לתלמידה זו
                  </label>
                  <div>
                    <Label htmlFor="lessonPrice">מחיר לשיעור (₪)</Label>
                    <NumberStepper id="lessonPrice" value={studentForm.lessonPrice} onValueChange={(n) => setStudentForm({...studentForm, lessonPrice: Math.max(0, n)})} step={10} min={0} unit="₪" />
                    {!studentForm.lessonRateManuallyOverridden && <p className="text-xs text-muted-foreground mt-1">לפי התעריף הכללי: {money(tuitionSettings.lessonRate)}</p>}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label htmlFor="startDate">תאריך התחלה</Label><Input id="startDate" type="date" value={studentForm.startDate} onChange={(e) => setStudentForm({...studentForm, startDate: e.target.value})} /></div>
              <div><Label htmlFor="startingLessonNumber">מספר שיעור התחלתי</Label><NumberStepper id="startingLessonNumber" value={studentForm.startingLessonNumber} onValueChange={(n) => setStudentForm({...studentForm, startingLessonNumber: Math.max(1, n)})} step={1} min={1} /></div>
            </div>

            {studentForm.paymentType === 'annual' && (
              <>
                <div className="rounded-lg border border-primary/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 font-semibold"><Percent className="h-4 w-4" />הנחה שנתית / ותק</div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={studentForm.annualDiscountEnabled} onChange={(e) => setDiscountEnabled(e.target.checked)} />
                    תלמידה זכאית להנחה שנתית
                  </label>
                  {studentForm.annualDiscountEnabled && (
                    <div>
                      <Label htmlFor="annualDiscountPercent">אחוז הנחה</Label>
                      <NumberStepper id="annualDiscountPercent" value={studentForm.annualDiscountPercent} onValueChange={setDiscountPercent} step={1} min={0} max={100} unit="%" />
                      <p className="text-xs text-muted-foreground mt-1">הנחה לפי התעריף הכללי: {money(discountValue)}. מחיר לאחר הנחה: {money(autoDiscountedFullRate)}.</p>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={studentForm.annualRateManuallyOverridden} onChange={(e) => setAnnualOverride(e.target.checked)} />
                    סכום שנתי ידני לתלמידה זו
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="annualAmount">מחיר שנתי מלא — 38 שיעורים</Label>
                    <NumberStepper id="annualAmount" value={studentForm.annualAmount} onValueChange={(n) => setStudentForm({...studentForm, annualAmount: Math.max(0, n), annualRateManuallyOverridden: true})} step={100} min={0} unit="₪" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {studentForm.annualRateManuallyOverridden
                        ? 'מחיר ידני — שינוי התעריף הכללי לא ישנה תלמידה זו.'
                        : `מחושב אוטומטית מתעריף כללי ${money(tuitionSettings.annualRate)}${studentForm.annualDiscountEnabled ? ` פחות ${studentForm.annualDiscountPercent}%` : ''}.`}
                    </p>
                  </div>
                  <div><Label htmlFor="paymentMonths">מס' חודשי תשלום</Label><NumberStepper id="paymentMonths" value={studentForm.paymentMonths} onValueChange={(n) => setStudentForm({...studentForm, paymentMonths: Math.min(12, Math.max(1, n))})} step={1} min={1} max={12} /></div>
                </div>

                <div className="space-y-2 rounded-lg border border-primary/20 bg-muted/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">חישוב אוטומטי</span><Badge variant="outline">{getSchoolYearStartReasonLabel(inferredStartReason)}</Badge></div>
                  {inferredStartReason === 'midyear_join' ? (
                    <p className="text-sm">התחלה בשיעור #{studentForm.startingLessonNumber} בגלל הצטרפות באמצע שנה → חיוב עבור <b>{billedLessonCount}</b> שיעורים בלבד מתוך 38.</p>
                  ) : inferredStartReason === 'carryover_credit' ? (
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">התחלה בשיעור #{studentForm.startingLessonNumber} היא זכות מיספור משנה קודמת → החיוב נשאר עבור <b>38 שיעורים</b> מלאים.</p>
                  ) : <p className="text-sm">שנה מלאה → חיוב עבור <b>38 שיעורים</b>.</p>}
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div>תעריף כללי<br/><b>{money(tuitionSettings.annualRate)}</b></div>
                    <div>מחיר מלא לתלמידה<br/><b>{money(studentForm.annualAmount)}</b></div>
                    <div>שיעורים לחיוב<br/><b>{billedLessonCount}</b></div>
                    <div>יעד מחושב<br/><b>{money(baseAnnualTarget)}</b></div>
                  </div>
                  {studentForm.annualDiscountEnabled && <div className="text-sm">הנחה שנתית: <b>{studentForm.annualDiscountPercent}%</b>{!studentForm.annualRateManuallyOverridden && <> ({money(discountValue)})</>}</div>}
                  {Math.abs(openingFinancialBalance) > 0.009 && <div className={openingFinancialBalance > 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'}>יתרה משנה קודמת: <b>{openingFinancialBalance > 0 ? 'זכות' : 'חוב'} {money(Math.abs(openingFinancialBalance))}</b></div>}
                  <div>יעד לתשלום לאחר יתרה קודמת: <b>{money(netAnnualTarget)}</b></div>
                  <div>תשלום חודשי מחושב: <b>{money(previewMonthlyAmount)}</b></div>
                </div>
              </>
            )}

            <div><Label htmlFor="notes">הערות</Label><Textarea id="notes" value={studentForm.notes} onChange={(e) => setStudentForm({...studentForm, notes: e.target.value})} placeholder="הערות נוספות" rows={3} /></div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
              <Button onClick={handleSaveStudent} className="hero-gradient">{editingStudent ? 'עדכן' : 'הוסף'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {historyStudent && <StudentLessonHistory student={historyStudent} open={showHistoryDialog} onOpenChange={setShowHistoryDialog} />}
    </div>
  );
};

export default StudentsManagement;
