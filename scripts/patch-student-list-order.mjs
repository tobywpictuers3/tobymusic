import fs from 'node:fs';

const path = 'src/lib/storage.ts';
let source = fs.readFileSync(path, 'utf8');

const replaceOrVerify = (oldText, newText, verification) => {
  if (source.includes(oldText)) {
    source = source.replace(oldText, newText);
    return;
  }
  if (!source.includes(verification)) {
    throw new Error(`student-list-order patch marker not found: ${verification}`);
  }
};

replaceOrVerify(
  "import { calculateEarnedCopper, formatPriceCompact } from './storeCurrency';",
  "import { calculateEarnedCopper, formatPriceCompact } from './storeCurrency';\nimport { sortStudentsByLastNameInPlace } from './studentSort';",
  "import { sortStudentsByLastNameInPlace } from './studentSort';",
);

replaceOrVerify(
  `// Students\nexport const getStudents = (): Student[] => {\n  if (isDevMode()) return devData['students'] || [];\n  return inMemoryStorage['students'] || [];\n};`,
  `// Students\nexport const getStudents = (): Student[] => {\n  const students = isDevMode() ? (devData['students'] || []) : (inMemoryStorage['students'] || []);\n  return sortStudentsByLastNameInPlace(students);\n};`,
  'return sortStudentsByLastNameInPlace(students);',
);

fs.writeFileSync(path, source);
console.log('student lists use canonical surname-first alphabetical order');
