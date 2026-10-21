import assert from 'node:assert/strict';
import fs from 'node:fs';
const workspace=fs.readFileSync('src/components/admin/SightReadingWorkspace.tsx','utf8');
const api=fs.readFileSync('src/lib/workerApi.ts','utf8');
assert.match(workspace,/import\s*\{[^}]*\breadStudentMailMode\b[^}]*\}\s*from\s*['"]@\/lib\/workerApi['"]/);
assert.match(workspace,/await readStudentMailMode\(\)/);
assert.match(api,/export async function readStudentMailMode\(/);
console.log('PASS: live Gmail mode preflight is imported and defined');
