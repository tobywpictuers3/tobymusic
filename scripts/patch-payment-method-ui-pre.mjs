import fs from 'node:fs';

const path = 'src/components/admin/PaymentManagement.tsx';
let source = fs.readFileSync(path, 'utf8');

const priorYearScoped = "return payments.find(p => p.studentId === studentId && p.month >= `${selectedYear}-09` && p.month <= `${selectedYear + 1}-08`)?.paymentMethod || 'inactive';";
const baseLookup = "return payments.find(p => p.studentId === studentId)?.paymentMethod || 'inactive';";

if (source.includes(priorYearScoped)) {
  source = source.replace(priorYearScoped, baseLookup);
  fs.writeFileSync(path, source, 'utf8');
} else if (!source.includes(baseLookup)) {
  throw new Error('payment-method-ui prepatch: payment method lookup marker not found');
}

console.log('payment-method-ui prepatch ready');
