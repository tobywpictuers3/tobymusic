import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/safe-ui/card';
import { Button } from '@/components/safe-ui/button';
import { Input } from '@/components/safe-ui/input';
import { Textarea } from '@/components/safe-ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/safe-ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/safe-ui/table';
import { useDateMode } from '@/contexts/DateModeContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/safe-ui/dialog';
import { Label } from '@/components/safe-ui/label';
import { CreditCard, ChevronRight, ChevronLeft, Download, Coins, Plus, Pencil, Trash2, Calendar } from 'lucide-react';
import { NumberStepper } from '@/components/ui/number-stepper';
import { getStudents, getPayments, savePayments, updateStudent, getPerformances, getOneTimePayments, saveOneTimePayments, updateOneTimePayment, deleteOneTimePayment, getTithePaid, saveTithePaid, getCompletedLessonsCount, recordPerLessonPayment, getPerLessonPayments, getStudentPerLessonPayments, getStudentPerLessonLedger, updatePerLessonPayment, deletePerLessonPayment, updatePerformance, deletePerformance, getPerformancePaidTotal, getPerformancePaymentStatus, addPerformancePayment, updatePerformancePayment, deletePerformancePayment } from '@/lib/storage';
import { Payment, Student, OneTimePayment, Performance, PerLessonPayment } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/safe-ui/badge';
import { format } from 'date-fns';

const PaymentManagement = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activePaymentsTab, setActivePaymentsTab] = useState<'all' | 'fixed' | 'perLesson' | 'performances' | 'other'>('all');
  const [fixedPaymentsView, setFixedPaymentsView] = useState<'annual' | 'monthly'>('annual');
  const [allPaymentsView, setAllPaymentsView] = useState<'annual' | 'monthly' | 'daily'>('annual');
  const [performancesView, setPerformancesView] = useState<'annual' | 'monthly'>('annual');
  const [otherView, setOtherView] = useState<'annual' | 'monthly'>('annual');
  const [regularMonthFilter, setRegularMonthFilter] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    return month.toString().padStart(2, '0');
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    return currentMonth >= 9 ? currentYear : currentYear - 1;
  });
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStudent, setFilterStudent] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{ studentId: string; month: string } | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [oneTimePayments, setOneTimePayments] = useState<OneTimePayment[]>([]);
  const [showOneTimeDialog, setShowOneTimeDialog] = useState(false);
  const [newOneTimePayment, setNewOneTimePayment] = useState({ description: '', amount: '', monthNum: '', baseYear: selectedYear });
  const [history, setHistory] = useState<Array<{ payments: Payment[]; oneTimePayments: OneTimePayment[] }>>([]);
  const [tithePaid, setTithePaid] = useState<Record<string, boolean>>(() => getTithePaid());
  const { formatDate } = useDateMode();
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollBarRef = useRef<HTMLDivElement>(null);
  const scrollBarInnerRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const handleTitheToggle = async (monthKey: string, isPaid: boolean) => {
    const updated = { ...tithePaid, [monthKey]: isPaid };
    setTithePaid(updated);
    
    const result = await saveTithePaid(updated);
    
    if (result.synced) {
      toast({ 
        description: isPaid ? '✅ מעשר סומן כהופרש ונשמר בדרופבוקס' : '✅ מעשר סומן כלא הופרש ונשמר בדרופבוקס' 
      });
    } else if (result.success) {
      toast({ 
        description: isPaid ? '💾 מעשר סומן כהופרש (יסונכרן בקרוב)' : '💾 מעשר סומן כלא הופרש (יסונכרן בקרוב)' 
      });
    } else {
      toast({ 
        title: 'שגיאה',
        description: 'לא הצלחנו לשמור את השינוי',
        variant: 'destructive'
      });
    }
  };

  const academicMonths = [
    { key: '09', name: 'ספט', fullName: 'ספטמבר' },
    { key: '10', name: 'אוק', fullName: 'אוקטובר' },
    { key: '11', name: 'נוב', fullName: 'נובמבר' },
    { key: '12', name: 'דצמ', fullName: 'דצמבר' },
    { key: '01', name: 'ינו', fullName: 'ינואר' },
    { key: '02', name: 'פבר', fullName: 'פברואר' },
    { key: '03', name: 'מרץ', fullName: 'מרץ' },
    { key: '04', name: 'אפר', fullName: 'אפריל' },
    { key: '05', name: 'מאי', fullName: 'מאי' },
    { key: '06', name: 'יוני', fullName: 'יוני' },
    { key: '07', name: 'יולי', fullName: 'יולי' },
    { key: '08', name: 'אוג', fullName: 'אוגוסט' }
  ];

// טווח שנים לבחירה לתשלום חד-פעמי (שנת לימודים: ספטמבר–אוגוסט)
// ניתן לשנות את הטווח לפי הצורך.
const academicYearOptions = Array.from({ length: 11 }, (_, i) => selectedYear - 5 + i);


  useEffect(() => {
    loadData();
  }, []);

  // סרגל גלילה עליון חדש ופשוט: סנכרון 1:1 בין המסילה העליונה לבין הטבלה
  useEffect(() => {
    const table = tableScrollRef.current;
    const bar = scrollBarRef.current;
    const barInner = scrollBarInnerRef.current;
    if (!table || !bar || !barInner) return;

    // כדי למנוע לולאת אירועים דו-כיוונית
    let syncingFromTable = false;
    let syncingFromBar = false;

    const updateSizes = () => {
      // רוחב המסילה העליונה שווה בדיוק לרוחב האזור הגליל של הטבלה
      bar.style.width = `${table.clientWidth}px`;
      // רוחב התוכן במסילה שווה לרוחב התוכן הגליל של הטבלה
      barInner.style.width = `${table.scrollWidth}px`;
    };

    const onTableScroll = () => {
      if (syncingFromBar) return;
      syncingFromTable = true;
      bar.scrollLeft = table.scrollLeft;
      syncingFromTable = false;
    };

    const onBarScroll = () => {
      if (syncingFromTable) return;
      syncingFromBar = true;
      table.scrollLeft = bar.scrollLeft;
      syncingFromBar = false;
    };

    // האזנות
    table.addEventListener('scroll', onTableScroll);
    bar.addEventListener('scroll', onBarScroll);

    // התאמת גדלים ראשונית + על שינוי גודל/פריסה
    const ro = new ResizeObserver(updateSizes);
    ro.observe(table);
    window.addEventListener('resize', updateSizes);

    // קריאה ראשונה
    updateSizes();

    return () => {
      table.removeEventListener('scroll', onTableScroll);
      bar.removeEventListener('scroll', onBarScroll);
      ro.disconnect();
      window.removeEventListener('resize', updateSizes);
    };
  }, []);

  const loadData = () => {
    setStudents(getStudents());
    setPayments(getPayments());
    setOneTimePayments(getOneTimePayments());
  };

  const handleDownloadJSON = () => {
    const data = {
      students,
      payments,
      oneTimePayments,
      exportDate: new Date().toISOString()
    };
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments_students_${format(new Date(), 'yyyy-MM-dd')}.json`;
    link.click();
    toast({ description: 'הקובץ הורד בהצלחה' });
  };

  const getPaymentMethodLabel = (method: 'bank' | 'check' | 'cash' | 'inactive') => {
    const labels = {
      bank: 'בנק',
      check: 'צ\'ק',
      cash: 'מזומן',
      inactive: 'לא פעיל'
    };
    return labels[method];
  };

  const getMonthKey = (monthNum: string, year: number) => {
    return `${year}-${monthNum.padStart(2, '0')}`;
  };

  const getPaymentForMonth = (studentId: string, monthNum: string): Payment | null => {
    const year = parseInt(monthNum) >= 9 ? selectedYear : selectedYear + 1;
    const monthKey = getMonthKey(monthNum, year);
    
    return payments.find(p => p.studentId === studentId && p.month === monthKey) || null;
  };

  const handlePaymentMethodChange = (studentId: string, newMethod: 'bank' | 'check' | 'cash' | 'inactive') => {
    const updatedPayments = [...payments];
    const student = students.find(s => s.id === studentId);
    
    // Update student's payment records with the new payment method
    const studentPayments = updatedPayments.filter(p => p.studentId === studentId);
    studentPayments.forEach(p => p.paymentMethod = newMethod);
    
    // Calculate monthly amount based on calculatedAmount if exists, otherwise annualAmount
    const effectiveAmount = student?.calculatedAmount || student?.annualAmount || 0;
    const monthlyAmount = effectiveAmount / (student?.paymentMonths || 12);
    
    // Apply specific logic based on payment method
    academicMonths.forEach((month, index) => {
      const year = parseInt(month.key) >= 9 ? selectedYear : selectedYear + 1;
      const monthKey = getMonthKey(month.key, year);
      
      const existingPaymentIndex = updatedPayments.findIndex(
        p => p.studentId === studentId && p.month === monthKey
      );
      
      let status: Payment['status'] = 'not_paid';
      let amount = 0;
      
      if (newMethod === 'bank') {
        status = 'pending';
      } else if (newMethod === 'check') {
        status = 'paid';
        amount = monthlyAmount;
      } else if (newMethod === 'cash' && index === 0) {
        status = 'paid';
        amount = monthlyAmount;
      }
      
      if (existingPaymentIndex >= 0) {
        updatedPayments[existingPaymentIndex] = {
          ...updatedPayments[existingPaymentIndex],
          status,
          amount,
          paymentMethod: newMethod,
          lastModified: new Date().toISOString()
        };
      } else {
        updatedPayments.push({
          id: `${studentId}-${monthKey}`,
          studentId,
          month: monthKey,
          amount,
          status,
          paymentMethod: newMethod,
          lastModified: new Date().toISOString()
        });
      }
    });
    
    savePayments(updatedPayments);
    loadData();
    toast({ description: 'צורת התשלום עודכנה בהצלחה' });
  };

  const handleCellClick = (studentId: string, monthNum: string, currentStatus: Payment['status'], paymentMethod: 'bank' | 'check' | 'cash' | 'inactive') => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    
    const year = parseInt(monthNum) >= 9 ? selectedYear : selectedYear + 1;
    const monthKey = getMonthKey(monthNum, year);
    
    // לחיצה על "ממתין" - מזין ישירות את הסכום החודשי
    if (currentStatus === 'pending') {
      const updatedPayments = [...payments];
      const paymentIndex = updatedPayments.findIndex(
        p => p.studentId === studentId && p.month === monthKey
      );
      
      // Use calculatedAmount if exists, otherwise use monthlyAmount
      const amount = student.monthlyAmount || 0;
      
      if (paymentIndex >= 0) {
        updatedPayments[paymentIndex] = {
          ...updatedPayments[paymentIndex],
          amount,
          status: 'paid',
          paidDate: new Date().toISOString().split('T')[0],
          lastModified: new Date().toISOString()
        };
      } else {
        updatedPayments.push({
          id: `${studentId}-${monthKey}`,
          studentId,
          month: monthKey,
          amount,
          status: 'paid',
          paymentMethod,
          paidDate: new Date().toISOString().split('T')[0],
          lastModified: new Date().toISOString()
        });
      }
      
      savePayments(updatedPayments);
      loadData();
      toast({ description: 'התשלום עודכן' });
    } else {
      // פתיחת עריכה לכל מצב אחר
      setEditingCell({ studentId, month: monthKey });
      const payment = getPaymentForMonth(studentId, monthNum);
      setEditAmount(payment?.amount.toString() || '0');
    }
  };

  const handleSaveEdit = () => {
    if (!editingCell) return;
    
    const student = students.find(s => s.id === editingCell.studentId);
    if (!student) return;
    
    const updatedPayments = [...payments];
    const paymentIndex = updatedPayments.findIndex(
      p => p.studentId === editingCell.studentId && p.month === editingCell.month
    );
    
    const amount = parseFloat(editAmount) || 0;
    let status: Payment['status'] = 'not_paid';
    
    if (editAmount.trim() === '#') {
      status = 'debt';
    } else if (editAmount.trim() === '0.0' || editAmount.trim() === '') {
      status = 'not_paid';
    } else if (amount === 0 && editAmount.trim() === '0') {
      // הזנת 0 - נשאר במצב paid עם סכום 0
      status = 'paid';
    } else if (amount > 0) {
      status = 'paid';
    }
    
    const paymentMethod = payments.find(p => p.studentId === editingCell.studentId)?.paymentMethod || 'cash';
    
    if (paymentIndex >= 0) {
      updatedPayments[paymentIndex] = {
        ...updatedPayments[paymentIndex],
        amount: editAmount.trim() === '#' ? 0 : amount,
        status,
        paidDate: status === 'paid' ? new Date().toISOString().split('T')[0] : undefined,
        lastModified: new Date().toISOString()
      };
    } else {
      updatedPayments.push({
        id: `${editingCell.studentId}-${editingCell.month}`,
        studentId: editingCell.studentId,
        month: editingCell.month,
        amount: editAmount.trim() === '#' ? 0 : amount,
        status,
        paymentMethod,
        lastModified: new Date().toISOString()
      });
    }
    
    savePayments(updatedPayments);
    loadData();
    setEditingCell(null);
    toast({ description: 'התשלום עודכן' });
  };

  const getCellDisplay = (student: Student, monthNum: string, paymentMethod: 'bank' | 'check' | 'cash' | 'inactive') => {
    const payment = getPaymentForMonth(student.id, monthNum);
    
    if (paymentMethod === 'inactive') {
      return { text: 'לא פעיל', className: 'text-gray-900 bg-gray-100', clickable: false };
    }
    
    if (!payment || payment.status === 'not_paid') {
      return { text: 'לא שולם', className: 'text-gray-500 bg-gray-50 cursor-pointer hover:bg-gray-100', clickable: true };
    }
    
    if (payment.status === 'debt') {
      return { text: '💥 חוב 💥', className: 'text-red-700 bg-red-200 font-bold text-lg cursor-pointer hover:bg-red-300 border-2 border-red-700', clickable: true };
    }
    
    if (payment.status === 'pending') {
      return { text: 'ממתין', className: 'text-yellow-700 bg-yellow-100 cursor-pointer hover:bg-yellow-200', clickable: true };
    }
    
    if (payment.status === 'paid') {
      // אם הסכום הוא בדיוק 0
      if (payment.amount === 0) {
        return { text: '₪0', className: 'text-yellow-700 bg-yellow-100 font-semibold cursor-pointer hover:bg-yellow-200', clickable: true };
      }
      
      // Round to 1 decimal place and remove trailing zeros
      const roundedAmount = parseFloat(payment.amount.toFixed(1));
      const isPerfectMatch = payment.amount === (student.monthlyAmount || 0);
      if (isPerfectMatch) {
        return { text: `₪${roundedAmount}`, className: 'text-yellow-700 bg-yellow-100 font-semibold cursor-pointer hover:bg-yellow-200', clickable: true };
      } else {
        return { text: `₪${roundedAmount}`, className: 'text-yellow-700 bg-yellow-100 font-semibold border-2 border-[#8B2942] cursor-pointer hover:bg-yellow-200', clickable: true };
      }
    }
    
    return { text: '-', className: 'text-gray-400', clickable: false };
  };

  const calculateTotalPaid = (studentId: string) => {
    let total = 0;
    
    academicMonths.forEach(month => {
      const year = parseInt(month.key) >= 9 ? selectedYear : selectedYear + 1;
      const monthKey = getMonthKey(month.key, year);
      const payment = payments.find(p => p.studentId === studentId && p.month === monthKey);
      
      if (payment && payment.status === 'paid') {
        total += payment.amount;
      }
    });
    
    return total;
  };

  const calculateMonthlyTotal = (monthNum: string) => {
    const year = parseInt(monthNum) >= 9 ? selectedYear : selectedYear + 1;
    const monthKey = getMonthKey(monthNum, year);
    
    let total = 0;
    
    // תשלומי תלמידות רגילות
    payments.forEach(payment => {
      if (payment.month === monthKey && payment.status === 'paid') {
        total += payment.amount;
      }
    });
    
    // תשלומים חד פעמיים
    oneTimePayments
      .filter(otp => otp.month === monthKey)
      .forEach(otp => {
        total += otp.amount;
      });

    // הכנסות מהופעות בחודש זה — לפי תאריכי תשלום בפועל בלבד, ללא נסיעות
    const performances = getPerformances();
    performances.forEach(perf => {
      (perf.performancePayments || []).forEach(pp => {
        if (pp.date && pp.date.startsWith(monthKey)) {
          total += pp.amount || 0;
        }
      });
    });
    
    // תשלומים עבור שיעורים חד-פעמיים
    const perLessonPayments = getPerLessonPayments();
    perLessonPayments
      .filter(p => p.month === monthKey)
      .forEach(p => {
        total += p.amount;
      });
    
    return total;
  };

  const calculatePerformancesForMonth = (monthNum: string) => {
    const year = parseInt(monthNum) >= 9 ? selectedYear : selectedYear + 1;
    const monthKey = getMonthKey(monthNum, year);
    
    const performances = getPerformances();
    let sum = 0;
    performances.forEach(perf => {
      (perf.performancePayments || []).forEach(pp => {
        if (pp.date && pp.date.startsWith(monthKey)) sum += pp.amount || 0;
      });
    });
    return sum;
  };

  const calculatePerformancesOnlyForMonth = (monthNum: string) => {
    return calculatePerformancesForMonth(monthNum);
  };

  const calculateOneTimePaymentsForMonth = (monthNum: string) => {
    const year = parseInt(monthNum) >= 9 ? selectedYear : selectedYear + 1;
    const monthKey = getMonthKey(monthNum, year);
    
    return oneTimePayments
      .filter(otp => otp.month === monthKey)
      .reduce((sum, otp) => sum + otp.amount, 0);
  };

  // ===== Top-level Performance & Other payment tabs =====

  const renderPerformancesTable = (
    rows: Array<{ paymentId: string; performance: Performance; paymentDate: string; paidAmount: number; method?: string }>,
    emptyText: string
  ) => {
    if (rows.length === 0) {
      return <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded">{emptyText}</div>;
    }
    return (
      <div className="rounded-lg border overflow-auto max-h-[60vh]" dir="rtl">
        <Table className="w-full min-w-[980px] table-fixed">
          <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
            <TableRow>
              <TableHead className="text-right">הופעה</TableHead>
              <TableHead className="text-right">לקוחה</TableHead>
              <TableHead className="text-right">תאריך הופעה</TableHead>
              <TableHead className="text-right">תאריך תשלום</TableHead>
              <TableHead className="text-right">סכום ששולם (הכנסה)</TableHead>
              <TableHead className="text-right">נסיעות בתשלום (לא הכנסה)</TableHead>
              <TableHead className="text-right">סטטוס</TableHead>
              <TableHead className="text-center">עריכה</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => {
              const status = getPerformancePaymentStatus(row.performance);
              const totalDue = row.performance.amount || 0;
              const totalPaid = getPerformancePaidTotal(row.performance);
              const pp = (row.performance.performancePayments || []).find(p => p.id === row.paymentId);
              const ppTravel = pp?.travel || 0;
              return (
                <TableRow key={row.paymentId} className="hover:bg-muted/40">
                  <TableCell className="text-right font-semibold">{row.performance.name}</TableCell>
                  <TableCell className="text-right">{row.performance.client || '-'}</TableCell>
                  <TableCell className="text-right">{formatDate(row.performance.date)}</TableCell>
                  <TableCell className="text-right">{formatDisplayDate(row.paymentDate)}</TableCell>
                  <TableCell className="text-right font-semibold">₪{formatCurrencyAmount(row.paidAmount)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{ppTravel > 0 ? `₪${formatCurrencyAmount(ppTravel)}` : '-'}</TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : status === 'partial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'}`}>
                      {status === 'paid' ? 'שולם' : status === 'partial' ? `חלקי ₪${formatCurrencyAmount(totalPaid)}/₪${formatCurrencyAmount(totalDue)}` : 'לא שולם'}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingPerformance(row.performance); setShowEditPerformanceDialog(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderPerformancesAnnualTab = () => {
    const rows = getPerformancePaymentsForYearDetailed();
    const total = rows.reduce((s, r) => s + r.paidAmount, 0);
    return (
      <div className="space-y-3">
        <div className="text-sm font-semibold">סה"כ תשלומי הופעות בשנה: ₪{formatCurrencyAmount(total)} <span className="text-xs text-muted-foreground font-normal">(ללא נסיעות)</span></div>
        {renderPerformancesTable(rows, 'לא נרשמו תשלומי הופעות בשנה זו')}
      </div>
    );
  };

  const renderPerformancesMonthlyTab = () => {
    const rows = getPerformancesForMonthDetailed(selectedMonth);
    const monthLabel = academicMonths.find(m => m.key === selectedMonth)?.fullName || '';
    const total = rows.reduce((s, r) => s + r.paidAmount, 0);
    return (
      <div className="space-y-3">
        <div className="text-sm font-semibold">סה"כ תשלומי הופעות ב{monthLabel}: ₪{formatCurrencyAmount(total)} <span className="text-xs text-muted-foreground font-normal">(ללא נסיעות)</span></div>
        {renderPerformancesTable(rows, 'לא נרשמו תשלומי הופעות בחודש זה')}
      </div>
    );
  };

  const renderOtherTable = (rows: OneTimePayment[], emptyText: string) => {
    if (rows.length === 0) {
      return <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded">{emptyText}</div>;
    }
    return (
      <div className="rounded-lg border overflow-auto max-h-[60vh]" dir="rtl">
        <Table className="w-full min-w-[700px] table-fixed">
          <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
            <TableRow>
              <TableHead className="text-right">תיאור</TableHead>
              <TableHead className="text-right">תאריך תשלום</TableHead>
              <TableHead className="text-right">חודש דיווח</TableHead>
              <TableHead className="text-right">סכום</TableHead>
              <TableHead className="text-center">עריכה</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(payment => (
              <TableRow key={payment.id} className="hover:bg-muted/40">
                <TableCell className="text-right">{payment.description}</TableCell>
                <TableCell className="text-right">{formatDate(payment.paidDate)}</TableCell>
                <TableCell className="text-right">{payment.month}</TableCell>
                <TableCell className="text-right font-semibold">₪{formatCurrencyAmount(payment.amount)}</TableCell>
                <TableCell className="text-center">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingOneTimePayment(payment); setShowEditOneTimeDialog(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderOtherAnnualTab = () => {
    const rows = getOneTimePaymentsForYearDetailed();
    const total = rows.reduce((s, p) => s + p.amount, 0);
    return (
      <div className="space-y-3">
        <div className="text-sm font-semibold">סה"כ תשלומים אחרים בשנה: ₪{formatCurrencyAmount(total)}</div>
        {renderOtherTable(rows, 'לא נרשמו תשלומים אחרים בשנה זו')}
      </div>
    );
  };

  const renderOtherMonthlyTab = () => {
    const rows = getOneTimePaymentsForMonthDetailed(selectedMonth);
    const monthLabel = academicMonths.find(m => m.key === selectedMonth)?.fullName || '';
    const total = rows.reduce((s, p) => s + p.amount, 0);
    return (
      <div className="space-y-3">
        <div className="text-sm font-semibold">סה"כ תשלומים אחרים ב{monthLabel}: ₪{formatCurrencyAmount(total)}</div>
        {renderOtherTable(rows, 'לא נרשמו תשלומים אחרים בחודש זה')}
      </div>
    );
  };


const handleAddOneTimePayment = () => {
  if (
    !newOneTimePayment.description.trim() ||
    !newOneTimePayment.amount ||
    !newOneTimePayment.monthNum ||
    !newOneTimePayment.baseYear
  ) {
    toast({
      title: 'שגיאה',
      description: 'יש למלא את כל השדות',
      variant: 'destructive'
    });
    return;
  }

  const monthNum = newOneTimePayment.monthNum;
  const baseYear = Number(newOneTimePayment.baseYear);
  const year = parseInt(monthNum, 10) >= 9 ? baseYear : baseYear + 1;
  const monthKey = getMonthKey(monthNum, year);

  const payment: OneTimePayment = {
    id: Date.now().toString(),
    month: monthKey,
    amount: parseFloat(newOneTimePayment.amount),
    description: newOneTimePayment.description,
    paidDate: new Date().toISOString()
  };

  const updatedPayments = [...oneTimePayments, payment];
  saveOneTimePayments(updatedPayments);
  setOneTimePayments(updatedPayments);
  setShowOneTimeDialog(false);
  setNewOneTimePayment({ description: '', amount: '', monthNum: '', baseYear: selectedYear });
  toast({
    title: 'הצלחה',
    description: 'תשלום חד פעמי נוסף בהצלחה'
  });
};

  // Filter annual students (paymentType is 'annual' or undefined)
  const annualStudents = students.filter(s => !s.paymentType || s.paymentType === 'annual');
  
  // Filter per-lesson students
  const perLessonStudents = students.filter(s => s.paymentType === 'per_lesson');

  const filteredStudents = annualStudents.filter(student => {
    const fullName = `${student.firstName} ${student.lastName}`.trim().toLowerCase();
    const searchValue = filterStudent.trim().toLowerCase();

    if (searchValue && !fullName.includes(searchValue)) {
      return false;
    }

    const studentMethod = payments.find(p => p.studentId === student.id)?.paymentMethod || 'inactive';
    if (filterMethod !== 'all' && studentMethod !== filterMethod) {
      return false;
    }

    const relevantMonth = fixedPaymentsView === 'monthly'
      ? selectedMonth
      : regularMonthFilter !== 'all'
        ? regularMonthFilter
        : null;

    if (filterStatus !== 'all') {
      if (relevantMonth) {
        const relevantPayment = getPaymentForMonth(student.id, relevantMonth);
        if (relevantPayment?.status !== filterStatus) {
          return false;
        }
      } else {
        const hasStatus = academicMonths.some(month => {
          const payment = getPaymentForMonth(student.id, month.key);
          return payment?.status === filterStatus;
        });
        if (!hasStatus) {
          return false;
        }
      }
    }

    return true;
  });

  // Per-lesson payment dialog state
  const [showPerLessonPaymentDialog, setShowPerLessonPaymentDialog] = useState(false);
  const [selectedPerLessonStudent, setSelectedPerLessonStudent] = useState<Student | null>(null);
  const [perLessonPaymentAmount, setPerLessonPaymentAmount] = useState('');
  const [perLessonPaymentDate, setPerLessonPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [perLessonPaymentNotes, setPerLessonPaymentNotes] = useState('');

  // One-time payment edit state
  const [editingOneTimePayment, setEditingOneTimePayment] = useState<OneTimePayment | null>(null);
  const [showEditOneTimeDialog, setShowEditOneTimeDialog] = useState(false);

  // Performance payment edit state
  const [editingPerformance, setEditingPerformance] = useState<Performance | null>(null);
  const [showEditPerformanceDialog, setShowEditPerformanceDialog] = useState(false);

  // Per-lesson payment edit/view state
  const [editingPerLessonPayment, setEditingPerLessonPayment] = useState<PerLessonPayment | null>(null);
  const [showEditPerLessonDialog, setShowEditPerLessonDialog] = useState(false);
  const [showPerLessonHistoryDialog, setShowPerLessonHistoryDialog] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<Student | null>(null);

  const handleRecordPerLessonPayment = () => {
    if (!selectedPerLessonStudent) return;
    
    const amount = parseFloat(perLessonPaymentAmount) || 0;
    if (amount <= 0) {
      toast({
        title: 'שגיאה',
        description: 'יש להזין סכום תשלום',
        variant: 'destructive'
      });
      return;
    }
    
    const result = recordPerLessonPayment(
      selectedPerLessonStudent.id,
      amount,
      perLessonPaymentDate,
      perLessonPaymentNotes || undefined
    );
    
    if (!result) {
      toast({
        title: 'שגיאה',
        description: 'שגיאה ברישום התשלום',
        variant: 'destructive'
      });
      return;
    }
    
    loadData();
    setShowPerLessonPaymentDialog(false);
    setSelectedPerLessonStudent(null);
    setPerLessonPaymentAmount('');
    setPerLessonPaymentDate(new Date().toISOString().split('T')[0]);
    setPerLessonPaymentNotes('');
    
    toast({
      title: 'הצלחה',
      description: `נרשם תשלום ₪${amount} (${result.lessonsCovered} שיעורים, יתרה: ₪${result.newBalance})`
    });
  };

  const handleEditOneTimePayment = () => {
    if (!editingOneTimePayment) return;
    
    updateOneTimePayment(editingOneTimePayment.id, {
      description: editingOneTimePayment.description,
      amount: editingOneTimePayment.amount,
      paidDate: editingOneTimePayment.paidDate,
    });
    
    loadData();
    setShowEditOneTimeDialog(false);
    setEditingOneTimePayment(null);
    toast({ description: 'התשלום עודכן בהצלחה' });
  };

  const handleDeleteOneTimePayment = async (id: string) => {
    await deleteOneTimePayment(id);
    loadData();
    toast({ description: 'התשלום נמחק' });
  };

  const handleEditPerformance = () => {
    if (!editingPerformance) return;

    updatePerformance(editingPerformance.id, {
      name: editingPerformance.name,
      client: editingPerformance.client,
      amount: editingPerformance.amount,
      travel: editingPerformance.travel,
      notes: editingPerformance.notes,
      // Keep performancePayments updates from inline editor (already saved via dedicated handlers)
      performancePayments: editingPerformance.performancePayments,
    });

    loadData();
    // Refresh editing snapshot from storage so newly added payments stick across re-opens
    const updated = getPerformances().find(p => p.id === editingPerformance.id);
    if (updated) setEditingPerformance(updated);
    toast({ description: 'תשלום ההופעה עודכן בהצלחה' });
  };

  // Partial-payment editor state (used inside Edit Performance dialog)
  const [newPpDate, setNewPpDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newPpAmount, setNewPpAmount] = useState('');
  const [newPpTravel, setNewPpTravel] = useState('');
  const [newPpMethod, setNewPpMethod] = useState<'bank' | 'check' | 'cash'>('bank');
  const [newPpNotes, setNewPpNotes] = useState('');

  const handleAddPerformancePaymentInline = () => {
    if (!editingPerformance) return;
    const amt = parseFloat(newPpAmount);
    if (!amt || amt <= 0) {
      toast({ title: 'שגיאה', description: 'יש להזין סכום תשלום חיובי', variant: 'destructive' });
      return;
    }
    const travelAmt = parseFloat(newPpTravel) || 0;
    const updated = addPerformancePayment(editingPerformance.id, {
      date: newPpDate,
      amount: amt,
      travel: travelAmt > 0 ? travelAmt : undefined,
      method: newPpMethod,
      notes: newPpNotes || undefined,
    });
    if (updated) {
      setEditingPerformance(updated);
      loadData();
      setNewPpAmount('');
      setNewPpTravel('');
      setNewPpNotes('');
      toast({ description: 'תשלום נוסף' });
    }
  };

  const handleDeletePerformancePaymentInline = (paymentId: string) => {
    if (!editingPerformance) return;
    const updated = deletePerformancePayment(editingPerformance.id, paymentId);
    if (updated) {
      setEditingPerformance(updated);
      loadData();
      toast({ description: 'תשלום נמחק' });
    }
  };

  const handleDeletePerformancePayment = async (id: string) => {
    await deletePerformance(id);
    loadData();
    toast({ description: 'תשלום ההופעה נמחק' });
  };

  const handleEditPerLessonPayment = () => {
    if (!editingPerLessonPayment) return;
    
    updatePerLessonPayment(editingPerLessonPayment.id, {
      amount: editingPerLessonPayment.amount,
      paymentDate: editingPerLessonPayment.paymentDate,
      notes: editingPerLessonPayment.notes,
    });
    
    loadData();
    setShowEditPerLessonDialog(false);
    setEditingPerLessonPayment(null);
    toast({ description: 'התשלום עודכן בהצלחה' });
  };

  const handleDeletePerLessonPayment = async (id: string) => {
    await deletePerLessonPayment(id);
    loadData();
    toast({ description: 'התשלום נמחק' });
  };

  // Calculate per-lesson payments for a month
  const calculatePerLessonPaymentsForMonth = (monthNum: string) => {
    const year = parseInt(monthNum) >= 9 ? selectedYear : selectedYear + 1;
    const monthKey = `${year}-${monthNum.padStart(2, '0')}`;
    
    const perLessonPayments = getPerLessonPayments();
    return perLessonPayments.filter(p => p.month === monthKey);
  };

  const calculatePerLessonTotalForMonth = (monthNum: string) => {
    const payments = calculatePerLessonPaymentsForMonth(monthNum);
    return payments.reduce((sum, p) => sum + p.amount, 0);
  };

  const formatDisplayDate = (date?: string) => {
    if (!date) return '-';
    return date.split('-').reverse().join('/');
  };

  const formatCurrencyAmount = (amount: number) => {
    return Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
  };

  const getPerLessonStudentSummary = (student: Student) => {
    const ledger = getStudentPerLessonLedger(student.id);

    return {
      ledger,
      completedLessons: ledger.completedLessonsCount,
      totalDue: ledger.totalDue,
      totalPaid: ledger.totalPaid,
      totalBalance: ledger.totalBalance,
      amountToPay: ledger.totalBalance < 0 ? Math.abs(ledger.totalBalance) : 0,
      creditAmount: ledger.totalBalance > 0 ? ledger.totalBalance : 0,
      debtAmount: ledger.totalBalance < 0 ? Math.abs(ledger.totalBalance) : 0,
    };
  };

const getStudentFullName = (student: Student) => `${student.firstName} ${student.lastName}`.trim();

  const getStudentPaymentMethod = (studentId: string): Payment['paymentMethod'] => {
    return payments.find(p => p.studentId === studentId)?.paymentMethod || 'inactive';
  };

  const getAcademicMonthKey = (monthNum: string) => {
    const year = parseInt(monthNum, 10) >= 9 ? selectedYear : selectedYear + 1;
    return getMonthKey(monthNum, year);
  };

  const getRegularPaymentsTotalForMonthByMethods = (
    monthNum: string,
    methods: Array<Payment['paymentMethod']>
  ) => {
    const monthKey = getAcademicMonthKey(monthNum);

    return payments
      .filter(payment => payment.month === monthKey && payment.status === 'paid' && methods.includes(payment.paymentMethod))
      .reduce((sum, payment) => sum + payment.amount, 0);
  };

  const getOtherPaymentsForMonth = (monthNum: string) => {
    return calculateOneTimePaymentsForMonth(monthNum) + getRegularPaymentsTotalForMonthByMethods(monthNum, ['cash']);
  };

  const getAllPaymentsBreakdownForMonth = (monthNum: string) => {
    const regularChecks = getRegularPaymentsTotalForMonthByMethods(monthNum, ['check']);
    const regularBank = getRegularPaymentsTotalForMonthByMethods(monthNum, ['bank']);
    const perLesson = calculatePerLessonTotalForMonth(monthNum);
    const performances = calculatePerformancesForMonth(monthNum);
    const other = getOtherPaymentsForMonth(monthNum);
    const total = regularChecks + regularBank + perLesson + performances + other;
    const monthKey = getAcademicMonthKey(monthNum);

    return {
      monthKey,
      regularChecks,
      regularBank,
      perLesson,
      performances,
      other,
      total,
      tithe: total * 0.1,
    };
  };

  const getOneTimePaymentsForMonthDetailed = (monthNum: string) => {
    const monthKey = getAcademicMonthKey(monthNum);

    return oneTimePayments
      .filter(payment => payment.month === monthKey)
      .slice()
      .sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''));
  };

  const getPerformancesForMonthDetailed = (monthNum: string) => {
    const monthKey = getAcademicMonthKey(monthNum);
    const out: Array<{
      paymentId: string;
      performance: Performance;
      paymentDate: string;
      paidAmount: number;
      method?: string;
      paymentNotes?: string;
    }> = [];
    getPerformances().forEach(perf => {
      (perf.performancePayments || []).forEach(pp => {
        if (pp.date && pp.date.startsWith(monthKey)) {
          out.push({
            paymentId: pp.id,
            performance: perf,
            paymentDate: pp.date,
            paidAmount: pp.amount || 0,
            method: pp.method,
            paymentNotes: pp.notes,
          });
        }
      });
    });
    return out.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  };

  const getDailyAllPaymentsRows = () => {
    const monthKey = getAcademicMonthKey(selectedMonth);
    const map = new Map<string, {
      regularChecks: number;
      regularBank: number;
      perLesson: number;
      performances: number;
      other: number;
    }>();

    const ensureRow = (date: string) => {
      if (!map.has(date)) {
        map.set(date, {
          regularChecks: 0,
          regularBank: 0,
          perLesson: 0,
          performances: 0,
          other: 0,
        });
      }

      return map.get(date)!;
    };

    payments.forEach(payment => {
      const paidDate = payment.paidDate?.slice(0, 10) || '';
      if (payment.status !== 'paid' || !paidDate.startsWith(monthKey)) return;

      const row = ensureRow(paidDate);
      if (payment.paymentMethod === 'check') {
        row.regularChecks += payment.amount;
      } else if (payment.paymentMethod === 'bank') {
        row.regularBank += payment.amount;
      } else {
        row.other += payment.amount;
      }
    });

    oneTimePayments.forEach(payment => {
      const paidDate = payment.paidDate?.slice(0, 10) || '';
      if (!paidDate.startsWith(monthKey)) return;
      ensureRow(paidDate).other += payment.amount;
    });

    getPerLessonPayments().forEach(payment => {
      const paidDate = payment.paymentDate?.slice(0, 10) || '';
      if (!paidDate.startsWith(monthKey)) return;
      ensureRow(paidDate).perLesson += payment.amount;
    });

    getPerformances().forEach(performance => {
      (performance.performancePayments || []).forEach(pp => {
        const d = (pp.date || '').slice(0, 10);
        if (!d.startsWith(monthKey)) return;
        ensureRow(d).performances += pp.amount || 0;
      });
    });

    return Array.from(map.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, values]) => {
        const total = values.regularChecks + values.regularBank + values.perLesson + values.performances + values.other;
        return {
          date,
          ...values,
          total,
          tithe: total * 0.1,
        };
      });
  };

  const renderFixedAnnualView = () => {
    return (
      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="max-h-[68vh] overflow-auto" dir="rtl">
          <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0">
            <thead className="sticky top-0 z-30 bg-background shadow-sm">
              <tr>
                <th className="sticky top-0 right-0 z-40 bg-primary/25 dark:bg-primary/45 text-foreground border-b border-border min-w-[110px] w-[110px] text-right px-2 py-2 font-bold text-xs">תלמידה</th>
                <th className="sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border min-w-[60px] w-[60px] text-center px-1 py-2 font-bold text-xs">אמצ'ת</th>
                {academicMonths.map(month => {
                  const isHighlighted = regularMonthFilter === month.key;
                  return (
                    <th
                      key={month.key}
                      className={`sticky top-0 z-30 min-w-[52px] w-[52px] text-center px-0 py-2 font-bold border-b border-border text-foreground text-xs ${isHighlighted ? 'bg-primary/20 dark:bg-primary/35' : 'bg-muted/95 dark:bg-muted/80'}`}
                    >
                      <span title={month.fullName || month.name}>{(month.name || '').slice(0,3)}</span>
                    </th>
                  );
                })}
                <th className="sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border min-w-[100px] w-[100px] text-center px-2 py-3 font-bold">סה"כ שולם</th>
                <th className="sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border min-w-[72px] w-[72px] text-center px-1 py-2 font-bold text-xs">יתרה</th>
                <th className="sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border min-w-[65px] w-[65px] text-center px-1 py-2 font-bold text-xs">יעד</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(student => {
                const totalPaid = calculateTotalPaid(student.id);
                const annualTarget = student.calculatedAmount || student.annualAmount || (student.monthlyAmount * student.paymentMonths);
                const method = getStudentPaymentMethod(student.id);

                return (
                  <tr key={student.id} className="hover:bg-muted/30">
                    <td className="sticky right-0 z-20 bg-accent/55 dark:bg-accent/35 text-foreground text-right shadow-[-1px_0_0_0_hsl(var(--border))] font-semibold px-1 py-1 text-xs">
                      {getStudentFullName(student)}
                    </td>
                    <td className="text-center px-1 py-1 text-xs">{getPaymentMethodLabel(method)}</td>
                    {academicMonths.map(month => {
                      const year = parseInt(month.key, 10) >= 9 ? selectedYear : selectedYear + 1;
                      const monthKey = getMonthKey(month.key, year);
                      const display = getCellDisplay(student, month.key, method);
                      const isEditing = editingCell?.studentId === student.id && editingCell?.month === monthKey;

                      return (
                        <td key={month.key} className="p-0.5 align-top text-center">
                          {isEditing ? (
                            <div className="space-y-1">
                              <Input
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                                className="h-8 text-center"
                                autoFocus
                              />
                              <div className="flex gap-1 justify-center">
                                <Button size="sm" className="h-7 px-2" onClick={handleSaveEdit}>שמור</Button>
                                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setEditingCell(null)}>ביטול</Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!display.clickable}
                              onClick={() => display.clickable && handleCellClick(student.id, month.key, getPaymentForMonth(student.id, month.key)?.status || 'not_paid', method)}
                              className={`w-full rounded-md px-2 py-1 text-center text-xs ${display.className} ${!display.clickable ? 'cursor-default' : ''}`}
                            >
                              {display.text}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center font-semibold px-1 py-1 text-xs">₪{formatCurrencyAmount(totalPaid)}</td>
                    <td className="text-center font-semibold px-2 py-2">
                      {(() => {
                        const remaining = Math.max(0, annualTarget - totalPaid);
                        if (remaining <= 0) {
                          return <span className="text-green-700">✓ שולם במלואו</span>;
                        }
                        return <span className="text-[#8B2942]">₪{formatCurrencyAmount(remaining)}</span>;
                      })()}
                    </td>
                    <td className="text-center font-semibold px-2 py-2">₪{formatCurrencyAmount(annualTarget)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderFixedMonthlyView = () => (
    <div className="relative rounded-lg border overflow-auto max-h-[68vh] bg-background" dir="rtl">
      <Table className="w-full min-w-[760px] table-fixed">
        <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
          <TableRow>
            <TableHead className="sticky top-0 right-0 z-40 bg-primary/20 dark:bg-primary/40 text-foreground border-b border-border text-right min-w-[220px] w-[220px]">שם תלמידה</TableHead>
            <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[120px] w-[120px]">אמצעי תשלום</TableHead>
            <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[120px] w-[120px]">סכום חודשי</TableHead>
            <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[180px] w-[180px]">סטטוס תשלום</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredStudents.map(student => {
            const method = getStudentPaymentMethod(student.id);
            const display = getCellDisplay(student, selectedMonth, method);
            return (
              <TableRow key={student.id} className="hover:bg-muted/40">
                <TableCell className="sticky right-0 z-20 bg-accent/55 dark:bg-accent/35 text-foreground text-right shadow-[-1px_0_0_0_hsl(var(--border))] font-semibold">
                  {getStudentFullName(student)}
                </TableCell>
                <TableCell className="text-right">{getPaymentMethodLabel(method)}</TableCell>
                <TableCell className="text-right">₪{formatCurrencyAmount(student.monthlyAmount || 0)}</TableCell>
                <TableCell className="text-right">
                  <div className={`inline-flex rounded-md px-3 py-1 text-sm ${display.className}`}>{display.text}</div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  const renderPerLessonView = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Coins className="h-4 w-4" />
        <span>{perLessonStudents.length} תלמידות בתשלום לפי שיעור</span>
      </div>
      <div className="relative rounded-lg border overflow-auto max-h-[68vh] bg-background" dir="rtl">
        <Table className="w-full min-w-[1100px] table-fixed">
          <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
            <TableRow>
              <TableHead className="sticky top-0 right-0 z-40 bg-primary/20 dark:bg-primary/40 text-foreground border-b border-border text-right min-w-[220px] w-[220px]">תלמידה</TableHead>
              <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[110px] w-[110px]">מחיר/שיעור</TableHead>
              <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[110px] w-[110px]">שיעורים שניתנו</TableHead>
              <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[110px] w-[110px]">חיוב כולל</TableHead>
              <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[110px] w-[110px]">שולם</TableHead>
              <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[130px] w-[130px]">מאזן</TableHead>
              <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[130px] w-[130px]">סכום לתשלום</TableHead>
              <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[170px] w-[170px]">פעולה</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {perLessonStudents.map(student => {
              const summary = getPerLessonStudentSummary(student);

              return (
                <TableRow key={student.id} className="hover:bg-muted/40">
                  <TableCell className="sticky right-0 z-20 bg-accent/55 dark:bg-accent/35 text-foreground text-right shadow-[-1px_0_0_0_hsl(var(--border))] font-semibold">
                    {getStudentFullName(student)}
                  </TableCell>
                  <TableCell className="text-right">₪{formatCurrencyAmount(student.lessonPrice || 0)}</TableCell>
                  <TableCell className="text-right">{summary.completedLessons}</TableCell>
                  <TableCell className="text-right">₪{formatCurrencyAmount(summary.totalDue)}</TableCell>
                  <TableCell className="text-right text-green-600 font-medium">₪{formatCurrencyAmount(summary.totalPaid)}</TableCell>
                  <TableCell className={`text-right font-bold ${summary.totalBalance < 0 ? 'text-destructive' : summary.totalBalance > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {summary.totalBalance < 0
                      ? `חוב ₪${formatCurrencyAmount(Math.abs(summary.totalBalance))}`
                      : summary.totalBalance > 0
                        ? `זכות ₪${formatCurrencyAmount(summary.totalBalance)}`
                        : 'מאוזן'}
                  </TableCell>
                  <TableCell className={`text-right ${summary.amountToPay > 0 ? 'text-destructive font-bold' : ''}`}>
                    {summary.amountToPay > 0 ? `₪${formatCurrencyAmount(summary.amountToPay)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-start">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPerLessonStudent(student);
                          setPerLessonPaymentAmount(summary.amountToPay > 0 ? summary.amountToPay.toString() : '');
                          setPerLessonPaymentDate(new Date().toISOString().split('T')[0]);
                          setPerLessonPaymentNotes('');
                          setShowPerLessonPaymentDialog(true);
                        }}
                      >
                        <Plus className="h-3 w-3 ml-1" />
                        רשום תשלום
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedStudentForHistory(student);
                          setShowPerLessonHistoryDialog(true);
                        }}
                      >
                        <Calendar className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const renderAllPaymentsAnnualView = () => {
    const yearlyTotal = academicMonths.reduce((sum, month) => sum + getAllPaymentsBreakdownForMonth(month.key).total, 0);
    const yearlyTithe = yearlyTotal * 0.1;
    const rows = [
      { key: 'checks', label: "תשלומים קבועים צ'קים", value: (monthKey: string) => getAllPaymentsBreakdownForMonth(monthKey).regularChecks, rowClass: 'bg-primary/5 dark:bg-muted/95 dark:bg-muted/80 hover:bg-muted/95 dark:bg-muted/80 dark:hover:bg-primary/15', firstCellClass: 'bg-primary/30 dark:bg-primary/50 text-foreground', valueClass: 'text-foreground' },
      { key: 'bank', label: 'תשלומים קבועים בנק', value: (monthKey: string) => getAllPaymentsBreakdownForMonth(monthKey).regularBank, rowClass: 'bg-accent/20 dark:bg-accent/15 hover:bg-accent/30 dark:hover:bg-accent/20', firstCellClass: 'bg-accent/60 dark:bg-accent/35 text-foreground', valueClass: 'text-foreground' },
      { key: 'perLesson', label: 'תשלומים תלמידות ח"פ', value: (monthKey: string) => getAllPaymentsBreakdownForMonth(monthKey).perLesson, rowClass: 'bg-secondary/20 dark:bg-secondary/25 hover:bg-secondary/30 dark:hover:bg-secondary/35', firstCellClass: 'bg-secondary/50 dark:bg-secondary/40 text-secondary-foreground', valueClass: 'text-foreground' },
      { key: 'performances', label: 'תשלומים הופעות', value: (monthKey: string) => getAllPaymentsBreakdownForMonth(monthKey).performances, rowClass: 'bg-muted/40 dark:bg-muted/30 hover:bg-muted/60 dark:hover:bg-muted/40', firstCellClass: 'bg-muted dark:bg-muted/60 text-foreground', valueClass: 'text-foreground' },
      { key: 'other', label: 'תשלומים אחר', value: (monthKey: string) => getAllPaymentsBreakdownForMonth(monthKey).other, rowClass: 'bg-primary/15 dark:bg-primary/20 hover:bg-primary/20 dark:hover:bg-primary/25', firstCellClass: 'bg-primary/40 dark:bg-primary/55 text-foreground', valueClass: 'text-foreground' },
    ];

    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">בשורת "תשלומים אחר" נכללים תשלומים חד-פעמיים כלליים, וכן תשלומים קבועים שסומנו כמזומן.</p>
        <div className="rounded-lg border bg-background overflow-hidden">
          <div className="max-h-[68vh] overflow-auto" dir="rtl">
            <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0">
              <thead className="sticky top-0 z-30 bg-background shadow-sm">
                <tr>
                  <th className="sticky top-0 right-0 z-40 bg-primary/25 dark:bg-primary/45 text-foreground border-b border-border text-right min-w-[200px] w-[200px] px-3 py-3 font-bold">סוג תשלום</th>
                  {academicMonths.map(month => (
                    <th key={month.key} className="sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[100px] w-[100px] px-2 py-3 font-bold">{month.name}</th>
                  ))}
                  <th className="sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[120px] w-[120px] px-2 py-3 font-bold">סה"כ שנה</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const rowTotal = academicMonths.reduce((sum, month) => sum + row.value(month.key), 0);
                  return (
                    <tr key={row.key} className={row.rowClass}>
                      <td className={`sticky right-0 z-20 text-right shadow-[-1px_0_0_0_hsl(var(--border))] font-semibold px-3 py-3 ${row.firstCellClass}`}>{row.label}</td>
                      {academicMonths.map(month => {
                        const value = row.value(month.key);
                        return <td key={month.key} className={`text-center px-2 py-3 ${row.valueClass}`}>{value > 0 ? `₪${formatCurrencyAmount(value)}` : '-'}</td>;
                      })}
                      <td className={`text-center font-semibold px-2 py-3 ${row.valueClass}`}>₪{formatCurrencyAmount(rowTotal)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-primary/12 dark:bg-primary/20 font-bold">
                  <td className="sticky right-0 z-20 bg-primary/30 dark:bg-primary/45 text-foreground text-right shadow-[-1px_0_0_0_hsl(var(--border))] px-3 py-3">סה"כ חודשי</td>
                  {academicMonths.map(month => {
                    const breakdown = getAllPaymentsBreakdownForMonth(month.key);
                    return <td key={month.key} className="text-center text-foreground px-2 py-3">₪{formatCurrencyAmount(breakdown.total)}</td>;
                  })}
                  <td className="text-center text-foreground px-2 py-3">₪{formatCurrencyAmount(yearlyTotal)}</td>
                </tr>
                <tr className="bg-accent/20 dark:bg-accent/15">
                  <td className="sticky right-0 z-20 bg-accent/70 dark:bg-accent/35 text-foreground font-semibold text-right shadow-[-1px_0_0_0_hsl(var(--border))] px-3 py-3">מעשר</td>
                  {academicMonths.map(month => {
                    const breakdown = getAllPaymentsBreakdownForMonth(month.key);
                    const isPaid = tithePaid[breakdown.monthKey] || false;
                    return (
                      <td key={month.key} className="align-top px-2 py-3">
                        <div className="space-y-2 text-center">
                          <div className="font-semibold text-foreground">₪{formatCurrencyAmount(breakdown.tithe)}</div>
                          <div className="flex flex-col gap-1">
                            <Button size="sm" variant="outline" onClick={() => handleTitheToggle(breakdown.monthKey, true)} className={`h-7 text-xs ${isPaid ? 'bg-primary/15 dark:bg-primary/30 border-primary/30 text-foreground' : 'bg-background'}`}>הופרש</Button>
                            <Button size="sm" variant="outline" onClick={() => handleTitheToggle(breakdown.monthKey, false)} className={`h-7 text-xs ${!isPaid ? 'bg-accent/60 dark:bg-accent/35 border-primary/20 text-foreground' : 'bg-background'}`}>לא הופרש</Button>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-center font-semibold text-foreground px-2 py-3">₪{formatCurrencyAmount(yearlyTithe)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Performances & other-payments details now live in dedicated top-level tabs */}
      </div>
    );
  };

  // Yearly detail aggregations (per-payment rows that fell within the academic year)
  const getYearlyAcademicRange = () => {
    // Academic year runs Sep selectedYear → Aug selectedYear+1
    const monthKeys = academicMonths.map(m => getAcademicMonthKey(m.key));
    return new Set(monthKeys);
  };

  const getPerformancePaymentsForYearDetailed = () => {
    const validMonths = getYearlyAcademicRange();
    const out: Array<{
      paymentId: string;
      performance: Performance;
      paymentDate: string;
      paidAmount: number;
      method?: string;
    }> = [];
    getPerformances().forEach(perf => {
      (perf.performancePayments || []).forEach(pp => {
        const monthKey = (pp.date || '').slice(0, 7);
        if (validMonths.has(monthKey)) {
          out.push({
            paymentId: pp.id,
            performance: perf,
            paymentDate: pp.date,
            paidAmount: pp.amount || 0,
            method: pp.method,
          });
        }
      });
    });
    return out.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  };

  const getOneTimePaymentsForYearDetailed = () => {
    const validMonths = getYearlyAcademicRange();
    return oneTimePayments
      .filter(p => validMonths.has(p.month))
      .slice()
      .sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''));
  };

  const [annualDetailTab, setAnnualDetailTab] = useState<'performances' | 'other'>('performances');

  const renderAnnualPaymentsDetailTabs = () => {
    const yearPerfRows = getPerformancePaymentsForYearDetailed();
    const yearOther = getOneTimePaymentsForYearDetailed();
    const yearPerfTotal = yearPerfRows.reduce((s, r) => s + r.paidAmount, 0);
    const yearOtherTotal = yearOther.reduce((s, p) => s + p.amount, 0);

    return (
      <Card className="mt-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={annualDetailTab === 'performances' ? 'default' : 'outline'} onClick={() => setAnnualDetailTab('performances')}>
              תשלומי הופעות שנתי ({yearPerfRows.length}) — ₪{formatCurrencyAmount(yearPerfTotal)}
            </Button>
            <Button size="sm" variant={annualDetailTab === 'other' ? 'default' : 'outline'} onClick={() => setAnnualDetailTab('other')}>
              תשלומים אחרים שנתי ({yearOther.length}) — ₪{formatCurrencyAmount(yearOtherTotal)}
            </Button>
            <span className="text-xs text-muted-foreground mr-auto">סיכומים מבוססים על תשלומים שהתקבלו בפועל בשנה הנבחרת. נסיעות אינן נכללות.</span>
          </div>

          {annualDetailTab === 'performances' && (
            yearPerfRows.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded">לא נרשמו תשלומי הופעות בשנה זו</div>
            ) : (
              <div className="rounded-lg border overflow-auto max-h-[40vh]" dir="rtl">
                <Table className="w-full min-w-[900px] table-fixed">
                  <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
                    <TableRow>
                      <TableHead className="text-right">הופעה</TableHead>
                      <TableHead className="text-right">לקוחה</TableHead>
                      <TableHead className="text-right">תאריך הופעה</TableHead>
                      <TableHead className="text-right">תאריך תשלום</TableHead>
                      <TableHead className="text-right">סכום ששולם</TableHead>
                      <TableHead className="text-right">סטטוס</TableHead>
                      <TableHead className="text-right">נסיעות (מידע)</TableHead>
                      <TableHead className="text-center">עריכה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yearPerfRows.map(row => {
                      const status = getPerformancePaymentStatus(row.performance);
                      const totalDue = row.performance.amount || 0;
                      const totalPaid = getPerformancePaidTotal(row.performance);
                      return (
                        <TableRow key={row.paymentId} className="hover:bg-muted/40">
                          <TableCell className="text-right font-semibold">{row.performance.name}</TableCell>
                          <TableCell className="text-right">{row.performance.client || '-'}</TableCell>
                          <TableCell className="text-right">{formatDate(row.performance.date)}</TableCell>
                          <TableCell className="text-right">{formatDisplayDate(row.paymentDate)}</TableCell>
                          <TableCell className="text-right font-semibold">₪{formatCurrencyAmount(row.paidAmount)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : status === 'partial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'}`}>
                              {status === 'paid' ? 'שולם' : status === 'partial' ? `חלקי ₪${formatCurrencyAmount(totalPaid)}/₪${formatCurrencyAmount(totalDue)}` : 'לא שולם'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{row.performance.travel ? `₪${formatCurrencyAmount(row.performance.travel)}` : '-'}</TableCell>
                          <TableCell className="text-center">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingPerformance(row.performance); setShowEditPerformanceDialog(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )
          )}

          {annualDetailTab === 'other' && (
            yearOther.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded">לא נרשמו תשלומים אחרים בשנה זו</div>
            ) : (
              <div className="rounded-lg border overflow-auto max-h-[40vh]" dir="rtl">
                <Table className="w-full min-w-[700px] table-fixed">
                  <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
                    <TableRow>
                      <TableHead className="text-right">תיאור</TableHead>
                      <TableHead className="text-right">תאריך תשלום</TableHead>
                      <TableHead className="text-right">חודש דיווח</TableHead>
                      <TableHead className="text-right">סכום</TableHead>
                      <TableHead className="text-center">עריכה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yearOther.map(payment => (
                      <TableRow key={payment.id} className="hover:bg-muted/40">
                        <TableCell className="text-right">{payment.description}</TableCell>
                        <TableCell className="text-right">{formatDate(payment.paidDate)}</TableCell>
                        <TableCell className="text-right">{payment.month}</TableCell>
                        <TableCell className="text-right font-semibold">₪{formatCurrencyAmount(payment.amount)}</TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingOneTimePayment(payment); setShowEditOneTimeDialog(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          )}
        </CardContent>
      </Card>
    );
  };

  const renderAllPaymentsDailyView = () => {
    const dailyRows = getDailyAllPaymentsRows();
    const monthLabel = academicMonths.find(month => month.key === selectedMonth)?.fullName || '';

    if (dailyRows.length === 0) {
      return <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">אין תשלומים יומיים להצגה עבור {monthLabel}</div>;
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">פירוט יומי עבור {monthLabel}</p>
        <div className="relative rounded-lg border overflow-auto max-h-[68vh] bg-background" dir="rtl">
          <Table className="w-full min-w-[980px] table-fixed">
            <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
              <TableRow>
                <TableHead className="sticky top-0 right-0 z-40 bg-primary/20 dark:bg-primary/40 text-foreground border-b border-border text-right min-w-[130px] w-[130px]">תאריך</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[110px] w-[110px]">קבועים צ'קים</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[110px] w-[110px]">קבועים בנק</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[110px] w-[110px]">תלמידות ח"פ</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[110px] w-[110px]">הופעות</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[110px] w-[110px]">אחר</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[110px] w-[110px]">סה"כ</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[110px] w-[110px]">מעשר</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyRows.map(row => (
                <TableRow key={row.date} className="hover:bg-muted/40">
                  <TableCell className="sticky right-0 z-20 bg-accent/55 dark:bg-accent/35 text-foreground text-right shadow-[-1px_0_0_0_hsl(var(--border))] font-semibold">{formatDate(row.date)}</TableCell>
                  <TableCell className="text-center">{row.regularChecks > 0 ? `₪${formatCurrencyAmount(row.regularChecks)}` : '-'}</TableCell>
                  <TableCell className="text-center">{row.regularBank > 0 ? `₪${formatCurrencyAmount(row.regularBank)}` : '-'}</TableCell>
                  <TableCell className="text-center">{row.perLesson > 0 ? `₪${formatCurrencyAmount(row.perLesson)}` : '-'}</TableCell>
                  <TableCell className="text-center">{row.performances > 0 ? `₪${formatCurrencyAmount(row.performances)}` : '-'}</TableCell>
                  <TableCell className="text-center">{row.other > 0 ? `₪${formatCurrencyAmount(row.other)}` : '-'}</TableCell>
                  <TableCell className="text-center font-bold text-emerald-700 dark:text-emerald-300">₪{formatCurrencyAmount(row.total)}</TableCell>
                  <TableCell className="text-center text-amber-700 dark:text-amber-300">₪{formatCurrencyAmount(row.tithe)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const renderAllPaymentsMonthlyView = () => {
    const breakdown = getAllPaymentsBreakdownForMonth(selectedMonth);
    const monthLabel = academicMonths.find(month => month.key === selectedMonth)?.fullName || 'בחר חודש';
    const monthKey = getAcademicMonthKey(selectedMonth);
    const isPaid = tithePaid[monthKey] || false;
    const monthOtherPayments = getOneTimePaymentsForMonthDetailed(selectedMonth);
    const monthPerformances = getPerformancesForMonthDetailed(selectedMonth);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="rounded-lg border p-3 bg-background"><div className="text-xs text-muted-foreground">קבועים צ'קים</div><div className="font-bold">₪{formatCurrencyAmount(breakdown.regularChecks)}</div></div>
          <div className="rounded-lg border p-3 bg-background"><div className="text-xs text-muted-foreground">קבועים בנק</div><div className="font-bold">₪{formatCurrencyAmount(breakdown.regularBank)}</div></div>
          <div className="rounded-lg border p-3 bg-background"><div className="text-xs text-muted-foreground">תלמידות ח"פ</div><div className="font-bold">₪{formatCurrencyAmount(breakdown.perLesson)}</div></div>
          <div className="rounded-lg border p-3 bg-background"><div className="text-xs text-muted-foreground">הופעות</div><div className="font-bold">₪{formatCurrencyAmount(breakdown.performances)}</div></div>
          <div className="rounded-lg border p-3 bg-background"><div className="text-xs text-muted-foreground">אחר</div><div className="font-bold">₪{formatCurrencyAmount(breakdown.other)}</div></div>
          <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60"><div className="text-xs text-muted-foreground">סה"כ {monthLabel}</div><div className="font-bold text-emerald-700 dark:text-emerald-300">₪{formatCurrencyAmount(breakdown.total)}</div></div>
        </div>

        <div className="rounded-lg border overflow-auto max-h-[44vh]" dir="rtl">
          <Table className="w-full min-w-[760px] table-fixed">
            <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
              <TableRow>
                <TableHead className="sticky top-0 right-0 z-40 bg-primary/20 dark:bg-primary/40 text-foreground border-b border-border text-right min-w-[220px] w-[220px]">שם תלמידה</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[120px] w-[120px]">אמצעי תשלום</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[120px] w-[120px]">סכום חודשי</TableHead>
                <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[180px] w-[180px]">סטטוס תשלום</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {annualStudents.map(student => {
                const method = getStudentPaymentMethod(student.id);
                const display = getCellDisplay(student, selectedMonth, method);
                return (
                  <TableRow key={student.id} className="hover:bg-muted/40">
                    <TableCell className="sticky right-0 z-20 bg-accent/55 dark:bg-accent/35 text-foreground text-right shadow-[-1px_0_0_0_hsl(var(--border))] font-semibold">{getStudentFullName(student)}</TableCell>
                    <TableCell className="text-right">{getPaymentMethodLabel(method)}</TableCell>
                    <TableCell className="text-right">₪{formatCurrencyAmount(student.monthlyAmount || 0)}</TableCell>
                    <TableCell className="text-right"><div className={`inline-flex rounded-md px-3 py-1 text-sm ${display.className}`}>{display.text}</div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {monthOtherPayments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פירוט תשלומים אחרים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-auto max-h-[260px]" dir="rtl">
                <Table className="w-full min-w-[760px] table-fixed">
                  <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
                    <TableRow>
                      <TableHead className="sticky top-0 right-0 z-40 bg-primary/20 dark:bg-primary/40 text-foreground border-b border-border text-right min-w-[260px] w-[260px]">תיאור</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[130px] w-[130px]">תאריך תשלום</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[130px] w-[130px]">חודש דיווח</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[120px] w-[120px]">סכום</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[90px] w-[90px]">עריכה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthOtherPayments.map(payment => (
                      <TableRow key={payment.id} className="hover:bg-muted/40">
                        <TableCell className="sticky right-0 z-20 bg-accent/55 dark:bg-accent/35 text-foreground text-right shadow-[-1px_0_0_0_hsl(var(--border))]">{payment.description}</TableCell>
                        <TableCell className="text-right">{formatDate(payment.paidDate)}</TableCell>
                        <TableCell className="text-right">{payment.month}</TableCell>
                        <TableCell className="text-right font-semibold">₪{formatCurrencyAmount(payment.amount)}</TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingOneTimePayment(payment); setShowEditOneTimeDialog(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {calculatePerLessonTotalForMonth(selectedMonth) > 0 && (
          <Card className="bg-[hsl(0,65%,35%)] border-[hsl(0,65%,35%)]"><CardContent className="pt-6"><h4 className="font-bold mb-2 text-[hsl(45,95%,55%)] flex items-center gap-2"><Coins className="h-4 w-4" />הכנסות משיעורים חד-פעמיים</h4><div className="space-y-2">{calculatePerLessonPaymentsForMonth(selectedMonth).map(plp => { const student = students.find(s => s.id === plp.studentId); return (<div key={plp.id} className="flex justify-between items-center text-sm group"><div className="flex items-center gap-2"><span className="text-[hsl(45,95%,55%)]">{student ? getStudentFullName(student) : 'תלמידה'}</span><span className="text-[hsl(45,95%,55%)]/70 text-xs">({formatDisplayDate(plp.paymentDate)})</span><Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditingPerLessonPayment(plp); setShowEditPerLessonDialog(true); }}><Pencil className="h-3 w-3 text-[hsl(45,95%,55%)]" /></Button></div><span className="font-semibold text-[hsl(45,95%,55%)]">₪{formatCurrencyAmount(plp.amount)}</span></div>); })}</div></CardContent></Card>
        )}

        {monthPerformances.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פירוט תשלומי הופעות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-auto max-h-[260px]" dir="rtl">
                <Table className="w-full min-w-[980px] table-fixed">
                  <TableHeader className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
                    <TableRow>
                      <TableHead className="sticky top-0 right-0 z-40 bg-primary/20 dark:bg-primary/40 text-foreground border-b border-border text-right min-w-[220px] w-[220px]">הופעה</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[160px] w-[160px]">לקוחה</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[120px] w-[120px]">תאריך הופעה</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[120px] w-[120px]">תאריך תשלום</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[110px] w-[110px]">סכום ששולם</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[110px] w-[110px]">סטטוס</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-right min-w-[140px] w-[140px]">נסיעות (מידע)</TableHead>
                      <TableHead className="sticky top-0 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border text-center min-w-[90px] w-[90px]">עריכה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthPerformances.map(row => {
                      const status = getPerformancePaymentStatus(row.performance);
                      const totalDue = row.performance.amount || 0;
                      const totalPaid = getPerformancePaidTotal(row.performance);
                      return (
                        <TableRow key={row.paymentId} className="hover:bg-muted/40">
                          <TableCell className="sticky right-0 z-20 bg-accent/55 dark:bg-accent/35 text-foreground text-right shadow-[-1px_0_0_0_hsl(var(--border))] font-semibold">{row.performance.name}</TableCell>
                          <TableCell className="text-right">{row.performance.client || '-'}</TableCell>
                          <TableCell className="text-right">{formatDate(row.performance.date)}</TableCell>
                          <TableCell className="text-right">{formatDisplayDate(row.paymentDate)}</TableCell>
                          <TableCell className="text-right font-semibold">₪{formatCurrencyAmount(row.paidAmount)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : status === 'partial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'}`}>
                              {status === 'paid' ? 'שולם' : status === 'partial' ? `חלקי ₪${formatCurrencyAmount(totalPaid)}/₪${formatCurrencyAmount(totalDue)}` : 'לא שולם'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{row.performance.travel ? `₪${formatCurrencyAmount(row.performance.travel)}` : '-'}</TableCell>
                          <TableCell className="text-center">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingPerformance(row.performance); setShowEditPerformanceDialog(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center"><h4 className="font-bold text-foreground">מעשר (10%)</h4><div className="text-xl font-bold text-amber-700 dark:text-amber-300">₪{formatCurrencyAmount(breakdown.tithe)}</div></div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleTitheToggle(monthKey, true)} className={`flex-1 ${isPaid ? 'bg-green-100 border-green-300 text-emerald-700 dark:text-emerald-300 hover:bg-green-200' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}>הופרש</Button>
                <Button variant="outline" onClick={() => handleTitheToggle(monthKey, false)} className={`flex-1 ${!isPaid ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}>לא הופרש</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const openOneTimePaymentDialog = () => {
    const now = new Date();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const useSelectedMonth = fixedPaymentsView === 'monthly' || allPaymentsView === 'monthly' || allPaymentsView === 'daily';
    const defaultMonthNum = useSelectedMonth && selectedMonth ? selectedMonth : currentMonth;

    setNewOneTimePayment({ description: '', amount: '', monthNum: defaultMonthNum, baseYear: selectedYear });
    setShowOneTimeDialog(true);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <Card className="card-gradient card-shadow">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-2xl flex items-center gap-2">
              <CreditCard className="h-6 w-4" />
              ניהול תשלומים - תלמידות
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {academicYearOptions.map(year => (
                    <SelectItem key={year} value={String(year)}>{year}-{String(year + 1).slice(-2)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={openOneTimePaymentDialog} variant="outline">+ תשלום אחר</Button>
              <Button onClick={handleDownloadJSON} variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                שמור JSON
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant={activePaymentsTab === 'all' ? 'default' : 'outline'} onClick={() => setActivePaymentsTab('all')}>כל התשלומים</Button>
            <Button variant={activePaymentsTab === 'fixed' ? 'default' : 'outline'} onClick={() => setActivePaymentsTab('fixed')}>תשלומים קבועים</Button>
            <Button variant={activePaymentsTab === 'perLesson' ? 'default' : 'outline'} onClick={() => setActivePaymentsTab('perLesson')}>תשלומים ח"פ</Button>
            <Button variant={activePaymentsTab === 'performances' ? 'default' : 'outline'} onClick={() => setActivePaymentsTab('performances')}>תשלומי הופעות</Button>
            <Button variant={activePaymentsTab === 'other' ? 'default' : 'outline'} onClick={() => setActivePaymentsTab('other')}>תשלומים אחרים</Button>
          </div>

          {activePaymentsTab === 'fixed' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              <Select value={fixedPaymentsView} onValueChange={(value: 'annual' | 'monthly') => setFixedPaymentsView(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">תצוגה שנתית</SelectItem>
                  <SelectItem value="monthly">תצוגה חודשית</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fixedPaymentsView === 'monthly' ? selectedMonth : regularMonthFilter} onValueChange={(value) => {
                if (fixedPaymentsView === 'monthly') setSelectedMonth(value); else setRegularMonthFilter(value);
              }}>
                <SelectTrigger><SelectValue placeholder={fixedPaymentsView === 'monthly' ? 'בחר חודש' : 'כל החודשים'} /></SelectTrigger>
                <SelectContent>
                  {fixedPaymentsView === 'annual' && <SelectItem value="all">כל החודשים</SelectItem>}
                  {academicMonths.map(month => <SelectItem key={month.key} value={month.key}>{month.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)} placeholder="חיפוש לפי שם תלמידה" />
              <Select value={filterMethod} onValueChange={setFilterMethod}>
                <SelectTrigger><SelectValue placeholder="צורת תשלום" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל אמצעי התשלום</SelectItem>
                  <SelectItem value="bank">בנק</SelectItem>
                  <SelectItem value="check">צ'ק</SelectItem>
                  <SelectItem value="cash">מזומן</SelectItem>
                  <SelectItem value="inactive">לא פעיל</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue placeholder="סטטוס תשלום" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסטטוסים</SelectItem>
                  <SelectItem value="paid">שולם</SelectItem>
                  <SelectItem value="pending">ממתין</SelectItem>
                  <SelectItem value="not_paid">לא שולם</SelectItem>
                  <SelectItem value="debt">חוב</SelectItem>
                  <SelectItem value="inactive">לא פעיל</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {activePaymentsTab === 'all' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select value={allPaymentsView} onValueChange={(value: 'annual' | 'monthly' | 'daily') => setAllPaymentsView(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">תצוגה שנתית</SelectItem>
                  <SelectItem value="monthly">תצוגה חודשית</SelectItem>
                  <SelectItem value="daily">תצוגה יומית</SelectItem>
                </SelectContent>
              </Select>
              {allPaymentsView !== 'annual' && (
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger><SelectValue placeholder="בחר חודש" /></SelectTrigger>
                  <SelectContent>
                    {academicMonths.map(month => <SelectItem key={month.key} value={month.key}>{month.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center rounded-md border px-3 text-sm text-muted-foreground">שנה"ל {selectedYear}-{String(selectedYear + 1).slice(-2)}</div>
            </div>
          )}

          {activePaymentsTab === 'performances' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select value={performancesView} onValueChange={(v: 'annual' | 'monthly') => setPerformancesView(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">תצוגה שנתית</SelectItem>
                  <SelectItem value="monthly">תצוגה חודשית</SelectItem>
                </SelectContent>
              </Select>
              {performancesView === 'monthly' && (
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger><SelectValue placeholder="בחר חודש" /></SelectTrigger>
                  <SelectContent>
                    {academicMonths.map(month => <SelectItem key={month.key} value={month.key}>{month.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center rounded-md border px-3 text-sm text-muted-foreground">שנה"ל {selectedYear}-{String(selectedYear + 1).slice(-2)} · נסיעות לא נכללות בהכנסה</div>
            </div>
          )}

          {activePaymentsTab === 'other' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select value={otherView} onValueChange={(v: 'annual' | 'monthly') => setOtherView(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">תצוגה שנתית</SelectItem>
                  <SelectItem value="monthly">תצוגה חודשית</SelectItem>
                </SelectContent>
              </Select>
              {otherView === 'monthly' && (
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger><SelectValue placeholder="בחר חודש" /></SelectTrigger>
                  <SelectContent>
                    {academicMonths.map(month => <SelectItem key={month.key} value={month.key}>{month.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center rounded-md border px-3 text-sm text-muted-foreground">שנה"ל {selectedYear}-{String(selectedYear + 1).slice(-2)}</div>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {activePaymentsTab === 'fixed' && (fixedPaymentsView === 'annual' ? renderFixedAnnualView() : renderFixedMonthlyView())}
          {activePaymentsTab === 'perLesson' && renderPerLessonView()}
          {activePaymentsTab === 'all' && (allPaymentsView === 'annual' ? renderAllPaymentsAnnualView() : allPaymentsView === 'monthly' ? renderAllPaymentsMonthlyView() : renderAllPaymentsDailyView())}
          {activePaymentsTab === 'performances' && (performancesView === 'annual' ? renderPerformancesAnnualTab() : renderPerformancesMonthlyTab())}
          {activePaymentsTab === 'other' && (otherView === 'annual' ? renderOtherAnnualTab() : renderOtherMonthlyTab())}
        </CardContent>
      </Card>

{/* דיאלוג תשלום חד פעמי */}
<Dialog open={showOneTimeDialog} onOpenChange={setShowOneTimeDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>הוספת תשלום חד פעמי</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="payment-description">תיאור</Label>
        <Input
          id="payment-description"
          value={newOneTimePayment.description}
          onChange={(e) => setNewOneTimePayment({ ...newOneTimePayment, description: e.target.value })}
          placeholder="לדוגמה: השלמה לחודש ינואר"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="payment-amount">סכום</Label>
        <NumberStepper
          id="payment-amount"
          value={Number(newOneTimePayment.amount) || 0}
          onValueChange={(n) => setNewOneTimePayment({ ...newOneTimePayment, amount: String(n) })}
          step={10}
          allowDecimals
          unit="₪"
          placeholder="0"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="payment-year">שנה</Label>
        <Select
          value={String(newOneTimePayment.baseYear)}
          onValueChange={(value) => setNewOneTimePayment({ ...newOneTimePayment, baseYear: Number(value) })}
        >
          <SelectTrigger id="payment-year">
            <SelectValue placeholder="בחר שנה" />
          </SelectTrigger>
          <SelectContent>
            {academicYearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="payment-month">חודש</Label>
        <Select
          value={newOneTimePayment.monthNum}
          onValueChange={(value) => setNewOneTimePayment({ ...newOneTimePayment, monthNum: value })}
        >
          <SelectTrigger id="payment-month">
            <SelectValue placeholder="בחר חודש" />
          </SelectTrigger>
          <SelectContent>
            {academicMonths.map((month) => {
              const baseYear = Number(newOneTimePayment.baseYear || selectedYear);
              const year = parseInt(month.key, 10) >= 9 ? baseYear : baseYear + 1;
              return (
                <SelectItem key={month.key} value={month.key}>
                  {month.fullName} {year}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleAddOneTimePayment} className="flex-1">הוסף</Button>
        <Button variant="outline" onClick={() => setShowOneTimeDialog(false)}>ביטול</Button>
      </div>
    </div>
  </DialogContent>
</Dialog>

{/* Per-Lesson Payment Dialog - Amount based with date */}
      <Dialog open={showPerLessonPaymentDialog} onOpenChange={setShowPerLessonPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>רישום תשלום - שיעורים חד-פעמיים</DialogTitle>
          </DialogHeader>
          {selectedPerLessonStudent && (() => {
            const lessonPrice = selectedPerLessonStudent.lessonPrice || 0;
            const currentBalance = selectedPerLessonStudent.perLessonBalance || 0;
            const amount = parseFloat(perLessonPaymentAmount) || 0;
            const totalAvailable = amount + currentBalance;
            const lessonsCovered = lessonPrice > 0 ? Math.floor(totalAvailable / lessonPrice) : 0;
            const newBalance = lessonPrice > 0 ? totalAvailable - (lessonsCovered * lessonPrice) : 0;
            const summary = getPerLessonStudentSummary(selectedPerLessonStudent);
            
            return (
              <div className="space-y-4">
                <div className="p-4 bg-secondary/30 rounded-lg">
                  <p className="font-bold text-lg">{selectedPerLessonStudent.firstName} {selectedPerLessonStudent.lastName}</p>
                  <p className="text-sm text-muted-foreground">מחיר לשיעור: ₪{formatCurrencyAmount(lessonPrice)}</p>
                  {currentBalance > 0 && (
                    <p className="text-sm text-green-600">יתרה קיימת לזכות: ₪{formatCurrencyAmount(currentBalance)}</p>
                  )}
                  <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">שיעורים שניתנו:</span>
                      <span className="font-bold mr-1">{summary.completedLessons}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">חיוב כולל:</span>
                      <span className="font-bold mr-1">₪{formatCurrencyAmount(summary.totalDue)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">שולם:</span>
                      <span className="font-bold text-green-600 mr-1">₪{formatCurrencyAmount(summary.totalPaid)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">מאזן:</span>
                      <span
                        className={`font-bold mr-1 ${summary.totalBalance < 0 ? 'text-destructive' : summary.totalBalance > 0 ? 'text-green-600' : ''}`}
                      >
                        {summary.totalBalance < 0
                          ? `חוב ₪${formatCurrencyAmount(Math.abs(summary.totalBalance))}`
                          : summary.totalBalance > 0
                            ? `זכות ₪${formatCurrencyAmount(summary.totalBalance)}`
                            : 'מאוזן'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="payment-date">תאריך תשלום</Label>
                  <Input
                    id="payment-date"
                    type="date"
                    value={perLessonPaymentDate}
                    onChange={(e) => setPerLessonPaymentDate(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="payment-amount">סכום ששולם</Label>
                  <NumberStepper
                    id="payment-amount"
                    value={Number(perLessonPaymentAmount) || 0}
                    onValueChange={(n) => setPerLessonPaymentAmount(String(n))}
                    step={10}
                    min={0}
                    allowDecimals
                    unit="₪"
                    placeholder="הזן סכום"
                  />
                  {amount > 0 && lessonPrice > 0 && (
                    <div className="p-2 bg-muted rounded text-sm">
                      <p>מכסה: <strong>{lessonsCovered} שיעורים</strong></p>
                      {newBalance > 0 && (
                        <p className="text-green-600">יתרה לזכות: ₪{newBalance.toFixed(2)}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment-notes">הערות (אופציונלי)</Label>
                  <Input
                    id="payment-notes"
                    value={perLessonPaymentNotes}
                    onChange={(e) => setPerLessonPaymentNotes(e.target.value)}
                    placeholder="הערות..."
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={handleRecordPerLessonPayment} className="flex-1">
                    רשום תשלום
                  </Button>
                  <Button variant="outline" onClick={() => setShowPerLessonPaymentDialog(false)}>ביטול</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit One-Time Payment Dialog */}
      <Dialog open={showEditOneTimeDialog} onOpenChange={setShowEditOneTimeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת תשלום חד פעמי</DialogTitle>
          </DialogHeader>
          {editingOneTimePayment && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-description">תיאור</Label>
                <Input
                  id="edit-description"
                  value={editingOneTimePayment.description}
                  onChange={(e) => setEditingOneTimePayment({ ...editingOneTimePayment, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-amount">סכום</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  inputMode="decimal"
                  value={editingOneTimePayment.amount}
                  onChange={(e) => setEditingOneTimePayment({ ...editingOneTimePayment, amount: parseFloat(e.target.value) || 0 })}
                />
                <div className="flex gap-2 mt-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setEditingOneTimePayment({ ...editingOneTimePayment, amount: (editingOneTimePayment.amount || 0) - 10 })}>−10</Button>
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setEditingOneTimePayment({ ...editingOneTimePayment, amount: (editingOneTimePayment.amount || 0) + 10 })}>+10</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-date">תאריך</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editingOneTimePayment.paidDate?.split('T')[0] || ''}
                  onChange={(e) => setEditingOneTimePayment({ ...editingOneTimePayment, paidDate: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleEditOneTimePayment} className="flex-1">שמור</Button>
                <Button 
                  variant="destructive" 
                  onClick={async () => {
                    await handleDeleteOneTimePayment(editingOneTimePayment.id);
                    setShowEditOneTimeDialog(false);
                    setEditingOneTimePayment(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => setShowEditOneTimeDialog(false)}>ביטול</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Performance Payment Dialog */}
      <Dialog open={showEditPerformanceDialog} onOpenChange={(o) => { setShowEditPerformanceDialog(o); if (!o) setEditingPerformance(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>עריכת תשלום הופעה</DialogTitle>
          </DialogHeader>
          {editingPerformance && (() => {
            const totalDue = editingPerformance.amount || 0;
            const totalPaid = getPerformancePaidTotal(editingPerformance);
            const status = getPerformancePaymentStatus(editingPerformance);
            const balance = totalDue - totalPaid;
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-performance-name">שם הופעה</Label>
                  <Input
                    id="edit-performance-name"
                    value={editingPerformance.name || ''}
                    onChange={(e) => setEditingPerformance({ ...editingPerformance, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-performance-client">לקוחה</Label>
                  <Input
                    id="edit-performance-client"
                    value={editingPerformance.client || ''}
                    onChange={(e) => setEditingPerformance({ ...editingPerformance, client: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-performance-amount">סכום ההזמנה</Label>
                    <NumberStepper
                      id="edit-performance-amount"
                      value={editingPerformance.amount ?? 0}
                      onValueChange={(n) => setEditingPerformance({ ...editingPerformance, amount: n })}
                      step={50}
                      allowDecimals
                      min={0}
                      unit="₪"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-performance-travel">נסיעות (לא נכלל בהכנסה)</Label>
                    <NumberStepper
                      id="edit-performance-travel"
                      value={editingPerformance.travel ?? 0}
                      onValueChange={(n) => setEditingPerformance({ ...editingPerformance, travel: n })}
                      step={10}
                      allowDecimals
                      min={0}
                      unit="₪"
                    />
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">תשלומים שהתקבלו</div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : status === 'partial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'}`}>
                      {status === 'paid' ? 'שולם' : status === 'partial' ? 'שולם חלקית' : 'לא שולם'}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    שולם ₪{formatCurrencyAmount(totalPaid)} מתוך ₪{formatCurrencyAmount(totalDue)}
                    {balance > 0 && <span className="text-amber-700 dark:text-amber-300 mr-2">• יתרה ₪{formatCurrencyAmount(balance)}</span>}
                    {balance < 0 && <span className="text-emerald-700 dark:text-emerald-300 mr-2">• עודף ₪{formatCurrencyAmount(Math.abs(balance))}</span>}
                  </div>

                  {(editingPerformance.performancePayments || []).length > 0 && (
                    <div className="space-y-1">
                      {(editingPerformance.performancePayments || []).slice().sort((a,b) => b.date.localeCompare(a.date)).map(pp => (
                        <div key={pp.id} className="flex items-center gap-2 text-sm bg-background rounded px-2 py-1.5 border">
                          <span className="font-mono">{formatDisplayDate(pp.date)}</span>
                          <span className="font-semibold">₪{formatCurrencyAmount(pp.amount)}</span>
                          {!!pp.travel && pp.travel > 0 && (
                            <span className="text-xs text-muted-foreground">+ נסיעות ₪{formatCurrencyAmount(pp.travel)}</span>
                          )}
                          {pp.method && <span className="text-xs text-muted-foreground">({pp.method === 'bank' ? 'בנק' : pp.method === 'check' ? 'צ׳ק' : 'מזומן'})</span>}
                          {pp.notes && <span className="text-xs text-muted-foreground truncate flex-1">{pp.notes}</span>}
                          <Button size="sm" variant="ghost" className="h-7 px-2 mr-auto" onClick={() => handleDeletePerformancePaymentInline(pp.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t">
                    <div>
                      <Label className="text-xs">תאריך</Label>
                      <Input type="date" value={newPpDate} onChange={(e) => setNewPpDate(e.target.value)} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">סכום (הכנסה)</Label>
                      <Input type="number" value={newPpAmount} onChange={(e) => setNewPpAmount(e.target.value)} className="h-9" placeholder="₪" />
                    </div>
                    <div>
                      <Label className="text-xs">נסיעות (לא הכנסה)</Label>
                      <Input type="number" value={newPpTravel} onChange={(e) => setNewPpTravel(e.target.value)} className="h-9" placeholder="₪" />
                    </div>
                    <div>
                      <Label className="text-xs">אמצעי</Label>
                      <Select value={newPpMethod} onValueChange={(v: 'bank' | 'check' | 'cash') => setNewPpMethod(v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank">בנק</SelectItem>
                          <SelectItem value="check">צ׳ק</SelectItem>
                          <SelectItem value="cash">מזומן</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleAddPerformancePaymentInline} className="w-full h-9">
                        <Plus className="h-4 w-4 ml-1" /> הוסף תשלום
                      </Button>
                    </div>
                    <div className="col-span-2 md:col-span-5">
                      <Input value={newPpNotes} onChange={(e) => setNewPpNotes(e.target.value)} placeholder="הערות לתשלום (אופציונלי)" className="h-9" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-performance-notes">הערות כלליות להופעה</Label>
                  <Textarea
                    id="edit-performance-notes"
                    value={editingPerformance.notes || ''}
                    onChange={(e) => setEditingPerformance({ ...editingPerformance, notes: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => { handleEditPerformance(); setShowEditPerformanceDialog(false); }} className="flex-1">שמור וסגור</Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (!window.confirm('האם למחוק לחלוטין את ההופעה ואת כל תשלומיה?')) return;
                      await handleDeletePerformancePayment(editingPerformance.id);
                      setShowEditPerformanceDialog(false);
                      setEditingPerformance(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => setShowEditPerformanceDialog(false)}>סגור</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Per-Lesson Payment Dialog */}
      <Dialog open={showEditPerLessonDialog} onOpenChange={setShowEditPerLessonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת תשלום - שיעור חד-פעמי</DialogTitle>
          </DialogHeader>
          {editingPerLessonPayment && (() => {
            const student = students.find(s => s.id === editingPerLessonPayment.studentId);
            return (
              <div className="space-y-4">
                <div className="p-4 bg-secondary/30 rounded-lg">
                  <p className="font-bold">{student ? `${student.firstName} ${student.lastName}` : 'תלמידה'}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-plp-date">תאריך תשלום</Label>
                  <Input
                    id="edit-plp-date"
                    type="date"
                    value={editingPerLessonPayment.paymentDate || ''}
                    onChange={(e) => setEditingPerLessonPayment({ ...editingPerLessonPayment, paymentDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-plp-amount">סכום</Label>
                  <NumberStepper
                    id="edit-plp-amount"
                    value={editingPerLessonPayment.amount}
                    onValueChange={(n) => setEditingPerLessonPayment({ ...editingPerLessonPayment, amount: n })}
                    step={10}
                    allowDecimals
                    min={0}
                    unit="₪"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-plp-notes">הערות</Label>
                  <Input
                    id="edit-plp-notes"
                    value={editingPerLessonPayment.notes || ''}
                    onChange={(e) => setEditingPerLessonPayment({ ...editingPerLessonPayment, notes: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleEditPerLessonPayment} className="flex-1">שמור</Button>
                  <Button 
                    variant="destructive" 
                    onClick={async () => {
                      await handleDeletePerLessonPayment(editingPerLessonPayment.id);
                      setShowEditPerLessonDialog(false);
                      setEditingPerLessonPayment(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => setShowEditPerLessonDialog(false)}>ביטול</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Per-Lesson Payment History Dialog */}
      <Dialog open={showPerLessonHistoryDialog} onOpenChange={setShowPerLessonHistoryDialog}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>פירוט שיעורים ותשלומים - {selectedStudentForHistory?.firstName} {selectedStudentForHistory?.lastName}</DialogTitle>
          </DialogHeader>
          {selectedStudentForHistory && (() => {
            const ledger = getStudentPerLessonLedger(selectedStudentForHistory.id);
            const studentPayments = getStudentPerLessonPayments(selectedStudentForHistory.id)
              .slice()
              .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-secondary/30 rounded-lg">
                    <div className="text-xs text-muted-foreground">מחיר לשיעור</div>
                    <div className="font-bold">₪{formatCurrencyAmount(ledger.lessonPrice)}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-lg">
                    <div className="text-xs text-muted-foreground">סה"כ חיוב</div>
                    <div className="font-bold">₪{formatCurrencyAmount(ledger.totalDue)}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-lg">
                    <div className="text-xs text-muted-foreground">סה"כ שולם</div>
                    <div className="font-bold text-green-600">₪{formatCurrencyAmount(ledger.totalPaid)}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-lg">
                    <div className="text-xs text-muted-foreground">מאזן סופי</div>
                    <div className={`font-bold ${ledger.totalBalance < 0 ? 'text-destructive' : ledger.totalBalance > 0 ? 'text-green-600' : ''}`}>
                      {ledger.totalBalance < 0
                        ? `חוב ₪${formatCurrencyAmount(Math.abs(ledger.totalBalance))}`
                        : ledger.totalBalance > 0
                          ? `זכות ₪${formatCurrencyAmount(ledger.totalBalance)}`
                          : 'מאוזן'}
                    </div>
                  </div>
                </div>

                {ledger.rows.length === 0 ? (
                  <p className="text-center text-muted-foreground">אין עדיין שיעורים שהושלמו או תשלומים רשומים</p>
                ) : (
                  <div className="border rounded-lg max-h-[360px] overflow-auto">
                    <Table>
                      <TableHeader className="bg-muted/95 dark:bg-muted/80">
                        <TableRow>
                          <TableHead className="text-right">תאריך שיעור</TableHead>
                          <TableHead className="text-right">סכום לתשלום</TableHead>
                          <TableHead className="text-right">שולם</TableHead>
                          <TableHead className="text-right">תאריך/י תשלום</TableHead>
                          <TableHead className="text-right">חוב / עודף</TableHead>
                          <TableHead className="text-right">יתרה מצטברת</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledger.rows.map(row => (
                          row.rowType === 'credit' ? (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium text-emerald-700 dark:text-emerald-300">עודף לתשלום עתידי</TableCell>
                              <TableCell>-</TableCell>
                              <TableCell className="text-green-600 font-medium">₪{formatCurrencyAmount(row.amountPaid)}</TableCell>
                              <TableCell>{row.paymentDates.map(date => formatDisplayDate(date)).join(', ') || '-'}</TableCell>
                              <TableCell className="text-green-600 font-bold">זכות ₪{formatCurrencyAmount(row.balance)}</TableCell>
                              <TableCell className="text-green-600 font-bold">זכות ₪{formatCurrencyAmount(row.runningBalance)}</TableCell>
                            </TableRow>
                          ) : (
                            <TableRow key={row.id}>
                              <TableCell>{formatDisplayDate(row.lessonDate)}</TableCell>
                              <TableCell>₪{formatCurrencyAmount(row.amountDue)}</TableCell>
                              <TableCell className={row.amountPaid > 0 ? 'text-green-600 font-medium' : ''}>₪{formatCurrencyAmount(row.amountPaid)}</TableCell>
                              <TableCell>{row.paymentDates.map(date => formatDisplayDate(date)).join(', ') || '-'}</TableCell>
                              <TableCell className={row.balance < 0 ? 'text-destructive font-bold' : 'text-green-600'}>
                                {row.balance < 0 ? `חוב ₪${formatCurrencyAmount(Math.abs(row.balance))}` : 'שולם'}
                              </TableCell>
                              <TableCell className={row.runningBalance < 0 ? 'text-destructive font-bold' : row.runningBalance > 0 ? 'text-green-600 font-bold' : ''}>
                                {row.runningBalance < 0
                                  ? `חוב ₪${formatCurrencyAmount(Math.abs(row.runningBalance))}`
                                  : row.runningBalance > 0
                                    ? `זכות ₪${formatCurrencyAmount(row.runningBalance)}`
                                    : 'מאוזן'}
                              </TableCell>
                            </TableRow>
                          )
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="font-medium">רשומות תשלום לעריכה</div>
                  {studentPayments.length === 0 ? (
                    <p className="text-center text-muted-foreground">אין תשלומים רשומים</p>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto">
                      {studentPayments.map(plp => (
                        <div key={plp.id} className="flex justify-between items-center p-2 border rounded group">
                          <div>
                            <span className="font-medium">{formatDisplayDate(plp.paymentDate)}</span>
                            {plp.notes && <span className="text-xs text-muted-foreground mr-2">({plp.notes})</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">₪{formatCurrencyAmount(plp.amount)}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                setEditingPerLessonPayment(plp);
                                setShowPerLessonHistoryDialog(false);
                                setShowEditPerLessonDialog(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowPerLessonHistoryDialog(false)}
                >
                  סגור
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentManagement;
