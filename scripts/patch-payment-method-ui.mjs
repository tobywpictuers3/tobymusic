import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content, 'utf8');

const replaceOnce = (content, before, after, label) => {
  if (content.includes(after)) return content;
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one source match, found ${count}`);
  return content.replace(before, after);
};

const replaceExactCount = (content, before, after, expectedCount, label) => {
  if (content.includes(after) && !content.includes(before)) return content;
  const count = content.split(before).length - 1;
  if (count !== expectedCount) throw new Error(`${label}: expected ${expectedCount} source matches, found ${count}`);
  return content.split(before).join(after);
};

const replaceBetween = (content, startMarker, endMarker, replacement, label) => {
  if (content.includes(replacement)) return content;
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`${label}: source markers not found`);
  return content.slice(0, start) + replacement + content.slice(end);
};

// 1) Make the student's preferred payment method a first-class, backward-compatible field.
{
  const path = 'src/lib/types.ts';
  let content = read(path);
  content = replaceOnce(
    content,
    "  paymentMonths: number; // Number of payment months (default: 12)\n",
    "  paymentMonths: number; // Number of payment months (default: 12)\n  paymentMethod?: 'bank' | 'check' | 'cash' | 'inactive'; // Current/default method for annual tuition\n",
    'types.Student.paymentMethod',
  );
  write(path, content);
}

// 2) Add the payment method to the real React student add/edit form (instead of relying on a DOM decorator).
{
  const path = 'src/components/admin/StudentsManagement.tsx';
  let content = read(path);

  content = replaceOnce(
    content,
    "import { Student } from '@/lib/types';",
    "import { Payment, Student } from '@/lib/types';",
    'StudentsManagement Payment import',
  );

  content = replaceOnce(
    content,
    "const money = (value: number) => `₪${Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;\n",
    "const money = (value: number) => `₪${Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;\ntype PaymentMethod = Payment['paymentMethod'];\n\nconst getStudentPaymentMethodPreference = (student: Student): PaymentMethod => {\n  if (student.paymentMethod) return student.paymentMethod;\n  const schoolYear = getSchoolYearForDate();\n  const { start, end } = getSchoolYearBounds(schoolYear);\n  const startMonth = start.slice(0, 7);\n  const endMonth = end.slice(0, 7);\n  return getPayments().find(payment =>\n    payment.studentId === student.id && payment.month >= startMonth && payment.month <= endMonth,\n  )?.paymentMethod || 'inactive';\n};\n",
    'StudentsManagement payment method helper',
  );

  content = replaceOnce(
    content,
    "  paymentMonths: number;\n  notes: string;",
    "  paymentMonths: number;\n  paymentMethod: PaymentMethod;\n  notes: string;",
    'StudentForm paymentMethod',
  );

  content = replaceOnce(
    content,
    "  paymentMonths: 12,\n  notes: '',",
    "  paymentMonths: 12,\n  paymentMethod: 'inactive',\n  notes: '',",
    'default paymentMethod',
  );

  content = replaceOnce(
    content,
    "      paymentMonths: student.paymentMonths,\n      notes: student.notes || '',",
    "      paymentMonths: student.paymentMonths,\n      paymentMethod: getStudentPaymentMethodPreference(student),\n      notes: student.notes || '',",
    'edit paymentMethod',
  );

  content = replaceExactCount(
    content,
    "        paymentMonths: studentForm.paymentMonths,\n        calculatedAmount:",
    "        paymentMonths: studentForm.paymentMonths,\n        paymentMethod: studentForm.paymentMethod,\n        calculatedAmount:",
    2,
    'persist paymentMethod',
  );

  content = replaceOnce(
    content,
    "                <SelectContent><SelectItem value=\"annual\">תשלום שנתי</SelectItem><SelectItem value=\"per_lesson\">שיעורים חד-פעמיים (מזומן)</SelectItem></SelectContent>\n              </Select>\n\n              {studentForm.paymentType === 'per_lesson' && (",
    "                <SelectContent><SelectItem value=\"annual\">תשלום שנתי</SelectItem><SelectItem value=\"per_lesson\">שיעורים חד-פעמיים / לפי שיעור</SelectItem></SelectContent>\n              </Select>\n\n              <div className=\"mt-3\">\n                <Label htmlFor=\"paymentMethod\">אמצעי תשלום</Label>\n                <Select value={studentForm.paymentMethod} onValueChange={(value: PaymentMethod) => setStudentForm({...studentForm, paymentMethod: value})}>\n                  <SelectTrigger id=\"paymentMethod\" className=\"w-full\"><SelectValue /></SelectTrigger>\n                  <SelectContent>\n                    <SelectItem value=\"inactive\">לא הוגדר</SelectItem>\n                    <SelectItem value=\"bank\">העברה בנקאית</SelectItem>\n                    <SelectItem value=\"check\">צ׳ק</SelectItem>\n                    <SelectItem value=\"cash\">מזומן</SelectItem>\n                  </SelectContent>\n                </Select>\n                <p className=\"text-xs text-muted-foreground mt-1\">ניתן לשנות גם ישירות בלוח התשלומים השנתי.</p>\n              </div>\n\n              {studentForm.paymentType === 'per_lesson' && (",
    'student form payment method UI',
  );

  write(path, content);
}

// 3) Make payment-method changes safe and editable in the annual/monthly tuition tables.
{
  const path = 'src/components/admin/PaymentManagement.tsx';
  let content = read(path);

  const safeHandler = `  const getCurrentAcademicBaseYear = () => {\n    const now = new Date();\n    return now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;\n  };\n\n  const handlePaymentMethodChange = (studentId: string, newMethod: 'bank' | 'check' | 'cash' | 'inactive') => {\n    if (selectedYear !== getCurrentAcademicBaseYear()) {\n      toast({\n        title: 'שנה סגורה',\n        description: 'אמצעי תשלום ניתן לשינוי רק בשנת הלימודים הפעילה, כדי לא לשנות היסטוריה כספית סגורה.',\n        variant: 'destructive'\n      });\n      return;\n    }\n\n    const now = new Date().toISOString();\n    const yearMonthKeys = new Set(academicMonths.map(month => {\n      const year = parseInt(month.key, 10) >= 9 ? selectedYear : selectedYear + 1;\n      return getMonthKey(month.key, year);\n    }));\n\n    const updatedPayments = payments.map(payment => {\n      if (payment.studentId !== studentId || !yearMonthKeys.has(payment.month)) return payment;\n      // Changing the method must never alter whether money was actually paid,\n      // the paid amount, notes or paid date.\n      return { ...payment, paymentMethod: newMethod, lastModified: now };\n    });\n\n    yearMonthKeys.forEach(monthKey => {\n      const exists = updatedPayments.some(payment => payment.studentId === studentId && payment.month === monthKey);\n      if (!exists) {\n        updatedPayments.push({\n          id: \\`${studentId}-\\${monthKey}\\`,\n          studentId,\n          month: monthKey,\n          amount: 0,\n          status: 'not_paid',\n          paymentMethod: newMethod,\n          lastModified: now\n        });\n      }\n    });\n\n    updateStudent(studentId, { paymentMethod: newMethod });\n    savePayments(updatedPayments);\n    loadData();\n    toast({ description: newMethod === 'inactive' ? 'אמצעי התשלום הוסר' : '✅ אמצעי התשלום עודכן' });\n  };\n\n`;

  content = replaceBetween(
    content,
    "  const handlePaymentMethodChange = (studentId: string, newMethod: 'bank' | 'check' | 'cash' | 'inactive') => {",
    '  const handleCellClick =',
    safeHandler,
    'safe payment method handler',
  );

  content = replaceOnce(
    content,
    "    const paymentMethod = payments.find(p => p.studentId === editingCell.studentId)?.paymentMethod || 'cash';",
    "    const paymentMethod = getStudentPaymentMethod(editingCell.studentId);",
    'payment edit method source',
  );

  content = replaceOnce(
    content,
    "  const getStudentPaymentMethod = (studentId: string): Payment['paymentMethod'] => {\n    return payments.find(p => p.studentId === studentId)?.paymentMethod || 'inactive';\n  };",
    "  const getStudentPaymentMethod = (studentId: string): Payment['paymentMethod'] => {\n    const selectedYearPayment = academicMonths\n      .map(month => getPaymentForMonth(studentId, month.key))\n      .find((payment): payment is Payment => Boolean(payment));\n    if (selectedYearPayment) return selectedYearPayment.paymentMethod;\n    return students.find(student => student.id === studentId)?.paymentMethod || 'inactive';\n  };",
    'year-scoped payment method getter',
  );

  content = replaceOnce(
    content,
    "<th className=\"sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border w-[5%] text-center px-0 py-2 font-bold text-xs\">אמצ'ת</th>",
    "<th className=\"sticky top-0 z-30 bg-muted/95 dark:bg-muted/80 text-foreground border-b border-border w-[8%] text-center px-0 py-2 font-bold text-xs\">אמצעי</th>",
    'annual payment method header',
  );

  content = replaceOnce(
    content,
    "                    <td className=\"text-center px-0 py-1 text-xs\">{getPaymentMethodLabel(method)}</td>",
    "                    <td className=\"text-center px-0 py-1 text-xs\">\n                      <Select\n                        value={method}\n                        onValueChange={(value: Payment['paymentMethod']) => handlePaymentMethodChange(student.id, value)}\n                        disabled={selectedYear !== getCurrentAcademicBaseYear()}\n                      >\n                        <SelectTrigger className=\"h-7 min-w-[82px] px-1 text-xs\" title={selectedYear !== getCurrentAcademicBaseYear() ? 'שנה סגורה — היסטוריה אינה ניתנת לשינוי' : 'שינוי אמצעי תשלום'}>\n                          <SelectValue />\n                        </SelectTrigger>\n                        <SelectContent>\n                          <SelectItem value=\"inactive\">לא הוגדר</SelectItem>\n                          <SelectItem value=\"bank\">בנק</SelectItem>\n                          <SelectItem value=\"check\">צ׳ק</SelectItem>\n                          <SelectItem value=\"cash\">מזומן</SelectItem>\n                        </SelectContent>\n                      </Select>\n                    </td>",
    'annual payment method select',
  );

  content = replaceOnce(
    content,
    "                <TableCell className=\"text-right\">{getPaymentMethodLabel(method)}</TableCell>\n                <TableCell className=\"text-right\">₪{formatCurrencyAmount(student.monthlyAmount || 0)}</TableCell>",
    "                <TableCell className=\"text-right\">\n                  <Select\n                    value={method}\n                    onValueChange={(value: Payment['paymentMethod']) => handlePaymentMethodChange(student.id, value)}\n                    disabled={selectedYear !== getCurrentAcademicBaseYear()}\n                  >\n                    <SelectTrigger className=\"h-8 min-w-[110px]\"><SelectValue /></SelectTrigger>\n                    <SelectContent>\n                      <SelectItem value=\"inactive\">לא הוגדר</SelectItem>\n                      <SelectItem value=\"bank\">בנק</SelectItem>\n                      <SelectItem value=\"check\">צ׳ק</SelectItem>\n                      <SelectItem value=\"cash\">מזומן</SelectItem>\n                    </SelectContent>\n                  </Select>\n                </TableCell>\n                <TableCell className=\"text-right\">₪{formatCurrencyAmount(student.monthlyAmount || 0)}</TableCell>",
    'monthly payment method select',
  );

  write(path, content);
}

console.log('Payment method UI patch applied/verified successfully.');
