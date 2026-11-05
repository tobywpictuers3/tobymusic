import { downloadCanonicalDropboxLatest } from './canonicalDropboxRead';
import { hybridSync } from './hybridSync';
import { isDevMode, markStorageKeyDirty } from './storage';

/**
 * Oct 14 manager-approved school-year corrections. The reconciler intentionally
 * never creates a cash receipt, rewrites an original payment date or changes the
 * frozen 2026 financial snapshots. Only exact old->new transitions are allowed.
 */
type FieldPatch = {
  studentId: string;
  field: string;
  before: string | number;
  after: string | number;
};

const changes: FieldPatch[] = [
  { studentId: 'meu4acdtbmlabhf1ev7', field: 'openingCarryoverBankMinutes', before: 15, after: 0 },
  { studentId: 'meu4acdtbmlabhf1ev7', field: 'startReason', before: 'carryover_credit', after: 'regular' },
  { studentId: 'meu4cfjf2vm3yx7x8yw', field: 'openingCarryoverBankMinutes', before: 25, after: 0 },
  { studentId: 'meu4cfjf2vm3yx7x8yw', field: 'startReason', before: 'carryover_credit', after: 'regular' },
  { studentId: 'meu4d149ful7dtloi2p', field: 'openingCarryoverBankMinutes', before: 10, after: 0 },
  { studentId: 'meu4d149ful7dtloi2p', field: 'startReason', before: 'carryover_credit', after: 'regular' },
  { studentId: 'meu4dw3rv78iesx30oa', field: 'startingLessonNumber', before: 2, after: 1 },
  { studentId: 'meu4dw3rv78iesx30oa', field: 'openingCarryoverLessons', before: 1, after: 0 },
  { studentId: 'meu4ov7iiwxc4ho83j', field: 'openingCarryoverBankMinutes', before: 20, after: 5 },
  { studentId: 'meu4p7x1ycvdw7qf43s', field: 'startingLessonNumber', before: 2, after: 1 },
  { studentId: 'meu4p7x1ycvdw7qf43s', field: 'openingCarryoverLessons', before: 1, after: 0 },
  { studentId: 'meu4qxbfnln43bm1p8r', field: 'startingLessonNumber', before: 2, after: 1 },
  { studentId: 'meu4qxbfnln43bm1p8r', field: 'openingCarryoverLessons', before: 1, after: 0 },
  { studentId: 'mg6wjdlsuuqe208nb7b', field: 'openingCarryoverBankMinutes', before: 15, after: 0 },
  { studentId: 'mg6wjdlsuuqe208nb7b', field: 'startReason', before: 'carryover_credit', after: 'regular' },
  { studentId: '467609a7-75a8-47a1-975f-2fa8dd1839e9', field: 'startingLessonNumber', before: 7, after: 1 },
  { studentId: 'mle4l7wymb16dhqcqtk', field: 'startingLessonNumber', before: 3, after: 2 },
  { studentId: 'mle4l7wymb16dhqcqtk', field: 'openingCarryoverLessons', before: 2, after: 1 },
];
const profileChanges: FieldPatch[] = [
  { studentId: 'meu4p7x1ycvdw7qf43s', field: 'startingLessonNumber', before: 2, after: 1 },
  { studentId: '467609a7-75a8-47a1-975f-2fa8dd1839e9', field: 'startingLessonNumber', before: 7, after: 1 },
];

const approvedTransfers = [
  { studentId: 'meu4b7gdtw6fhk8r6cl', amount: 255.28 },
  { studentId: 'meu4l7fdpse9511pmt', amount: 103.86 },
] as const;

/** The actual receipt is dated Sep 23; the confirmation was made Oct 8.
 * Correct only the settlement's event date, never the existing cash receipt. */
const cashReceiptDateCorrection = {
  studentId: 'mle4l7wymb16dhqcqtk', balance: -421,
  before: '2026-10-08', after: '2026-09-23',
  /** Manager-approved 05.11.2026: actually received 400 of the 421 (21 remains open). */
  approvedReceiptAmount: 400,
} as const;

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const recordsOf = (data: Record<string, any>, bucket: string): Record<string, any>[] => {
  const value = data[bucket];
  if (!Array.isArray(value)) throw new Error('CLOSE_REQUIRED_BUCKET_MISSING:' + bucket);
  return value;
};
const pickUnique = (items: Record<string, any>[], id: string, type: string) => {
  const found = items.filter(item => item.id === id);
  if (found.length !== 1) throw new Error('CLOSE_ID_NOT_UNIQUE:' + type + ':' + id);
  return found[0];
};

const assertSameApprovedFields = (
  local: Record<string, any>,
  remote: Record<string, any>,
  yearFields: FieldPatch[],
  studentFields: FieldPatch[],
) => {
  const targets = [
    { key: 'schoolYearRecords', remoteKey: 'musicSystem_schoolYearRecords', patches: yearFields, suffix: ':2027' },
    { key: 'students', remoteKey: 'musicSystem_students', patches: studentFields, suffix: '' },
  ];
  for (const target of targets) {
    const localRows = recordsOf(local, target.key);
    const remoteRows = recordsOf(remote, target.remoteKey);
    for (const patch of target.patches) {
      const id = patch.studentId + target.suffix;
      const localRecord = pickUnique(localRows, id, target.key);
      const remoteRecord = pickUnique(remoteRows, id, target.key);
      if (localRecord[patch.field] !== remoteRecord[patch.field]) {
        throw new Error('CLOSE_LOCAL_REMOTE_CONFLICT:' + target.key + ':' + id + ':' + patch.field);
      }
      if (localRecord[patch.field] !== patch.before && localRecord[patch.field] !== patch.after) {
        throw new Error('CLOSE_UNEXPECTED_APPROVED_FIELD:' + target.key + ':' + id + ':' + patch.field);
      }
    }
  }
  const localBalances = recordsOf(local, 'priorYearBalances');
  const remoteBalances = recordsOf(remote, 'musicSystem_priorYearBalances');
  const cashDate = cashReceiptDateCorrection;
  const correctionId = cashDate.studentId + ':2027';
  const localCashDate = pickUnique(localBalances, correctionId, 'cashBalance');
  const remoteCashDate = pickUnique(remoteBalances, correctionId, 'cashBalance');
  if (money(localCashDate.signedBalance) !== cashDate.balance ||
      money(remoteCashDate.signedBalance) !== cashDate.balance ||
      localCashDate.settlementMethod !== 'cash' || !localCashDate.settled ||
      localCashDate.settlementDate !== remoteCashDate.settlementDate ||
      (localCashDate.settlementDate !== cashDate.before && localCashDate.settlementDate !== cashDate.after)) {
    throw new Error('CLOSE_RECEIPT_SETTLEMENT_CONFLICT:' + correctionId);
  }
  const receipt = pickUnique(recordsOf(remote, 'oneTimePayments'),
    'prior-year-balance:2027:' + cashDate.studentId, 'cashReceipt');
  if (money(receipt.amount) !== cashDate.approvedReceiptAmount ||
      receipt.paidDate !== cashDate.after || receipt.month !== cashDate.after.slice(0, 7)) {
    throw new Error('CLOSE_ORIGINAL_RECEIPT_CONFLICT:' + correctionId);
  }
  for (const transfer of approvedTransfers) {
    const id = transfer.studentId + ':2027';
    const left = pickUnique(localBalances, id, 'priorYearBalances');
    const right = pickUnique(remoteBalances, id, 'priorYearBalances');
    for (const property of ['signedBalance', 'settlementMethod', 'settled', 'settlementDate']) {
      if ((left[property] ?? null) !== (right[property] ?? null)) {
        throw new Error('CLOSE_BALANCE_REMOTE_CONFLICT:' + id + ':' + property);
      }
    }
    if (money(left.signedBalance) !== transfer.amount || left.requiresVerification) {
      throw new Error('CLOSE_APPROVED_BALANCE_CHANGED:' + id);
    }
    const isPending = left.settlementMethod === 'cash' && left.settled === false && !left.settlementDate;
    const isApplied = left.settlementMethod === 'lessons' && left.settled === true && !left.settlementDate;
    if (!isPending && !isApplied) throw new Error('CLOSE_TRANSFER_HAS_NEW_DECISION:' + id);
    const cashReceiptId = 'prior-year-balance:2027:' + transfer.studentId;
    if (recordsOf(remote, 'oneTimePayments').some(payment => payment.id === cashReceiptId)) {
      throw new Error('CLOSE_TRANSFER_HAS_EXISTING_CASH_RECEIPT:' + id);
    }
  }
};

const verify = (data: Record<string, any>): boolean => {
  try {
    for (const patch of changes) {
      if (pickUnique(recordsOf(data, 'musicSystem_schoolYearRecords'), patch.studentId + ':2027', 'year')[patch.field] !== patch.after) return false;
    }
    for (const patch of profileChanges) {
      if (pickUnique(recordsOf(data, 'musicSystem_students'), patch.studentId, 'student')[patch.field] !== patch.after) return false;
    }
    const correctedCashDate = pickUnique(recordsOf(data, 'musicSystem_priorYearBalances'),
      cashReceiptDateCorrection.studentId + ':2027', 'cashBalance');
    if (correctedCashDate.settlementDate !== cashReceiptDateCorrection.after) return false;
    for (const target of approvedTransfers) {
      const record = pickUnique(recordsOf(data, 'musicSystem_priorYearBalances'), target.studentId + ':2027', 'balance');
      const opening = pickUnique(recordsOf(data, 'musicSystem_schoolYearRecords'), target.studentId + ':2027', 'year');
      if (record.settlementMethod !== 'lessons' || !record.settled ||
          money(record.signedBalance) !== target.amount ||
          money(opening.openingFinancialBalance) !== target.amount) return false;
    }
    return true;
  } catch { return false; }
};

export type Approved2026CloseResult = { changed: boolean; verified: boolean; updatedFields: number; transfers: number; correctedCashDate: boolean };

let inFlight: Promise<Approved2026CloseResult> | undefined;

const execute = async (): Promise<Approved2026CloseResult> => {
  // Never mutate the isolated demo environment; use its normal fixture mechanism.
  if (isDevMode()) return { changed: false, verified: false, updatedFields: 0, transfers: 0, correctedCashDate: false };

  const store = (window as any).__musicSystemStorage as Record<string, any> | undefined;
  if (!store) throw new Error('CLOSE_STORAGE_NOT_INITIALIZED');
  const latest = await downloadCanonicalDropboxLatest();
  if (!latest.success || !latest.data) throw new Error('CLOSE_CANONICAL_READ_FAILED');
  assertSameApprovedFields(store, latest.data, changes, profileChanges);

  const now = new Date().toISOString();
  const yearRecords = recordsOf(store, 'schoolYearRecords').map(x => ({ ...x }));
  const students = recordsOf(store, 'students').map(x => ({ ...x }));
  const balances = recordsOf(store, 'priorYearBalances').map(x => ({ ...x }));
  let updatedFields = 0;
  let transfers = 0;
  let correctedCashDate = false;
  for (const patch of changes) {
    const row = pickUnique(yearRecords, patch.studentId + ':2027', 'year');
    if (row[patch.field] === patch.after) continue;
    row[patch.field] = patch.after;
    row.updatedAt = now;
    updatedFields += 1;
  }
  for (const patch of profileChanges) {
    const row = pickUnique(students, patch.studentId, 'student');
    if (row[patch.field] === patch.after) continue;
    row[patch.field] = patch.after;
    row.lastModified = now;
    updatedFields += 1;
  }
  const datedRow = pickUnique(balances, cashReceiptDateCorrection.studentId + ':2027', 'cashBalance');
  if (datedRow.settlementDate === cashReceiptDateCorrection.before) {
    datedRow.settlementDate = cashReceiptDateCorrection.after;
    datedRow.updatedAt = now;
    datedRow.lastModified = now;
    // Preserve the manager's original confirmation time and the original cash receipt.
    correctedCashDate = true;
  }
  for (const transfer of approvedTransfers) {
    const row = pickUnique(balances, transfer.studentId + ':2027', 'balance');
    if (row.settlementMethod === 'lessons' && row.settled) continue;
    Object.assign(row, {
      settlementMethod: 'lessons',
      settled: true,
      settlementDate: undefined,
      settlementConfirmedAt: '2026-10-14T18:32:40.000Z',
      settlementConfirmedBy: 'manager',
      closingDecisionSource: 'manager_approved_2026_10_14',
      lastModified: now,
      updatedAt: now,
    });
    transfers += 1;
  }

  const changed = updatedFields + transfers > 0 || correctedCashDate;
  if (changed) {
    if (updatedFields) {
      store.schoolYearRecords = yearRecords;
      store.students = students;
      markStorageKeyDirty('schoolYearRecords');
      markStorageKeyDirty('students');
    }
    if (transfers || correctedCashDate) {
      store.priorYearBalances = balances;
      markStorageKeyDirty('priorYearBalances');
    }
    await hybridSync.onDataChange();
    await hybridSync.manualSync();
  }

  // A verified canonical write takes ~10-15s (upload + read-back), so poll for up to ~60s.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const after = await downloadCanonicalDropboxLatest();
    if (after.success && after.data && verify(after.data)) {
      if (changed) window.dispatchEvent(new Event('toby:year-close-reconciled'));
      return { changed, verified: true, updatedFields, transfers, correctedCashDate };
    }
    if (attempt === 2 || attempt === 8 || attempt === 14) await hybridSync.manualSync();
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('CLOSE_READBACK_NOT_VERIFIED');
};

/** Approved, fixed-value migration; idempotent and serialized per browser tab. */
export const reconcileApproved2026CloseDurably = (): Promise<Approved2026CloseResult> => {
  if (!inFlight) {
    inFlight = execute().finally(() => { inFlight = undefined; });
  }
  return inFlight;
};
