import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, DollarSign, CheckCircle2, Receipt } from 'lucide-react';
import {
  getPayments,
  getStudents,
  getStudentPerLessonPayments,
} from '@/lib/storage';
import { Payment } from '@/lib/types';

interface PaymentSummaryProps {
  studentId: string;
}

type HistoryRow = {
  date: string; // YYYY-MM-DD
  type: 'monthly' | 'perLesson' | 'performance';
  typeLabel: string;
  description: string;
  amount: number;
  method?: string;
};

const PaymentSummary = ({ studentId }: PaymentSummaryProps) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [annualAmount, setAnnualAmount] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    const allPayments = getPayments();
    const studentPayments = allPayments.filter(p => p.studentId === studentId);
    setPayments(studentPayments);

    const students = getStudents();
    const student = students.find(s => s.id === studentId);
    if (student) {
      const effectiveAmount = student.calculatedAmount || student.annualAmount || 0;
      setAnnualAmount(effectiveAmount);
    }

    // Build unified history across monthly, per-lesson, performances
    const rows: HistoryRow[] = [];

    studentPayments
      .filter(p => p.status === 'paid' && (p.amount || 0) > 0)
      .forEach(p => {
        rows.push({
          date: p.paidDate || `${p.month}-01`,
          type: 'monthly',
          typeLabel: 'תשלום חודשי',
          description: `חודש ${p.month}`,
          amount: p.amount,
          method: p.paymentMethod,
        });
      });

    getStudentPerLessonPayments(studentId).forEach(p => {
      rows.push({
        date: p.paymentDate,
        type: 'perLesson',
        typeLabel: 'תשלום שיעור',
        description: p.notes || `${p.lessonsCount} שיעורים`,
        amount: p.amount,
      });
    });

    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    setHistory(rows);
  }, [studentId]);

  const totalPaid = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const paymentsByMethod = payments
    .filter(p => p.status === 'paid')
    .reduce((acc, p) => {
      const method = p.paymentMethod || 'לא צוין';
      acc[method] = (acc[method] || 0) + p.amount;
      return acc;
    }, {} as Record<string, number>);

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      bank_transfer: 'העברה בנקאית',
      bank: 'העברה בנקאית',
      cash: 'מזומן',
      check: 'צ\'ק',
      credit_card: 'כרטיס אשראי',
      bit: 'ביט',
      paybox: 'פייבוקס'
    };
    return labels[method] || method;
  };

  const percentagePaid = annualAmount > 0 ? (totalPaid / annualAmount) * 100 : 0;

  return (
    <Card className="card-gradient card-shadow">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          סיכום תשלומים
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Annual Amount */}
          <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
            <span className="text-sm font-medium">סכום שנתי:</span>
            <span className="text-lg font-bold text-primary">₪{annualAmount}</span>
          </div>

          {/* Total Paid */}
          <div className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg">
            <span className="text-sm font-medium">שולם עד כה:</span>
            <span className="text-lg font-bold">₪{totalPaid}</span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>התקדמות תשלום</span>
              <span>{percentagePaid.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-secondary/20 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(percentagePaid, 100)}%` }}
              />
            </div>
          </div>

          {/* Remaining Amount */}
          {totalPaid < annualAmount && (
            <div className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/20">
              <span className="text-sm font-medium">יתרה לתשלום:</span>
              <span className="text-lg font-bold text-destructive">₪{annualAmount - totalPaid}</span>
            </div>
          )}

          {/* Fully Paid Badge */}
          {totalPaid >= annualAmount && annualAmount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">התשלום השנתי הושלם!</span>
            </div>
          )}

          {/* Payment Methods Breakdown */}
          {Object.keys(paymentsByMethod).length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                פירוט לפי אמצעי תשלום
              </h4>
              <div className="space-y-2">
                {Object.entries(paymentsByMethod).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{getPaymentMethodLabel(method)}</span>
                    <span className="font-medium">₪{amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full history across all payment types */}
          {history.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                היסטוריית כל התשלומים שלך
              </h4>
              <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                {history.map((row, idx) => (
                  <div
                    key={`${row.type}-${row.date}-${idx}`}
                    className="flex items-center justify-between gap-3 text-sm p-2 rounded-md bg-muted/30 border border-border/40"
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-xs text-muted-foreground">{row.date}</span>
                      <span className="font-medium">{row.typeLabel}</span>
                      <span className="text-xs text-muted-foreground">{row.description}</span>
                      {row.method && (
                        <span className="text-[10px] text-muted-foreground">
                          {getPaymentMethodLabel(row.method)}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-primary">₪{row.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentSummary;
