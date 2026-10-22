import assert from 'node:assert/strict';
import fs from 'node:fs';
const code=fs.readFileSync('src/lib/workerApi.ts','utf8');
const fn=code.slice(code.indexOf('export async function probeStudentsGmailOauth'),code.indexOf('export async function teacherDirectMailStatus'));
assert.match(fn,/result\.googleError/);
assert.match(fn,/new Set\(\['invalid_grant'/);
assert.ok(!fn.includes('googleErrorDescription'),'do not expose raw provider descriptions');
assert.ok(!fn.includes('refreshToken'),'never expose refresh token');
console.log('PASS allowlisted OAuth diagnostic codes only');
