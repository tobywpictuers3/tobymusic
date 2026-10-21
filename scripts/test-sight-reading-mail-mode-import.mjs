import assert from 'node:assert/strict';
import fs from 'node:fs';
const workspace=fs.readFileSync('src/components/admin/SightReadingWorkspace.tsx','utf8');
const api=fs.readFileSync('src/lib/workerApi.ts','utf8');
assert.ok(workspace.includes("import { workerApi, readStudentMailMode } from '@/lib/workerApi';"),'missing runtime import for mail mode');
assert.ok(workspace.includes('await readStudentMailMode()'),'sender must read bridge mode');
assert.ok(api.includes('export async function readStudentMailMode()'),'mail mode API must be exported');
console.log('PASS: live Gmail mode preflight is imported and defined');
