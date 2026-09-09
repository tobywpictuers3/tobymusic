import fs from 'node:fs';

const routePath = 'src/pages/AdminModeRoutes.tsx';
const dashboardPath = 'src/pages/AdminDashboard.tsx';

const route = fs.readFileSync(routePath, 'utf8');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');

if (!route.includes("import FinancialYearGate from '@/components/admin/FinancialYearGate';")) {
  throw new Error('school-year-close-init: FinancialYearGate import is missing');
}
if (!route.includes('<FinancialYearGate>{dashboard}</FinancialYearGate>')) {
  throw new Error('school-year-close-init: normal admin route is not gated');
}
if (dashboard.includes('migrateApproved2026PerLessonClose')) {
  throw new Error('school-year-close-init: historical 2026 migration must not run on every admin startup');
}

console.log('school-year-close-init source gate verified');
