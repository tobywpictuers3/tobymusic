import fs from 'node:fs';

const path = 'src/pages/AdminDashboard.tsx';
let source = fs.readFileSync(path, 'utf8');

const importLine = "import StudentPaymentMethodDecorator from '@/components/admin/StudentPaymentMethodDecorator';";
const importMarker = "import StudentsManagement from '@/components/admin/StudentsManagement';";
const importWithDecorator = `${importMarker}\n${importLine}`;

if (!source.includes(importLine)) {
  if (!source.includes(importMarker)) {
    throw new Error('payment-method-card-mount: StudentsManagement import marker not found');
  }
  source = source.replace(importMarker, importWithDecorator);
}

const providerMarker = '    <DateModeProvider>\n      <div className="relative z-10 min-h-screen musical-gradient overflow-hidden page-enter">';
const providerWithDecorator = '    <DateModeProvider>\n      <StudentPaymentMethodDecorator />\n      <div className="relative z-10 min-h-screen musical-gradient overflow-hidden page-enter">';

if (!source.includes('<StudentPaymentMethodDecorator />')) {
  if (!source.includes(providerMarker)) {
    throw new Error('payment-method-card-mount: DateModeProvider marker not found');
  }
  source = source.replace(providerMarker, providerWithDecorator);
}

const importCount = source.split(importLine).length - 1;
const mountCount = source.split('<StudentPaymentMethodDecorator />').length - 1;
if (importCount !== 1 || mountCount !== 1) {
  throw new Error(`payment-method-card-mount: expected exactly one import and one mount, got import=${importCount}, mount=${mountCount}`);
}

fs.writeFileSync(path, source, 'utf8');
console.log('Payment method card/list decorator mounted exactly once in AdminDashboard.');
