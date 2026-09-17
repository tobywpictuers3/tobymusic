import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content, 'utf8');

function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return content.replace(before, after);
}

function replaceCount(content, before, after, expected, label) {
  if (content.includes(after) && !content.includes(before)) return content;
  const count = content.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return content.split(before).join(after);
}

function replaceBetween(content, startMarker, endMarker, replacement, label) {
  if (content.includes(replacement)) return content;
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`${label}: markers not found`);
  return content.slice(0, start) + replacement + content.slice(end);
}

// Student model: keep a current/default annual tuition payment method.
{
  const path = 'src/lib/types.ts';
  let source = read(path);
  source = replaceOnce(
    source,
    "  paymentMonths: number; // Number of payment months (default: 12)\n",
    "  paymentMonths: number; // Number of payment months (default: 12)\n  paymentMethod?: 'bank' | 'check' | 'cash' | 'inactive'; // Current/default method for annual tuition\n",
    'Student.paymentMethod',
  );
  write(path, source);
}

// Student add/edit dialog: expose and persist the method as a normal React field.
{
  const path = 'src/components/admin/StudentsManagement.tsx';
  let source = read(path);

  source = replaceOnce(source, "import { Student } from '@/lib/types';", "import { Payment, Student } from '@/lib/types';", 'Payment import');

  source = replaceOnce(
    source,
    "const money = (value: number) => `₪${Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;\n",
    "const money = (value: number) => `₪${Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;\ntype PaymentMethod = Payment['paymentMethod'];\n\nconst getStudentPaymentMethodPreference = (student: Student): PaymentMethod => {\n  if (student.paymentMethod) return student.paymentMethod;\n  const schoolYear = getSchoolYearForDate();\n  const { start, end } = getSchoolYearBounds(schoolYear);\n  const startMonth = start.slice(0, 7);\n  const endMonth = end.slice(0, 7);\n  return getPayments().find(payment =>\n    payment.studentId === student.id && payment.month >= startMonth && payment.month <= endMonth,\n  )?.paymentMethod || 'inactive';\n};\n",
    'payment method helper',
  );

  source = replaceOnce(source, "  paymentMonths: number;\n  notes: string;", "  paymentMonths: number;\n  paymentMethod: PaymentMethod;\n  notes: string;", 'StudentForm field');
  source = replaceOnce(source, "  paymentMonths: 12,\n  notes: '',", "  paymentMonths: 12,\n  paymentMethod: 'inactive',\n  notes: '',", 'default payment method');
  source = replaceOnce(source, "      paymentMonths: student.paymentMonths,\n      notes: student.notes || '',", "      paymentMonths: student.paymentMonths,\n      paymentMethod: getStudentPaymentMethodPreference(student),\n      notes: student.notes || '',", 'edit payment method');

  source = replaceCount(
    source,
    "        paymentMonths: studentForm.paymentMonths,\n        calculatedAmount:",
    "        paymentMonths: studentForm.paymentMonths,\n        paymentMethod: studentForm.paymentMethod,\n        calculatedAmount:",
    2,
    'persist payment method',
  );

  source = replaceOnce(
    source,
    "                <SelectContent><SelectItem value=\"annual\">תשלום שנתי</SelectItem><SelectItem value=\"per_lesson\">שיעורים חד-פעמיים (מזומן)</SelectItem></SelectContent>\n              </Select>\n\n              {studentForm.paymentType === 'per_lesson' && (",
    "                <SelectContent><SelectItem value=\"annual\">תשלום שנתי</SelectItem><SelectItem value=\"per_lesson\">שיעורים חד-פעמיים / לפי שיעור</SelectItem></SelectContent>\n              </Select>\n\n              <div className=\"mt-3\">\n                <Label htmlFor=\"paymentMethod\">אמצעי תשלום</Label>\n                <Select value={studentForm.paymentMethod} onValueChange={(value: PaymentMethod) => setStudentForm({...studentForm, paymentMethod: value})}>\n                  <SelectTrigger id=\"paymentMethod\" className=\"w-full\"><SelectValue /></SelectTrigger>\n                  <SelectContent>\n                    <SelectItem value=\"inactive\">לא הוגדר</SelectItem>\n                    <SelectItem value=\"bank\">העברה בנקאית</SelectItem>\n                    <SelectItem value=\"check\">צ׳ק</SelectItem>\n                    <SelectItem value=\"cash\">מזומן</SelectItem>\n                  </SelectContent>\n                </Select>\n                <p className=\"text-xs text-muted-foreground mt-1\">ניתן לשנות גם ישירות בלוח התשלומים השנתי.</p>\n              </div>\n\n              {studentForm.paymentType === 'per_lesson' && (",
    'student form UI',
  );

  write(path, source);
}

// Payments: change the method without ever fabricating a payment or rewriting a closed year.
{
  const path = 'src/components/admin/PaymentManagement.tsx';
  let source = read(path);

  const safeHandler = [
    "  const getCurrentAcademicBaseYear = () => {",
    "    const now = new Date();",
    "    return now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;",
    "  };",
    "",
    "  const handlePaymentMethodChange = (studentId: string, newMethod: 'bank' | 'check' | 'cash' | 'inactive') => {",
    "    if (selectedYear !== getCurrentAcademicBaseYear()) {",
    "      toast({",
    "        title: 'שנה סגורה',",
    "        description: 'אמצעי תשלום ניתן לשינוי רק בשנת הלימודים הפעילה, כדי לא לשנות היסטוריה כספית סגורה.',",
    "        variant: 'destructive'",
    "      });",
    "      return;",
    "    }",
    "",
    "    const now = new Date().toISOString();",
    "    const yearMonthKeys = new Set(academicMonths.map(month => {",
    "      const year = parseInt(month.key, 10) >= 9 ? selectedYear : selectedYear + 1;",
    "      return getMonthKey(month.key, year);",
    "    }));",
    "",
    "    const updatedPayments = payments.map(payment => {",
    "      if (payment.studentId !== studentId || !yearMonthKeys.has(payment.month)) return payment;",
    "      return { ...payment, paymentMethod: newMethod, lastModified: now };",
    "    });",
    "",
    "    yearMonthKeys.forEach(monthKey => {",
    "      const exists = updatedPayments.some(payment => payment.studentId === studentId && payment.month === monthKey);",
    "      if (!exists) {",
    "        updatedPayments.push({",
    "          id: studentId + '-' + monthKey,",
    "          studentId,",
    "          month: monthKey,",
    "          amount: 0,",
    "          status: 'not_paid',",
    "          paymentMethod: newMethod,",
    "          lastModified: now",
    "        });",
    "      }",
    "    });",
    "",
    "    updateStudent(studentId, { paymentMethod: newMethod });",
    "    savePayments(updatedPayments);",
    "    loadData();",
    "    toast({ description: newMethod === 'inactive' ? 'אמצעי התשלום הוסר' : '✅ אמצעי התשלום עודכן' });",
    "  };",
    "",
  ].join('\n');

  source = replaceBetween(
    source,
    "  const handlePaymentMethodChange = (studentId: string, newMethod: 'bank' | 'check' | 'cash' | 'inactive') => {",
    '  const handleCellClick =',
    safeHandler,
    'safe payment method handler',
  );

  source = replaceOnce(source, "    const paymentMethod = payments.find(p => p.studentId === editingCell.studentId)?.paymentMethod || 'cash';", "    const paymentMethod = getStudentPaymentMethod(editingCell.studentId);", 'payment edit method');

  source = replaceOnce(
    source,
    "  const getStudentPaymentMethod = (studentId: string): Payment['paymentMethod'] => {\n    return payments.find(p => p.studentId === studentId)?.paymentMethod || 'inactive';\n  };",
    "  const getStudentPaymentMethod = (studentId: string): Payment['paymentMethod'] => {\n    const selectedYearPayment = academicMonths\n      .map(month => getPaymentForMonth(studentId, month.key))\n      .find((payment): payment is Payment => Boolean(payment));\n    if (selectedYearPayment) return selectedYearPayment.paymentMethod;\n    return students.find(student => student.id === studentId)?.paymentMethod || 'inactive';\n  };",
    'year scoped method',
  );

  source = replaceOnce(source, "<th className=\"sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border w-[5%] text-center px-0 py-2 font-bold text-xs\">אמצ'ת</th>", "<th className=\"sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border w-[8%] text-center px-0 py-2 font-bold text-xs\">אמצעי</th>", 'annual header');

  source = replaceOnce(
    source,
    "                    <td className=\"text-center px-0 py-1 text-xs\">{getPaymentMethodLabel(method)}</td>",
    "                    <td className=\"text-center px-0 py-1 text-xs\">\n                      <Select value={method} onValueChange={(value: Payment['paymentMethod']) => handlePaymentMethodChange(student.id, value)} disabled={selectedYear !== getCurrentAcademicBaseYear()}>\n                        <SelectTrigger className=\"h-7 min-w-[82px] px-1 text-xs\" title={selectedYear !== getCurrentAcademicBaseYear() ? 'שנה סגורה — היסטוריה אינה ניתנת לשינוי' : 'שינוי אמצעי תשלום'}><SelectValue /></SelectTrigger>\n                        <SelectContent>\n                          <SelectItem value=\"inactive\">לא הוגדר</SelectItem>\n                          <SelectItem value=\"bank\">בנק</SelectItem>\n                          <SelectItem value=\"check\">צ׳ק</SelectItem>\n                          <SelectItem value=\"cash\">מזומן</SelectItem>\n                        </SelectContent>\n                      </Select>\n                    </td>",
    'annual method select',
  );

  source = replaceOnce(
    source,
    "                <TableCell className=\"text-right\">{getPaymentMethodLabel(method)}</TableCell>\n                <TableCell className=\"text-right\">₪{formatCurrencyAmount(student.monthlyAmount || 0)}</TableCell>",
    "                <TableCell className=\"text-right\">\n                  <Select value={method} onValueChange={(value: Payment['paymentMethod']) => handlePaymentMethodChange(student.id, value)} disabled={selectedYear !== getCurrentAcademicBaseYear()}>\n                    <SelectTrigger className=\"h-8 min-w-[110px]\"><SelectValue /></SelectTrigger>\n                    <SelectContent>\n                      <SelectItem value=\"inactive\">לא הוגדר</SelectItem>\n                      <SelectItem value=\"bank\">בנק</SelectItem>\n                      <SelectItem value=\"check\">צ׳ק</SelectItem>\n                      <SelectItem value=\"cash\">מזומן</SelectItem>\n                    </SelectContent>\n                  </Select>\n                </TableCell>\n                <TableCell className=\"text-right\">₪{formatCurrencyAmount(student.monthlyAmount || 0)}</TableCell>",
    'monthly method select',
  );

  write(path, source);
}

console.log('Payment method UI patch applied/verified successfully.');
