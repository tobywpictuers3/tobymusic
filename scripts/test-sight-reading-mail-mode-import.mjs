import assert from 'node:assert/strict';
import fs from 'node:fs';
const workspace=fs.readFileSync('src/components/admin/SightReadingWorkspace.tsx','utf8');
const api=fs.readFileSync('src/lib/workerApi.ts','utf8');
assert.ok(workspace.includes('teacherDirectMailStatus, teacherDirectSend, teacherDirectReceipt'),
  'new sender mode and receipt helpers must be imported');
assert.ok(workspace.includes('await teacherDirectMailStatus()'),
  'sender must check dedicated Worker mode before assigning or sending');
assert.ok(workspace.includes('await teacherDirectReceipt('),
  'sender must review canonical durable receipt');
assert.ok(api.includes('export async function teacherDirectMailStatus()'),
  'dedicated mode helper must exist');
assert.ok(api.includes('export async function teacherDirectSend('),
  'dedicated sender helper must exist');
console.log('PASS dedicated Gmail sender status, receipt and import are connected');
