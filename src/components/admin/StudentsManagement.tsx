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
import { Grid, List, UserPlus, Edit, Trash2, Users, History, Coins, UserX, DoorOpen } from 'lucide-react';
import { NumberStepper } from '@/components/ui/number-stepper';
import { getStudents, addStudent, updateStudent, deleteStudentCascade, getCompletedLessonsCount, convertAnnualToPerLesson, getPayments } from '@/lib/storage';
import { deleteMessagesForStudentCascade } from '@/lib/messages';
import { Student } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import StudentLessonHistory from './StudentLessonHistory';
import PracticeStats from './PracticeStats';

const StudentsManagement = () => {
  const { formatDate } = useDateMode();
  const [students, setStudents] = useState<Student[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showDialog, setShowDialog] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  // Form states
  const [studentForm, setStudentForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    personalCode: '',
    startDate: '2025-09-01',
    startingLessonNumber: 1,
    annualAmount: 4800,
    paymentMonths: 12,
    calculatedAmount: undefined as number | undefined,
    calculatedFormula: '',
    notes: '',
    additionalPhones: [] as string[],
    additionalEmails: [] as string[],
    paymentType: 'annual' as 'annual' | 'per_lesson',
    lessonPrice: 150
  });

  useEffect(() => {
    refreshStudents();
  }, []);

  const refreshStudents = () => {
    setStudents(getStudents());
  };

  const resetForm = () => {
    setStudentForm({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      personalCode: '',
      startDate: '2025-09-01',
      startingLessonNumber: 1,
      annualAmount: 4800,
      paymentMonths: 12,
      calculatedAmount: undefined,
      calculatedFormula: '',
      notes: '',
      additionalPhones: [],
      additionalEmails: [],
      paymentType: 'annual',
      lessonPrice: 150
    });
  };

  const handleOpenDialog = () => {
    setEditingStudent(null);
    resetForm();
    setShowDialog(true);
  };

  const handleEditStudent = (student: Student) => {
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
      calculatedAmount: student.calculatedAmount,
      calculatedFormula: '',
      notes: student.notes || '',
      additionalPhones: student.additionalPhones || [],
      additionalEmails: student.additionalEmails || [],
      paymentType: student.paymentType || 'annual',
      lessonPrice: student.lessonPrice || 150
    });
    setShowDialog(true);
  };

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

    const effectiveAmount = studentForm.calculatedAmount || studentForm.annualAmount;
    const monthlyAmount = effectiveAmount / studentForm.paymentMonths;
    
    if (editingStudent) {
      // Check if switching from annual to per_lesson
      const wasAnnual = !editingStudent.paymentType || editingStudent.paymentType === 'annual';
      const isNowPerLesson = studentForm.paymentType === 'per_lesson';
      
      if (wasAnnual && isNowPerLesson) {
        // Check if there are existing payments to migrate
        const existingPayments = getPayments().filter(
          p => p.studentId === editingStudent.id && p.status === 'paid' && p.amount > 0
        );
        
        if (existingPayments.length > 0) {
          // Convert and migrate payments
          const result = convertAnnualToPerLesson(editingStudent.id, studentForm.lessonPrice);
          if (result) {
            toast({
              title: 'הצלחה',
              description: `התלמידה עברה למסלול חד-פעמי. ${result.convertedPayments.length} תשלומים הועברו (סה"כ ₪${result.totalAmount})`
            });
            refreshStudents();
            setShowDialog(false);
            resetForm();
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
        calculatedAmount: studentForm.calculatedAmount,
        monthlyAmount,
        notes: studentForm.notes,
        additionalPhones: studentForm.additionalPhones,
        additionalEmails: studentForm.additionalEmails,
        paymentType: studentForm.paymentType,
        lessonPrice: studentForm.paymentType === 'per_lesson' ? studentForm.lessonPrice : undefined,
        paidLessonsCount: studentForm.paymentType === 'per_lesson' ? (editingStudent.paidLessonsCount || 0) : undefined
      });
      toast({
        title: 'הצלחה',
        description: 'פרטי התלמידה עודכנו בהצלחה'
      });
    } else {
      addStudent({
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
        calculatedAmount: studentForm.calculatedAmount,
        monthlyAmount,
        notes: studentForm.notes,
        additionalPhones: studentForm.additionalPhones,
        additionalEmails: studentForm.additionalEmails,
        paymentType: studentForm.paymentType,
        lessonPrice: studentForm.paymentType === 'per_lesson' ? studentForm.lessonPrice : undefined,
        paidLessonsCount: studentForm.paymentType === 'per_lesson' ? 0 : undefined
      });
      toast({
        title: 'הצלחה',
        description: 'התלמידה נוספה בהצלחה'
      });
    }

    refreshStudents();
    setShowDialog(false);
    resetForm();
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (window.confirm('האם את בטוחה שברצונך למחוק את התלמידה? כל הנתונים שלה יימחקו לצמיתות.')) {
      try {
        await deleteMessagesForStudentCascade(studentId);
        await deleteStudentCascade(studentId);
        refreshStudents();
        toast({
          title: 'הצלחה',
          description: 'התלמידה וכל הנתונים שלה נמחקו בהצלחה'
        });
      } catch (error) {
        console.error('Error deleting student:', error);
        toast({
          title: 'שגיאה',
          description: 'שגיאה במחיקת התלמידה',
          variant: 'destructive'
        });
      }
    }
  };

  const handleMarkLeft = (student: import('@/lib/types').Student) => {
    const reason = window.prompt(`סיבת עזיבה של ${student.firstName} ${student.lastName} (אפשרי לרשום "סיום שנה" / "עברה" / "הפסקה זמנית"):`);
    if (reason === null) return; // ביטול
    const leftDate = new Date().toISOString().split('T')[0];
    const updated = { ...student, isActive: false, leftDate, leftReason: reason || 'לא צוין' };
    import('@/lib/storage').then(({ updateStudent }) => {
      updateStudent(updated);
      refreshStudents();
      const { toast } = require && toast ? { toast } : window.__toast || {};
    });
    // עדכן ישירות
    const saved = JSON.parse(localStorage.getItem('musicSystem_students') || '[]');
    const idx = saved.findIndex((s: any) => s.id === student.id);
    if (idx >= 0) {
      saved[idx] = { ...saved[idx], isActive: false, leftDate, leftReason: reason || 'לא צוין' };
      localStorage.setItem('musicSystem_students', JSON.stringify(saved));
      refreshStudents();
      alert(`✅ ${student.firstName} סומנה כ"עזבה" — לא תקבל יותר דוחות חודשיים`);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="card-gradient card-shadow">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl flex items-center gap-2">
              <Users className="h-6 w-6" />
              ניהול תלמידות ({students.length})
            </CardTitle>
            <div className="flex gap-2">
              <div className="flex border rounded-lg p-1">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
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
                
                return (
                <Card key={student.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg">
                          {student.firstName} {student.lastName}
                        </h3>
                        {isPerLesson && (
                          <Badge variant="secondary" className="text-xs">
                            <Coins className="h-3 w-3 mr-1" />
                            חד-פעמי
                          </Badge>
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
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setHistoryStudent(student);
                            setShowHistoryDialog(true);
                          }}
                        >
                          <History className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditStudent(student)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-yellow-600 text-yellow-600 hover:bg-yellow-50"
                          onClick={() => handleMarkLeft(student)}
                          title="סמן כ-עזבה (לא ימחק נתונים)"
                        >
                          <DoorOpen className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteStudent(student.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
                <TableHeader>
                  <TableRow>
                    <TableHead>שם</TableHead>
                    <TableHead>משפחה</TableHead>
                    <TableHead>פרטי התקשרות</TableHead>
                    <TableHead>תחילת שנה</TableHead>
                    <TableHead>תשלום חודשי</TableHead>
                    <TableHead>תשלום שנתי</TableHead>
                    <TableHead>פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.firstName}</TableCell>
                      <TableCell>{student.lastName}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>📞 {student.phone}</div>
                          {student.additionalPhones && student.additionalPhones.length > 0 && 
                            student.additionalPhones.map((phone, idx) => (
                              <div key={idx} className="text-xs text-muted-foreground">📞 {phone}</div>
                            ))
                          }
                          {student.email && <div>📧 {student.email}</div>}
                          {student.additionalEmails && student.additionalEmails.length > 0 && 
                            student.additionalEmails.map((email, idx) => (
                              <div key={idx} className="text-xs text-muted-foreground">📧 {email}</div>
                            ))
                          }
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(student.startDate)}</TableCell>
                      <TableCell>₪{student.monthlyAmount}</TableCell>
                      <TableCell>₪{student.annualAmount}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setHistoryStudent(student);
                              setShowHistoryDialog(true);
                            }}
                          >
                            <History className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditStudent(student)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteStudent(student.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
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

      {/* Dialog for Add/Edit Student */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingStudent ? 'עריכת תלמידה' : 'הוספת תלמידה חדשה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="firstName">שם פרטי *</Label>
                <Input
                  id="firstName"
                  value={studentForm.firstName}
                  onChange={(e) => setStudentForm({...studentForm, firstName: e.target.value})}
                  placeholder="שם פרטי"
                />
              </div>
              <div>
                <Label htmlFor="lastName">שם משפחה *</Label>
                <Input
                  id="lastName"
                  value={studentForm.lastName}
                  onChange={(e) => setStudentForm({...studentForm, lastName: e.target.value})}
                  placeholder="שם משפחה"
                />
              </div>
              <div>
                <Label htmlFor="personalCode">קוד אישי (4 ספרות) *</Label>
                <Input
                  id="personalCode"
                  value={studentForm.personalCode}
                  onChange={(e) => setStudentForm({...studentForm, personalCode: e.target.value})}
                  placeholder="0000"
                  maxLength={4}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">טלפון *</Label>
                <Input
                  id="phone"
                  value={studentForm.phone}
                  onChange={(e) => setStudentForm({...studentForm, phone: e.target.value})}
                  placeholder="מספר טלפון"
                />
              </div>
              <div>
                <Label htmlFor="email">אימייל</Label>
                <Input
                  id="email"
                  type="email"
                  value={studentForm.email}
                  onChange={(e) => setStudentForm({...studentForm, email: e.target.value})}
                  placeholder="כתובת אימייל"
                />
              </div>
            </div>

            {/* Additional Phones */}
            <div className="space-y-2">
              <Label>טלפונים נוספים</Label>
              {studentForm.additionalPhones.map((phone, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={phone}
                    onChange={(e) => {
                      const updated = [...studentForm.additionalPhones];
                      updated[index] = e.target.value;
                      setStudentForm({...studentForm, additionalPhones: updated});
                    }}
                    placeholder="מספר טלפון נוסף"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      const updated = studentForm.additionalPhones.filter((_, i) => i !== index);
                      setStudentForm({...studentForm, additionalPhones: updated});
                    }}
                  >
                    הסר
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStudentForm({
                    ...studentForm,
                    additionalPhones: [...studentForm.additionalPhones, '']
                  });
                }}
              >
                הוסף טלפון נוסף
              </Button>
            </div>

            {/* Additional Emails */}
            <div className="space-y-2">
              <Label>כתובות מייל נוספות</Label>
              {studentForm.additionalEmails.map((email, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      const updated = [...studentForm.additionalEmails];
                      updated[index] = e.target.value;
                      setStudentForm({...studentForm, additionalEmails: updated});
                    }}
                    placeholder="כתובת מייל נוספת"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      const updated = studentForm.additionalEmails.filter((_, i) => i !== index);
                      setStudentForm({...studentForm, additionalEmails: updated});
                    }}
                  >
                    הסר
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStudentForm({
                    ...studentForm,
                    additionalEmails: [...studentForm.additionalEmails, '']
                  });
                }}
              >
                הוסף מייל נוסף
              </Button>
            </div>

            {/* Payment Track Selection */}
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <Label className="text-base font-semibold mb-3 block">מסלול תשלום</Label>
              <Select
                value={studentForm.paymentType}
                onValueChange={(value: 'annual' | 'per_lesson') => 
                  setStudentForm({...studentForm, paymentType: value})
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">תשלום שנתי</SelectItem>
                  <SelectItem value="per_lesson">שיעורים חד-פעמיים (מזומן)</SelectItem>
                </SelectContent>
              </Select>
              
              {studentForm.paymentType === 'per_lesson' && (
                <div className="mt-3">
                  <Label htmlFor="lessonPrice">מחיר לשיעור (₪)</Label>
                  <NumberStepper
                    id="lessonPrice"
                    value={studentForm.lessonPrice}
                    onValueChange={(n) => setStudentForm({...studentForm, lessonPrice: n})}
                    step={10}
                    min={0}
                    placeholder="150"
                    unit="₪"
                  />
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">תאריך התחלה</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={studentForm.startDate}
                  onChange={(e) => setStudentForm({...studentForm, startDate: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="startingLessonNumber">מספר שיעור התחלתי</Label>
                <NumberStepper
                  id="startingLessonNumber"
                  value={studentForm.startingLessonNumber}
                  onValueChange={(n) => setStudentForm({...studentForm, startingLessonNumber: Math.max(1, n)})}
                  step={1}
                  min={1}
                />
              </div>
            </div>
            
            {/* Annual payment fields - only show for annual payment type */}
            {studentForm.paymentType === 'annual' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="annualAmount">תשלום שנתי</Label>
                <NumberStepper
                  id="annualAmount"
                  value={studentForm.annualAmount}
                  onValueChange={(n) => setStudentForm({...studentForm, annualAmount: Math.max(0, n)})}
                  step={100}
                  min={0}
                  unit="₪"
                />
              </div>
              <div>
                <Label htmlFor="paymentMonths">מס' חודשי תשלום</Label>
                <NumberStepper
                  id="paymentMonths"
                  value={studentForm.paymentMonths}
                  onValueChange={(n) => setStudentForm({...studentForm, paymentMonths: Math.min(12, Math.max(1, n))})}
                  step={1}
                  min={1}
                  max={12}
                />
              </div>
            </div>
            )}

            {/* Calculator section - only show for annual payment type */}
            {studentForm.paymentType === 'annual' && (
            <>
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <Label htmlFor="calculatedFormula">מחשבון סכום יחסי (הקלד נוסחה המתחילה ב-=)</Label>
              <Input
                id="calculatedFormula"
                value={studentForm.calculatedFormula}
                onChange={(e) => {
                  const formula = e.target.value;
                  setStudentForm({...studentForm, calculatedFormula: formula});
                  
                  if (formula.startsWith('=')) {
                    try {
                      // Remove = and evaluate the expression using safe math parser
                      const expression = formula.slice(1);
                      // Only allow numbers and basic math operators
                      const sanitized = expression.replace(/[^0-9+\-*/().]/g, '');
                      if (sanitized.length > 0) {
                        // Use Function constructor with restricted scope as a safer alternative to eval
                        // This creates a function that only has access to Math operations
                        const safeEval = (expr: string): number => {
                          // Validate expression contains only safe characters
                          if (!/^[0-9+\-*/().]+$/.test(expr)) {
                            throw new Error('Invalid characters in expression');
                          }
                          // Use Function to evaluate in a controlled scope
                          const fn = new Function('return ' + expr);
                          return fn();
                        };
                        const result = safeEval(sanitized);
                        if (!isNaN(result) && isFinite(result)) {
                          setStudentForm(prev => ({...prev, calculatedFormula: formula, calculatedAmount: Math.round(result)}));
                        }
                      }
                    } catch (e) {
                      // Invalid formula, ignore
                    }
                  }
                }}
                placeholder="=4800/40*28"
              />
              <div>
                <Label htmlFor="calculatedAmount">מחיר מחושב (קובע לתשלום)</Label>
                <NumberStepper
                  id="calculatedAmount"
                  value={studentForm.calculatedAmount ?? 0}
                  onValueChange={(n) => setStudentForm({...studentForm, calculatedAmount: n || undefined})}
                  step={100}
                  min={0}
                  unit="₪"
                  placeholder="הזן סכום או השתמש במחשבון למעלה"
                />
              </div>
            </div>

            <div>
              <Label>תשלום חודשי (מחושב)</Label>
              <div className="p-3 bg-muted rounded-lg font-bold">
                ₪{((studentForm.calculatedAmount || studentForm.annualAmount) / studentForm.paymentMonths).toFixed(1)}
              </div>
            </div>
            </>
            )}
            
            <div>
              <Label htmlFor="notes">הערות</Label>
              <Textarea
                id="notes"
                value={studentForm.notes}
                onChange={(e) => setStudentForm({...studentForm, notes: e.target.value})}
                placeholder="הערות נוספות"
                rows={3}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                ביטול
              </Button>
              <Button onClick={handleSaveStudent} className="hero-gradient">
                {editingStudent ? 'עדכן' : 'הוסף'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lesson History Dialog */}
      {historyStudent && (
        <StudentLessonHistory
          student={historyStudent}
          open={showHistoryDialog}
          onOpenChange={setShowHistoryDialog}
        />
      )}
    </div>
  );
};

export default StudentsManagement;
