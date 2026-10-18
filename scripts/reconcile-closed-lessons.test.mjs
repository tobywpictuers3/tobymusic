import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from './reconcile-closed-lessons.mjs';

const sample = () => ({
  musicSystem_students: [{ id: 's1', paymentType: 'annual' }, { id: 's2', paymentType: 'annual' }],
  musicSystem_lessons: [
    { id: 'keep', studentId: 's1', date: '2026-08-27', startTime: '16:00', endTime: '16:30', status: 'completed', notes: 'בנק זמן: +5 דקות' },
  ],
  musicSystem_schoolYearRecords: [
    {
      id: 's1:2026', studentId: 's1', schoolYear: 2026, status: 'closed',
      expectedLessons: 1, annualAmountFull: 600, baseTarget: 600,
      paidTotal: 600, openingFinancialBalance: 0,
      completedLessons: 2, bankMinutesThisYear: 5, carryoverWholeLessons: 1,
      carryoverBankMinutes: 5, closingFinancialBalance: 0, finalTarget: 600,
      payments: [{ id: 'paid-row', amount: 600 }],
    },
    {
      id: 's1:2027', studentId: 's1', schoolYear: 2027, status: 'open',
      startReason: 'carryover_credit', startingLessonNumber: 2,
      openingCarryoverLessons: 1, openingCarryoverBankMinutes: 5,
      annualAmountFull: 610, baseTarget: 610,
    },
  ],
  musicSystem_priorYearBalances: [{
    id: 'receipt', studentId: 's1', sourceSchoolYear: 2026,
    targetSchoolYear: 2027, signedBalance: 0, settled: true,
    settlementMethod: 'cash', settlementDate: '2026-10-14',
  }],
  musicSystem_payments: [{ id: 'payment', amount: 600 }],
  musicSystem_oneTimePayments: [{ id: 'cash-receipt', amount: -2 }],
  musicSystem_titheHistory: [{ id: 'tithe', paid: true }],
});

test('reconciles closed counts and carryover without changing other buckets or receipts', () => {
  const original = sample();
  const { data, report } = reconcile(original);
  assert.equal(original.musicSystem_schoolYearRecords[0].completedLessons, 2);
  assert.equal(data.musicSystem_schoolYearRecords[0].completedLessons, 1);
  assert.equal(data.musicSystem_schoolYearRecords[0].bankMinutesThisYear, 5);
  assert.equal(data.musicSystem_schoolYearRecords[1].startingLessonNumber, 1);
  assert.equal(data.musicSystem_schoolYearRecords[1].openingCarryoverBankMinutes, 5);
  assert.deepEqual(data.musicSystem_priorYearBalances, original.musicSystem_priorYearBalances);
  assert.deepEqual(data.musicSystem_lessons, original.musicSystem_lessons);
  assert.deepEqual(data.musicSystem_payments, original.musicSystem_payments);
  assert.deepEqual(data.musicSystem_oneTimePayments, original.musicSystem_oneTimePayments);
  assert.deepEqual(data.musicSystem_titheHistory, original.musicSystem_titheHistory);
  assert.equal(report.patchedYears.length, 1);
  assert.deepEqual(reconcile(data).report.patchedYears, []);
});

test('keeps customized opening year and manager settlement untouched', () => {
  const original = sample();
  original.musicSystem_schoolYearRecords[1].startingLessonNumber = 9;
  const { data, report } = reconcile(original);
  assert.equal(data.musicSystem_schoolYearRecords[1].startingLessonNumber, 9);
  assert.ok(report.pendingFinancialReview.some(x => x.reason === 'custom_opening_terms_preserved'));
});

test('a deleted lesson removes its own bank note from reconciliation', () => {
  const input = sample();
  input.musicSystem_lessons[0].notes = '';
  const { data } = reconcile(input);
  assert.equal(data.musicSystem_schoolYearRecords[0].bankMinutesThisYear, 0);
  assert.equal(data.musicSystem_schoolYearRecords[1].openingCarryoverBankMinutes, 0);
});


test('only explicitly selected students are changed by a scoped proposal', () => {
  const input = sample();
  const { data, report } = reconcile(input, { studentIds: ['s2'] });
  assert.deepEqual(data.musicSystem_schoolYearRecords, input.musicSystem_schoolYearRecords);
  assert.equal(report.patchedYears.length, 0);
});

test('not a generic replacement operation: unknown student selection changes nothing', () => {
  const input = sample();
  const { data } = reconcile(input, { studentIds: ['unknown'] });
  assert.deepEqual(data, input);
});
