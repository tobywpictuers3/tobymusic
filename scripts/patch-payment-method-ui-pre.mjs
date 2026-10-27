import fs from 'node:fs';

const path = 'src/components/admin/PaymentManagement.tsx';
let source = fs.readFileSync(path, 'utf8');

const priorYearScoped = "return payments.find(p => p.studentId === studentId && p.month >= `${selectedYear}-09` && p.month <= `${selectedYear + 1}-08`)?.paymentMethod || 'inactive';";
const baseLookup = "return payments.find(p => p.studentId === studentId)?.paymentMethod || 'inactive';";

if (source.includes(priorYearScoped)) {
  source = source.replace(priorYearScoped, baseLookup);
  fs.writeFileSync(path, source, 'utf8');
} else if (!source.includes(baseLookup)) {
  const scopedLookup = /return payments\.find\(p => p\.studentId === studentId[^;\n]*\)\?\.paymentMethod \|\| 'inactive';/;
  if (scopedLookup.test(source)) {
    source = source.replace(scopedLookup, baseLookup);
  } else {
    const begin = source.indexOf('const getStudentPaymentMethod =');
    const end = source.indexOf('const getAcademicMonthKey =', begin);
    if (begin < 0 || end < begin) throw new Error('payment-method-ui prepatch: student payment lookup function missing');
    const segment = source.slice(begin, end);
    const line = /^\s*return [^\n]*paymentMethod[^\n]*;\s*$/m;
    if (!line.test(segment)) throw new Error('payment-method-ui prepatch: expected payment method return line missing');
    source = source.slice(0,begin)+segment.replace(line, '    '+baseLookup)+source.slice(end);
  }
  fs.writeFileSync(path, source, 'utf8');
}

console.log('payment-method-ui prepatch ready');
