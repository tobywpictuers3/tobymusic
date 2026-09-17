import fs from 'node:fs';

const path = 'src/pages/AdminDashboard.tsx';
let source = fs.readFileSync(path, 'utf8');

const importMarker = "import StudentsManagement from '@/components/admin/StudentsManagement';";
const importWithDecorator = `${importMarker}\nimport StudentPaymentMethodDecorator from '@/components/admin/StudentPaymentMethodDecorator';`;

if (!source.includes("import StudentPaymentMethodDecorator from '@/components/admin/StudentPaymentMethodDecorator';")) {
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

fs.writeFileSync(path, source, 'utf8');
console.log('Payment method card/list decorator mounted in AdminDashboard.');
