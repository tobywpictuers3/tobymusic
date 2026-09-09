import { downloadCanonicalDropboxLatest } from './canonicalDropboxRead';
import { hybridSync } from './hybridSync';
import {
  ensurePriorYearBalanceRows,
  getPriorYearBalanceRecords,
  replacePriorYearBalanceRecords,
  updatePriorYearBalanceRecord,
  type PriorYearBalanceRecord,
} from './priorYearBalances';
import { getDevStore, getStudents, isDevMode } from './storage';
import type { Student } from './types';

export interface ManagedPriorYearBalanceRecord extends PriorYearBalanceRecord {
  /** Present only after an explicit manager settlement action. */
  settlementConfirmedAt?: string | null;
  settlementConfirmedBy?: 'manager' | null;
  /** Conflict-resolution clock for settlement edits/reopens. */
  lastModified?: string;
}

export type PriorYearSettlementAction = 'cash' | 'lessons' | 'reopen';

export type PriorYearSettlementPrepareResult = {
  rows: ManagedPriorYearBalanceRecord[];
  changed: boolean;
  verified: boolean;
};

const roundMoney = (value: number) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const mutableStore = (): Record<string, any> => {
  if (isDevMode()) return getDevStore();
  if (typeof window === 'undefined') return {};
  return (window as any).__musicSystemStorage || {};
};

const settlementPaymentId = (row: Pick<PriorYearBalanceRecord, 'targetSchoolYear' | 'studentId'>) =>
  `prior-year-balance:${row.targetSchoolYear}:${row.studentId}`;

const isAutomaticUnconfirmedLessonDecision = (
  row: ManagedPriorYearBalanceRecord,
  targetSchoolYear: number,
) => Boolean(
  row.targetSchoolYear === targetSchoolYear &&
  row.signedBalance !== 0 &&
  !row.requiresVerification &&
  row.settlementMethod === 'lessons' &&
  row.settled &&
  !row.settlementDate &&
  !row.settlementConfirmedAt &&
  row.source !== 'manual'
);

const shouldCarryMoney = (row: ManagedPriorYearBalanceRecord) => Boolean(
  !row.requiresVerification &&
  row.settled &&
  row.settlementMethod === 'lessons'
);

const reconcileAnnualOpeningBalances = (
  rows: ManagedPriorYearBalanceRecord[],
  targetSchoolYear: number,
): boolean => {
  const store = mutableStore();
  const students: Student[] = getStudents().map(student => ({ ...student }));
  const records: any[] = Array.isArray(store.schoolYearRecords)
    ? store.schoolYearRecords.map((record: any) => ({ ...record }))
    : [];
  const studentIndex = new Map(students.map((student, index) => [student.id, index]));
  const now = new Date().toISOString();
  let changed = false;

  for (const row of rows) {
    if (row.targetSchoolYear !== targetSchoolYear) continue;
    const index = studentIndex.get(row.studentId);
    if (index === undefined) continue;
    const student = students[index];
    if (student.paymentType === 'per_lesson' || row.paymentTrack === 'per_lesson') continue;

    const recordIndex = records.findIndex(record =>
      record.studentId === row.studentId &&
      record.schoolYear === targetSchoolYear &&
      record.status === 'open'
    );
    if (recordIndex < 0) continue;

    const current = records[recordIndex];
    const desiredOpening = shouldCarryMoney(row) ? roundMoney(row.signedBalance) : 0;
    const currentOpening = roundMoney(Number(current.openingFinancialBalance || 0));
    const netTarget = roundMoney(Math.max(0, Number(current.baseTarget || 0) - desiredOpening));
    const desiredCalculated = Math.abs(netTarget - Number(current.annualAmountFull || 0)) > 0.009
      ? netTarget
      : undefined;
    const desiredMonthly = student.paymentMonths > 0
      ? roundMoney(netTarget / student.paymentMonths)
      : netTarget;

    const calculatedChanged = desiredCalculated === undefined
      ? student.calculatedAmount !== undefined
      : Math.abs(Number(student.calculatedAmount || 0) - desiredCalculated) > 0.009;
    const monthlyChanged = Math.abs(Number(student.monthlyAmount || 0) - desiredMonthly) > 0.009;

    if (Math.abs(currentOpening - desiredOpening) > 0.009) {
      records[recordIndex] = {
        ...current,
        openingFinancialBalance: desiredOpening,
        updatedAt: now,
      };
      changed = true;
    }

    if (calculatedChanged || monthlyChanged) {
      students[index] = {
        ...student,
        calculatedAmount: desiredCalculated,
        monthlyAmount: desiredMonthly,
        lastModified: now,
      };
      changed = true;
    }
  }

  if (changed) {
    store.schoolYearRecords = records;
    store.students = students;
  }
  return changed;
};

/**
 * Materialize the closing table, but never let an inferred row decide how money
 * is settled. Non-zero automatic rows are normalized to a pending state.
 * Internally pending uses cash+unsettled so legacy ledgers do not treat it as a
 * carried opening balance before the manager explicitly confirms "lessons".
 */
export const preparePriorYearSettlementRows = (
  targetSchoolYear: number,
): { rows: ManagedPriorYearBalanceRecord[]; changed: boolean } => {
  const materialized = ensurePriorYearBalanceRows(targetSchoolYear) as ManagedPriorYearBalanceRecord[];
  const now = new Date().toISOString();
  let changed = false;

  const normalized = materialized.map(row => {
    if (isAutomaticUnconfirmedLessonDecision(row, targetSchoolYear)) {
      changed = true;
      return {
        ...row,
        settlementMethod: 'cash' as const,
        settled: false,
        settlementDate: undefined,
        lastModified: now,
        updatedAt: now,
      };
    }
    if (row.requiresVerification && row.settled) {
      changed = true;
      return {
        ...row,
        settled: false,
        settlementDate: undefined,
        lastModified: now,
        updatedAt: now,
      };
    }
    return row;
  });

  if (changed) {
    replacePriorYearBalanceRecords(normalized, { sync: false });
  }

  const annualChanged = reconcileAnnualOpeningBalances(normalized, targetSchoolYear);
  if (changed || annualChanged) {
    void hybridSync.onDataChange();
  }

  return { rows: normalized, changed: changed || annualChanged };
};

const remoteRows = (data: Record<string, any>): ManagedPriorYearBalanceRecord[] =>
  Array.isArray(data.musicSystem_priorYearBalances) ? data.musicSystem_priorYearBalances : [];

const remoteOneTimePayments = (data: Record<string, any>): any[] => {
  if (Array.isArray(data.oneTimePayments)) return data.oneTimePayments;
  if (Array.isArray(data.musicSystem_oneTimePayments)) return data.musicSystem_oneTimePayments;
  return [];
};

const verifyRemoteRecord = (
  data: Record<string, any>,
  expected: ManagedPriorYearBalanceRecord,
): boolean => {
  const actual = remoteRows(data).find(row => row.id === expected.id);
  if (!actual) return false;
  if (roundMoney(actual.signedBalance) !== roundMoney(expected.signedBalance)) return false;
  if (actual.settlementMethod !== expected.settlementMethod) return false;
  if (Boolean(actual.settled) !== Boolean(expected.settled)) return false;
  if ((actual.settlementDate || '') !== (expected.settlementDate || '')) return false;
  if ((actual.settlementConfirmedAt || '') !== (expected.settlementConfirmedAt || '')) return false;
  if ((actual.lastModified || '') !== (expected.lastModified || '')) return false;

  const cashId = settlementPaymentId(expected);
  const cashRow = remoteOneTimePayments(data).find(payment => payment.id === cashId);
  const shouldHaveCash = Boolean(
    expected.settled &&
    expected.settlementMethod === 'cash' &&
    expected.settlementDate &&
    !expected.requiresVerification &&
    expected.signedBalance !== 0
  );

  if (shouldHaveCash) {
    if (!cashRow) return false;
    if (cashRow.month !== expected.settlementDate!.slice(0, 7)) return false;
    if ((cashRow.paidDate || '').slice(0, 10) !== expected.settlementDate) return false;
    if (roundMoney(cashRow.amount) !== roundMoney(-expected.signedBalance)) return false;
  } else if (cashRow) {
    return false;
  }

  if (expected.paymentTrack !== 'per_lesson') {
    const annualRecord = Array.isArray(data.musicSystem_schoolYearRecords)
      ? data.musicSystem_schoolYearRecords.find((record: any) =>
          record.studentId === expected.studentId &&
          record.schoolYear === expected.targetSchoolYear &&
          record.status === 'open'
        )
      : undefined;
    if (annualRecord) {
      const desired = shouldCarryMoney(expected) ? roundMoney(expected.signedBalance) : 0;
      if (roundMoney(Number(annualRecord.openingFinancialBalance || 0)) !== desired) return false;
    }
  }

  return true;
};

const syncAndVerify = async (
  expectedRows: ManagedPriorYearBalanceRecord[],
): Promise<boolean> => {
  if (isDevMode()) return true;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const synced = await hybridSync.manualSync();
    if (!synced) continue;
    const remote = await downloadCanonicalDropboxLatest();
    if (!remote.success || !remote.data) continue;
    if (expectedRows.every(row => verifyRemoteRecord(remote.data!, row))) return true;
  }
  return false;
};

export const preparePriorYearSettlementRowsDurably = async (
  targetSchoolYear: number,
  options: { forceSync?: boolean } = {},
): Promise<PriorYearSettlementPrepareResult> => {
  const prepared = preparePriorYearSettlementRows(targetSchoolYear);
  const rows = prepared.rows.filter(row => row.targetSchoolYear === targetSchoolYear);
  if (isDevMode()) return { rows, changed: prepared.changed, verified: true };
  if (!prepared.changed && !options.forceSync) return { rows, changed: false, verified: true };

  const verified = await syncAndVerify(rows);
  if (!verified) throw new Error('PRIOR_YEAR_PREPARE_READBACK_MISMATCH');
  return { rows, changed: prepared.changed, verified: true };
};

const replaceManagedRow = (next: ManagedPriorYearBalanceRecord) => {
  const rows = getPriorYearBalanceRecords() as ManagedPriorYearBalanceRecord[];
  const index = rows.findIndex(row => row.id === next.id);
  if (index < 0) return;
  rows[index] = next;
  replacePriorYearBalanceRecords(rows, { sync: false });
};

export const settlePriorYearBalanceDurably = async (
  id: string,
  action: PriorYearSettlementAction,
  executionDate?: string,
): Promise<ManagedPriorYearBalanceRecord> => {
  const current = (getPriorYearBalanceRecords() as ManagedPriorYearBalanceRecord[]).find(row => row.id === id);
  if (!current) throw new Error('PRIOR_YEAR_BALANCE_NOT_FOUND');
  if (current.requiresVerification && action !== 'reopen') throw new Error('PRIOR_YEAR_BALANCE_REQUIRES_VERIFICATION');

  let updated: PriorYearBalanceRecord | undefined;
  if (action === 'cash') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(executionDate || '')) throw new Error('SETTLEMENT_DATE_REQUIRED');
    updated = updatePriorYearBalanceRecord(id, {
      settlementMethod: 'cash',
      settled: true,
      settlementDate: executionDate,
    });
  } else if (action === 'lessons') {
    updated = updatePriorYearBalanceRecord(id, {
      settlementMethod: 'lessons',
      settled: true,
      settlementDate: undefined,
    });
  } else {
    updated = updatePriorYearBalanceRecord(id, {
      settlementMethod: 'cash',
      settled: false,
      settlementDate: undefined,
    });
  }
  if (!updated) throw new Error('PRIOR_YEAR_BALANCE_UPDATE_FAILED');

  const now = new Date().toISOString();
  const managed: ManagedPriorYearBalanceRecord = action === 'reopen'
    ? {
        ...updated,
        settlementMethod: 'cash',
        settled: updated.signedBalance === 0 && !updated.requiresVerification,
        settlementDate: undefined,
        settlementConfirmedAt: null,
        settlementConfirmedBy: null,
        lastModified: now,
        updatedAt: now,
      }
    : {
        ...updated,
        settlementConfirmedAt: now,
        settlementConfirmedBy: 'manager',
        lastModified: now,
        updatedAt: now,
      };

  replaceManagedRow(managed);
  reconcileAnnualOpeningBalances([managed], managed.targetSchoolYear);
  if (!isDevMode()) await hybridSync.onDataChange();

  const verified = await syncAndVerify([managed]);
  if (!verified) throw new Error('PRIOR_YEAR_SETTLEMENT_READBACK_MISMATCH');
  return managed;
};

export const editPriorYearBalanceDurably = async (
  id: string,
  signedBalance: number,
): Promise<ManagedPriorYearBalanceRecord> => {
  if (!Number.isFinite(signedBalance)) throw new Error('INVALID_SIGNED_BALANCE');
  const updated = updatePriorYearBalanceRecord(id, {
    signedBalance: roundMoney(signedBalance),
    settlementMethod: 'cash',
    settled: false,
    settlementDate: undefined,
  });
  if (!updated) throw new Error('PRIOR_YEAR_BALANCE_UPDATE_FAILED');

  const now = new Date().toISOString();
  const next: ManagedPriorYearBalanceRecord = {
    ...updated,
    settlementMethod: 'cash',
    settled: roundMoney(updated.signedBalance) === 0,
    settlementDate: undefined,
    settlementConfirmedAt: null,
    settlementConfirmedBy: null,
    lastModified: now,
    updatedAt: now,
  };
  replaceManagedRow(next);
  reconcileAnnualOpeningBalances([next], next.targetSchoolYear);
  if (!isDevMode()) await hybridSync.onDataChange();

  const verified = await syncAndVerify([next]);
  if (!verified) throw new Error('PRIOR_YEAR_BALANCE_EDIT_READBACK_MISMATCH');
  return next;
};
