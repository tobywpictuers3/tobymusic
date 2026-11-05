import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const src = readFileSync('src/lib/approved2026CloseReconciliation.ts', 'utf8');
const compiled = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const clone = value => JSON.parse(JSON.stringify(value));

function harness() {
  let remote;
  const local = { schoolYearRecords: [], students: [], priorYearBalances: [] };
  const dirty = [];
  let uploads = 0;
  const module = { exports: {} };
  const mocks = {
    './canonicalDropboxRead': { downloadCanonicalDropboxLatest: async () =>
      ({ success: true, data: clone(remote) }) },
    './storage': { isDevMode: () => false, markStorageKeyDirty: key => dirty.push(key) },
    './hybridSync': { hybridSync: {
      onDataChange: async () => {
        remote.musicSystem_schoolYearRecords = clone(local.schoolYearRecords);
        remote.musicSystem_students = clone(local.students);
        remote.musicSystem_priorYearBalances = clone(local.priorYearBalances);
        uploads++;
        return { success: true };
      },
      manualSync: async () => true,
    } },
  };
  const context = {
    module, exports: module.exports,
    require: name => {
      if (!(name in mocks)) throw new Error('Unexpected import: ' + name);
      return mocks[name];
    },
    window: { __musicSystemStorage: local, dispatchEvent: () => {} },
    Event: class Event { constructor(type) { this.type = type; } },
    setTimeout: fn => fn(),
  };
  runInNewContext(compiled + '\nmodule.exports.__test = { changes, profileChanges, approvedTransfers };', context);
  const { changes, profileChanges, approvedTransfers } = module.exports.__test;

  const years = new Map();
  for (const patch of changes) {
    const id = patch.studentId + ':2027';
    if (!years.has(id)) years.set(id, { id, studentId: patch.studentId, schoolYear: 2027, status: 'open' });
    years.get(id)[patch.field] = patch.before;
  }
  for (const transfer of approvedTransfers) {
    const id = transfer.studentId + ':2027';
    years.set(id, { id, studentId: transfer.studentId, schoolYear: 2027, status: 'open',
      openingFinancialBalance: transfer.amount });
    local.priorYearBalances.push({ id, studentId: transfer.studentId,
      targetSchoolYear: 2027, sourceSchoolYear: 2026,
      signedBalance: transfer.amount, settlementMethod: 'cash',
      settled: false, requiresVerification: false, source: 'annual_rollover' });
  }
  local.schoolYearRecords = [...years.values()];
  local.students = profileChanges.map(patch => ({
    id: patch.studentId, [patch.field]: patch.before,
  }));
  local.priorYearBalances.push({
    id: 'mle4l7wymb16dhqcqtk:2027',
    studentId: 'mle4l7wymb16dhqcqtk', sourceSchoolYear: 2026,
    targetSchoolYear: 2027, signedBalance: -421,
    settlementMethod: 'cash', settled: true, settlementDate: '2026-10-08',
    settlementConfirmedAt: '2026-10-08T07:57:18.448Z', requiresVerification: false,
  });
  remote = {
    musicSystem_schoolYearRecords: clone(local.schoolYearRecords),
    musicSystem_students: clone(local.students),
    musicSystem_priorYearBalances: clone(local.priorYearBalances),
    oneTimePayments: [{ id: 'prior-year-balance:2027:mle4l7wymb16dhqcqtk',
      month: '2026-09', amount: 400, paidDate: '2026-09-23' }],
  };

  return {
    reconcile: module.exports.reconcileApproved2026CloseDurably,
    local, dirty, getRemote: () => remote, uploads: () => uploads,
    setRemote: x => { remote = x; },
  };
}

test('applies exactly approved 2026 year-field changes and two carryovers without cash duplication', async () => {
  const h = harness();
  const cashBefore = clone(h.getRemote().oneTimePayments);
  const result = await h.reconcile();
  assert.equal(result.verified, true);
  assert.equal(result.transfers, 2);
  assert.equal(result.updatedFields, 20);
  assert.equal(result.correctedCashDate, true);
  assert.equal(h.getRemote().oneTimePayments.length, 1);
  assert.deepEqual(h.getRemote().oneTimePayments, cashBefore);
  for (const row of h.getRemote().musicSystem_priorYearBalances.filter(r =>
    ['meu4b7gdtw6fhk8r6cl', 'meu4l7fdpse9511pmt'].includes(r.studentId))) {
    assert.equal(row.settlementMethod, 'lessons');
    assert.equal(row.settled, true);
    assert.equal(row.settlementConfirmedBy, 'manager');
    assert.equal(row.settlementDate, undefined);
  }
  const dated = h.getRemote().musicSystem_priorYearBalances.find(r =>
    r.studentId === 'mle4l7wymb16dhqcqtk');
  assert.equal(dated.settlementDate, '2026-09-23');
  assert.equal(dated.settlementConfirmedAt, '2026-10-08T07:57:18.448Z');

  const beforeRepeat = clone(h.getRemote());
  const repeated = await h.reconcile();
  assert.equal(repeated.changed, false);
  assert.equal(repeated.verified, true);
  assert.equal(h.uploads(), 1);
  assert.deepEqual(h.getRemote(), beforeRepeat);
});

test('aborts without mutation if canonical value diverged from loaded value', async () => {
  const h = harness();
  const remote = clone(h.getRemote());
  remote.musicSystem_schoolYearRecords[0].openingCarryoverBankMinutes = 999;
  h.setRemote(remote);
  await assert.rejects(h.reconcile(), /CLOSE_LOCAL_REMOTE_CONFLICT/);
  assert.equal(h.uploads(), 0);
});

test('never erases a previously recorded cash settlement when a proposed credit transfer conflicts', async () => {
  const h = harness();
  const remote = clone(h.getRemote());
  remote.oneTimePayments.push({
    id: 'prior-year-balance:2027:meu4b7gdtw6fhk8r6cl',
    amount: -255.28, month: '2026-10', paidDate: '2026-10-10',
  });
  h.setRemote(remote);
  await assert.rejects(h.reconcile(), /CLOSE_TRANSFER_HAS_EXISTING_CASH_RECEIPT/);
  assert.equal(h.uploads(), 0);
});
