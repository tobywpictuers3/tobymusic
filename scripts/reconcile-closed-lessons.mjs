#!/usr/bin/env node
/**
 * Audited school-year reconciliation after a manually deleted lesson.
 *
 * Deliberately NOT an automatic startup migration. A closed school-year is
 * financial history, and paid settlements cannot be silently recalculated.
 *
 * Usage:
 *   node scripts/reconcile-closed-lessons.mjs --input latest.json
 *   node scripts/reconcile-closed-lessons.mjs --input latest.json --output proposed.json
 *
 * The original input is never changed. Output is opt-in, generated from the
 * input itself, and uses only minimal field-level patches. This script NEVER
 * deletes lessons or edits payment/settlement/receipt rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const roundMoney = n => Math.round((n + Number.EPSILON) * 100) / 100;
const args = process.argv.slice(2);
const flag = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : undefined; };
const input = flag('--input');
const output = flag('--output');

export const bankMinutes = notes =>
  [...String(notes || '').matchAll(/בנק זמן:\s*([+-]?\d+)\s*דקות?/g)]
    .reduce((sum, match) => sum + Number(match[1]), 0);
const debtMakeup = notes =>
  String(notes || '').includes('השלמת חוב משנה"ל') ||
  String(notes || '').includes('השלמת חוב משנהל');
const dateInside = (date, year) =>
  typeof date === 'string' && date >= (year - 1) + '-09-01' &&
  date <= year + '-08-31';

export function reconcile(inputData) {
  const data = structuredClone(inputData);
  const lessons = data.musicSystem_lessons || [];
  const records = data.musicSystem_schoolYearRecords || [];
  const students = new Map((data.musicSystem_students || []).map(s => [s.id, s]));
  const settlements = data.musicSystem_priorYearBalances || [];
  const report = { examined: 0, patchedYears: [], patchedOpeningYears: [], pendingFinancialReview: [], duplicateSlots: [] };
  const bySlot = new Map();
  for (const lesson of lessons) {
    if (lesson.status !== 'completed') continue;
    const slot = [lesson.studentId, lesson.date, lesson.startTime, lesson.endTime].join('|');
    bySlot.set(slot, [...(bySlot.get(slot) || []), lesson.id]);
  }
  report.duplicateSlots = [...bySlot.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([slot, ids]) => ({ slot, lessonIds: ids }));

  for (const old of records) {
    if (old.status !== 'closed' || !students.has(old.studentId)) continue;
    if (students.get(old.studentId).paymentType === 'per_lesson') continue;
    if (!Number.isFinite(old.expectedLessons) || old.expectedLessons <= 0 ||
        !Number.isFinite(old.baseTarget) || !Number.isFinite(old.paidTotal)) continue;
    report.examined++;
    const completed = lessons.filter(l =>
      l.studentId === old.studentId && l.status === 'completed' &&
      dateInside(l.date, old.schoolYear) && !debtMakeup(l.notes));
    const bank = Math.round(completed.reduce((n, l) => n + bankMinutes(l.notes), 0) / 5) * 5;
    const effectiveSixths = completed.length * 6 + Math.round(bank / 5);
    const shortfallSixths = Math.max(0, old.expectedLessons * 6 - effectiveSixths);
    const excessSixths = Math.max(0, effectiveSixths - old.expectedLessons * 6);
    // Match schoolYear.ts exactly: first round per-lesson cost, then round debt.
    const contractLessonPrice = roundMoney(old.baseTarget / old.expectedLessons);
    const lessonDebtValue = roundMoney(shortfallSixths / 6 * contractLessonPrice);
    const finalTarget = roundMoney(Math.max(0, old.baseTarget - lessonDebtValue));
    const signed = roundMoney((old.openingFinancialBalance || 0) + old.paidTotal - finalTarget);
    const updated = {
      completedLessons: completed.length, bankMinutesThisYear: bank,
      effectiveSixths, shortfallSixths, excessSixths, contractLessonPrice,
      lessonDebtSixths: shortfallSixths, lessonDebtValue,
      yearEndAdjustment: roundMoney(-lessonDebtValue), finalTarget,
      closingFinancialBalance: signed,
      carryoverWholeLessons: Math.floor(excessSixths / 6),
      carryoverBankMinutes: excessSixths % 6 * 5,
    };
    const differences = Object.fromEntries(Object.entries(updated)
      .filter(([key, value]) => old[key] !== value)
      .map(([key, value]) => [key, { from: old[key], to: value }]));
    if (!Object.keys(differences).length) continue;

    // Capture pre-patch carryover before changing the closed snapshot.
    const priorCarryoverLessons = old.carryoverWholeLessons || 0;
    const priorCarryoverBankMinutes = old.carryoverBankMinutes || 0;
    // Financial snapshots are corrected only in the proposed OUTPUT.
    // Keep original closure date, terms, payments, and all other fields.
    Object.assign(old, updated);
    report.patchedYears.push({ studentId: old.studentId, schoolYear: old.schoolYear, differences });

    const next = records.find(r => r.studentId === old.studentId &&
      r.schoolYear === old.schoolYear + 1 && r.status === 'open');
    if (next && next.startReason === 'carryover_credit') {
      const safeToAdjust = next.openingCarryoverLessons === priorCarryoverLessons &&
        next.openingCarryoverBankMinutes === priorCarryoverBankMinutes &&
        next.startingLessonNumber === 1 + priorCarryoverLessons;
      if (safeToAdjust) {
        const nextStart = 1 + updated.carryoverWholeLessons;
        const startChanges = {};
        for (const [key, value] of Object.entries({
          startingLessonNumber: nextStart,
          openingCarryoverLessons: updated.carryoverWholeLessons,
          openingCarryoverBankMinutes: updated.carryoverBankMinutes,
          startReason: updated.carryoverWholeLessons || updated.carryoverBankMinutes ?
            'carryover_credit' : 'regular',
        })) {
          if (next[key] !== value) { startChanges[key] = { from: next[key], to: value }; next[key] = value; }
        }
        if (Object.keys(startChanges).length) {
          report.patchedOpeningYears.push({ studentId: old.studentId, schoolYear: next.schoolYear, changes: startChanges });
        }
      } else {
        report.pendingFinancialReview.push({ studentId: old.studentId, schoolYear: next.schoolYear, reason: 'custom_opening_terms_preserved' });
      }
    }
    // Never overwrite operational settlement records, including pending and
    // manager-confirmed cash/lesson settlements. Any discrepancy is reported.
    const settlement = settlements.find(p => p.studentId === old.studentId &&
      p.sourceSchoolYear === old.schoolYear);
    if (settlement && Math.abs((settlement.signedBalance || 0) - signed) > 0.009) {
      report.pendingFinancialReview.push({
        studentId: old.studentId, schoolYear: old.schoolYear,
        reason: 'settlement_needs_manager_review',
        storedSignedBalance: settlement.signedBalance,
        recalculatedSignedBalance: signed,
        settled: settlement.settled === true,
      });
    }
  }
  return { data, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!input || args.some(a => a === '--output') && !output) {
    console.error('Usage: node scripts/reconcile-closed-lessons.mjs --input latest.json [--output proposed.json]');
    process.exit(2);
  }
  const { data, report } = reconcile(JSON.parse(fs.readFileSync(input, 'utf8')));
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (output) {
    if (path.resolve(output) === path.resolve(input)) {
      throw new Error('Refusing to overwrite input');
    }
    fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
    console.error('PROPOSAL only: no Dropbox data was written. Review financial exceptions before importing.');
  }
}
