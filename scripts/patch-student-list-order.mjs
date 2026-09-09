import fs from 'node:fs';
import path from 'node:path';

const storagePath = 'src/lib/storage.ts';
let storageSource = fs.readFileSync(storagePath, 'utf8');

const replaceOrVerifyStorage = (oldText, newText, verification) => {
  if (storageSource.includes(oldText)) {
    storageSource = storageSource.replace(oldText, newText);
    return;
  }
  if (!storageSource.includes(verification)) {
    throw new Error(`student-list-order storage marker not found: ${verification}`);
  }
};

replaceOrVerifyStorage(
  "import { calculateEarnedCopper, formatPriceCompact } from './storeCurrency';",
  "import { calculateEarnedCopper, formatPriceCompact } from './storeCurrency';\nimport { filterStudentsForCurrentSchoolYearLists, sortStudentsByLastNameInPlace, sortStudentsForStudentCards } from './studentSort';",
  "filterStudentsForCurrentSchoolYearLists, sortStudentsByLastNameInPlace, sortStudentsForStudentCards",
);

replaceOrVerifyStorage(
  `// Students\nexport const getStudents = (): Student[] => {\n  if (isDevMode()) return devData['students'] || [];\n  return inMemoryStorage['students'] || [];\n};`,
  `// Students\nexport const getStudents = (): Student[] => {\n  const students = isDevMode() ? (devData['students'] || []) : (inMemoryStorage['students'] || []);\n  return sortStudentsByLastNameInPlace(students);\n};\n\n// Ordinary operational lists hide students who were already inactive when the\n// current school year opened. A currently active/reactivated student is always\n// included. The Students index intentionally uses the separate all-students getter.\nexport const getStudentsForCurrentYearLists = (): Student[] =>\n  filterStudentsForCurrentSchoolYearLists([...getStudents()]);\n\nexport const getStudentsForStudentCards = (): Student[] =>\n  sortStudentsForStudentCards(getStudents());`,
  'export const getStudentsForCurrentYearLists = (): Student[] =>',
);

fs.writeFileSync(storagePath, storageSource);

const replaceStorageGetter = (filePath, getter) => {
  let source = fs.readFileSync(filePath, 'utf8');
  const oldCall = 'getStudents()';
  const newCall = `${getter}()`;

  if (!source.includes(oldCall)) {
    if (source.includes(newCall)) return;
    return;
  }

  const importRegex = /(import\s*\{[\s\S]*?)(\bgetStudents\b)([\s\S]*?\}\s*from\s*['"]@\/lib\/storage['"];?)/m;
  if (!importRegex.test(source)) {
    throw new Error(`Cannot locate getStudents storage import in ${filePath}`);
  }

  source = source.replace(importRegex, `$1${getter}$3`);
  source = source.replaceAll(oldCall, newCall);
  fs.writeFileSync(filePath, source);
};

// The Students index is the one explicit exception: it shows everyone, grouped
// current-active first and current-inactive second, each group alphabetically.
replaceStorageGetter('src/components/admin/StudentsManagement.tsx', 'getStudentsForStudentCards');

const rawAdminConsumers = new Set([
  'BackupHistory.tsx',
  'BackupImport.tsx',
  'FinancialYearGate.tsx',
  'InactiveStudentStatusDecorator.tsx',
  'PaymentManagementShell.tsx',
  'StudentActiveToggleDecorator.tsx',
  'StudentLessonHistory.tsx',
  'StudentSchoolYearSummary.tsx',
  'StudentsManagement.tsx',
]);

const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const fullPath = path.join(directory, entry.name);
  if (entry.isDirectory()) return walk(fullPath);
  return entry.isFile() && /\.(tsx|ts)$/.test(entry.name) ? [fullPath] : [];
});

for (const filePath of walk('src/components/admin')) {
  if (rawAdminConsumers.has(path.basename(filePath))) continue;
  replaceStorageGetter(filePath, 'getStudentsForCurrentYearLists');
}

// Student-facing surfaces that intentionally present another-student lists.
for (const filePath of [
  'src/components/student/ContactsList.tsx',
  'src/components/student/GeneralWeeklySchedule.tsx',
  'src/components/student/SwapRequestForm.tsx',
  'src/components/student/lessonSwap/StudentSwapPanel.tsx',
  'src/components/students/StudentsSwapRequestDialog.tsx',
]) {
  if (fs.existsSync(filePath)) replaceStorageGetter(filePath, 'getStudentsForCurrentYearLists');
}

const replaceInFileOrVerify = (filePath, oldText, newText, verification) => {
  let source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(oldText)) {
    source = source.replace(oldText, newText);
    fs.writeFileSync(filePath, source);
    return;
  }
  if (!source.includes(verification)) {
    throw new Error(`student-list visibility marker not found in ${filePath}: ${verification}`);
  }
};

// Lesson rows are data-driven rather than student-driven. Once the student
// roster is filtered, remove lesson rows whose student is not in that roster.
replaceInFileOrVerify(
  'src/components/admin/LessonJournal.tsx',
  `    const actualLessons: LessonWithStudent[] = lessons\n      .filter(l => l.date === dateStr && l.status !== 'cancelled')\n      .map(l => ({\n        ...l,\n        student: students.find(s => s.id === l.studentId)\n      }));`,
  `    const actualLessons: LessonWithStudent[] = lessons\n      .filter(l => l.date === dateStr && l.status !== 'cancelled')\n      .map(l => ({\n        ...l,\n        student: students.find(s => s.id === l.studentId)\n      }))\n      .filter(lesson => Boolean(lesson.student));`,
  '.filter(lesson => Boolean(lesson.student));',
);

// Fixed schedule rows are also stored by student id; do not leave anonymous
// rows behind after an excluded student disappears from the operational roster.
replaceInFileOrVerify(
  'src/components/admin/FixedScheduleTab.tsx',
  `    return Object.entries(daySchedule)\n      .map(([time, data]) => ({\n        time,\n        studentId: data.studentId,\n        student: students.find(s => s.id === data.studentId)\n      }))\n      .sort((a, b) => a.time.localeCompare(b.time));`,
  `    return Object.entries(daySchedule)\n      .map(([time, data]) => ({\n        time,\n        studentId: data.studentId,\n        student: students.find(s => s.id === data.studentId)\n      }))\n      .filter(item => Boolean(item.student))\n      .sort((a, b) => a.time.localeCompare(b.time));`,
  '.filter(item => Boolean(item.student))',
);

// Prior-year settlement rows come from their own bucket, so filter the rows by
// the visible student ids as well as using the filtered student lookup.
replaceInFileOrVerify(
  'src/components/admin/PriorYearBalancesCard.tsx',
  `  const actionable = useMemo(\n    () => rows.filter(row => row.signedBalance !== 0 || row.requiresVerification),\n    [rows],\n  );\n  const balancedCount = rows.length - actionable.length;`,
  `  const visibleStudentIds = new Set(students.map(student => student.id));\n  const displayRows = rows.filter(row => visibleStudentIds.has(row.studentId));\n  const actionable = displayRows.filter(row => row.signedBalance !== 0 || row.requiresVerification);\n  const balancedCount = displayRows.length - actionable.length;`,
  'const displayRows = rows.filter(row => visibleStudentIds.has(row.studentId));',
);

replaceInFileOrVerify(
  'src/components/admin/PriorYearBalancesCard.tsx',
  "import { useEffect, useMemo, useState } from 'react';",
  "import { useEffect, useState } from 'react';",
  "import { useEffect, useState } from 'react';",
);

// Future admin components must opt out explicitly if they genuinely require raw
// all-student data. This prevents a new list from silently bypassing the rule.
for (const filePath of walk('src/components/admin')) {
  if (rawAdminConsumers.has(path.basename(filePath))) continue;
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes('getStudents()')) {
    throw new Error(`Unfiltered admin student list consumer remains: ${filePath}`);
  }
}

console.log('student lists: surname order + current-school-year visibility policy ready');
