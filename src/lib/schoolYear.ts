import { getDevStore, getLessons, getPayments, getStudents, isDevMode } from './storage';
import { hybridSync } from './hybridSync';
import type { Lesson, Payment, Student } from './types';

export const FULL_YEAR_LESSONS = 38;
export const FIRST_AUTOMATED_ROLLOVER_YEAR = 2026;

export type SchoolYearStartReason = 'regular' | 'midyear_join' | 'carryover_credit';
export type SchoolYearRecordStatus = 'open' | 'closed';

export interface SchoolYearPaymentRow {
  id: string;
  month: string;
  amount: number;
  status: Payment['status'];
  paymentMethod: Payment['paymentMethod'];
  paidDate?: string;
  notes?: string;
}

export interface StudentSchoolYearRecord {
  id: string;
  studentId: string;
  schoolYear: number;
  status: SchoolYearRecordStatus;
  startReason: SchoolYearStartReason;
  startingLessonNumber: number;
  expectedLessons: number;
  annualAmountFull: number;
  baseTarget: number;
  openingFinancialBalance: number;
  openingCarryoverLessons: number;
  openingCarryoverBankMinutes: number;
  source: 'legacy' | 'manual' | 'rollover';
  createdAt: string;
  updatedAt: string;
  closedAt?: string;

  completedLessons?: number;
  bankMinutesThisYear?: number;
  effectiveSixths?: number;
  shortfallSixths?: number;
  excessSixths?: number;
  contractLessonPrice?: number;
  yearEndAdjustment?: number;
  finalTarget?: number;
  paidTotal?: number;
  closingFinancialBalance?: number;
  carryoverWholeLessons?: number;
  carryoverBankMinutes?: number;
  lessonDebtSixths?: number;
  lessonDebtValue?: number;
  payments?: SchoolYearPaymentRow[];
}

export interface StudentYearSnapshot extends StudentSchoolYearRecord {
  completedLessons: number;
  bankMinutesThisYear: number;
  effectiveSixths: number;
  shortfallSixths: number;
  excessSixths: number;
  contractLessonPrice: number;
  yearEndAdjustment: number;
  finalTarget: number;
  paidTotal: number;
  closingFinancialBalance: number;
  carryoverWholeLessons: number;
  carryoverBankMinutes: number;
  lessonDebtSixths: number;
  lessonDebtValue: number;
  payments: SchoolYearPaymentRow[];
}

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const jerusalemDateParts = (date: Date): { year: number; month: number; day: number } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
};

const dateToIso = (date: Date): string => {
  const { year, month, day } = jerusalemDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const getMutableStore = (): Record<string, any> => {
  if (isDevMode()) return getDevStore();
  if (typeof window === 'undefined') return {};
  return (window as any).__musicSystemStorage || {};
};

export const getSchoolYearForDate = (value: Date | string = new Date()): number => {
  if (typeof value === 'string') {
    const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      return month >= 9 ? year + 1 : year;
    }
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  const { year, month } = jerusalemDateParts(date);
  return month >= 9 ? year + 1 : year;
};

export const getSchoolYearBounds = (schoolYear: number) => ({
  start: `${schoolYear - 1}-09-01`,
  end: `${schoolYear}-08-31`,
});

export const getSchoolYearLabel = (schoolYear: number): string =>
  `${schoolYear - 1}-${String(schoolYear).slice(-2)}`;

export const getSchoolYearStartReasonLabel = (reason: SchoolYearStartReason): string => {
  if (reason === 'midyear_join') return 'הצטרפות באמצע שנה';
  if (reason === 'carryover_credit') return 'מיספור מועבר משנה קודמת';
  return 'שנה מלאה';
};

export const getBillingLessonCount = (
  startingLessonNumber: number,
  reason: SchoolYearStartReason,
): number => {
  if (reason !== 'midyear_join') return FULL_YEAR_LESSONS;
  return Math.max(0, FULL_YEAR_LESSONS - Math.max(1, startingLessonNumber) + 1);
};

export const calculateBaseAnnualTarget = (
  annualAmountFull: number,
  startingLessonNumber: number,
  reason: SchoolYearStartReason,
): number => {
  const expectedLessons = getBillingLessonCount(startingLessonNumber, reason);
  if (reason !== 'midyear_join') return roundMoney(Math.max(0, annualAmountFull));
  return roundMoney(Math.max(0, annualAmountFull) * expectedLessons / FULL_YEAR_LESSONS);
};

export const inferLegacyStartReason = (
  student: Student,
  schoolYear = getSchoolYearForDate(),
): SchoolYearStartReason => {
  const existing = getStudentSchoolYearRecord(student.id, schoolYear);
  if (existing) return existing.startReason;
  if ((student.startingLessonNumber || 1) > 1) return 'midyear_join';
  return 'regular';
};

export const getStudentSchoolYearRecords = (studentId?: string): StudentSchoolYearRecord[] => {
  const store = getMutableStore();
  const records = Array.isArray(store.schoolYearRecords) ? store.schoolYearRecords : [];
  return records
    .filter((record: StudentSchoolYearRecord) => !studentId || record.studentId === studentId)
    .map((record: StudentSchoolYearRecord) => ({ ...record }))
    .sort((a: StudentSchoolYearRecord, b: StudentSchoolYearRecord) => b.schoolYear - a.schoolYear);
};

export const getStudentSchoolYearRecord = (
  studentId: string,
  schoolYear: number,
): StudentSchoolYearRecord | undefined =>
  getStudentSchoolYearRecords(studentId).find(record => record.schoolYear === schoolYear);

export const upsertStudentSchoolYearTerms = (
  studentId: string,
  schoolYear: number,
  terms: {
    startReason: SchoolYearStartReason;
    startingLessonNumber: number;
    annualAmountFull: number;
    openingFinancialBalance?: number;
    openingCarryoverLessons?: number;
    openingCarryoverBankMinutes?: number;
    source?: StudentSchoolYearRecord['source'];
  },
): StudentSchoolYearRecord => {
  const store = getMutableStore();
  const records: StudentSchoolYearRecord[] = Array.isArray(store.schoolYearRecords)
    ? [...store.schoolYearRecords]
    : [];
  const now = new Date().toISOString();
  const index = records.findIndex(record => record.studentId === studentId && record.schoolYear === schoolYear);
  const previous = index >= 0 ? records[index] : undefined;

  // Closed annual reports are historical snapshots. Changing their terms while
  // retaining old closing calculations creates an internally inconsistent year.
  // A future audited correction flow must reopen/recompute explicitly instead.
  if (previous?.status === 'closed') {
    throw new Error('closed_school_year_requires_correction');
  }

  const startingLessonNumber = Math.max(1, Math.round(terms.startingLessonNumber || 1));
  const expectedLessons = getBillingLessonCount(startingLessonNumber, terms.startReason);
  const baseTarget = calculateBaseAnnualTarget(terms.annualAmountFull, startingLessonNumber, terms.startReason);

  const next: StudentSchoolYearRecord = {
    id: previous?.id || `${studentId}:${schoolYear}`,
    studentId,
    schoolYear,
    status: previous?.status || 'open',
    startReason: terms.startReason,
    startingLessonNumber,
    expectedLessons,
    annualAmountFull: roundMoney(Math.max(0, terms.annualAmountFull)),
    baseTarget,
    openingFinancialBalance: roundMoney(terms.openingFinancialBalance ?? previous?.openingFinancialBalance ?? 0),
    openingCarryoverLessons: Math.max(0, Math.round(terms.openingCarryoverLessons ?? previous?.openingCarryoverLessons ?? 0)),
    openingCarryoverBankMinutes: Math.round((terms.openingCarryoverBankMinutes ?? previous?.openingCarryoverBankMinutes ?? 0) / 5) * 5,
    source: terms.source || previous?.source || 'manual',
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    closedAt: previous?.closedAt,
  };

  if (index >= 0) records[index] = { ...previous, ...next };
  else records.push(next);
  store.schoolYearRecords = records;
  if (!isDevMode()) void hybridSync.onDataChange();
  return next;
};

export const extractBankMinutesFromNotes = (notes?: string): number => {
  if (!notes) return 0;
  const matches = notes.match(/בנק זמן:\s*([+-]?\d+)\s*דקות?/g);
  if (!matches) return 0;
  return matches.reduce((sum, match) => {
    const value = match.match(/([+-]?\d+)/)?.[1];
    return sum + (value ? Number.parseInt(value, 10) : 0);
  }, 0);
};

export const normalizeBankMinutesToFive = (minutes: number): number => Math.round(minutes / 5) * 5;

export const isPriorYearDebtMakeupLesson = (lesson: Pick<Lesson, 'notes'>): boolean =>
  Boolean(lesson.notes?.includes('השלמת חוב משנה"ל') || lesson.notes?.includes('השלמת חוב משנהל'));

const getLegacyTerms = (student: Student, schoolYear: number): StudentSchoolYearRecord => {
  const reason = inferLegacyStartReason(student, schoolYear);
  const startingLessonNumber = Math.max(1, student.startingLessonNumber || 1);
  const expectedLessons = getBillingLessonCount(startingLessonNumber, reason);
  const autoBase = calculateBaseAnnualTarget(student.annualAmount || 0, startingLessonNumber, reason);
  const existingCalculated = Number(student.calculatedAmount || 0);
  const baseTarget = existingCalculated > 0 ? roundMoney(existingCalculated) : autoBase;
  const now = new Date().toISOString();

  return {
    id: `${student.id}:${schoolYear}`,
    studentId: student.id,
    schoolYear,
    status: 'open',
    startReason: reason,
    startingLessonNumber,
    expectedLessons,
    annualAmountFull: roundMoney(student.annualAmount || 0),
    baseTarget,
    openingFinancialBalance: 0,
    openingCarryoverLessons: 0,
    openingCarryoverBankMinutes: 0,
    source: 'legacy',
    createdAt: now,
    updatedAt: now,
  };
};

const paymentRowsForYear = (studentId: string, schoolYear: number): SchoolYearPaymentRow[] => {
  const { start, end } = getSchoolYearBounds(schoolYear);
  const startMonth = start.slice(0, 7);
  const endMonth = end.slice(0, 7);
  return getPayments()
    .filter(payment => payment.studentId === studentId && payment.month >= startMonth && payment.month <= endMonth)
    .map(payment => ({
      id: payment.id,
      month: payment.month,
      amount: roundMoney(payment.amount || 0),
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      paidDate: payment.paidDate,
      notes: payment.notes,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

export const calculateStudentYearSnapshot = (
  student: Student,
  schoolYear: number,
): StudentYearSnapshot => {
  const stored = getStudentSchoolYearRecord(student.id, schoolYear);
  const terms = stored || getLegacyTerms(student, schoolYear);
  const { start, end } = getSchoolYearBounds(schoolYear);
  const completed = getLessons()
    .filter(lesson =>
      lesson.studentId === student.id &&
      lesson.status === 'completed' &&
      lesson.date >= start &&
      lesson.date <= end &&
      !isPriorYearDebtMakeupLesson(lesson),
    );

  const bankMinutesThisYear = normalizeBankMinutesToFive(
    completed.reduce((sum, lesson) => sum + extractBankMinutesFromNotes(lesson.notes), 0),
  );
  const effectiveSixths = completed.length * 6 + Math.round(bankMinutesThisYear / 5);
  const expectedSixths = Math.max(0, terms.expectedLessons) * 6;
  const shortfallSixths = Math.max(0, expectedSixths - effectiveSixths);
  const excessSixths = Math.max(0, effectiveSixths - expectedSixths);
  const contractLessonPrice = terms.expectedLessons > 0
    ? roundMoney(terms.baseTarget / terms.expectedLessons)
    : 0;
  const lessonDebtValue = roundMoney((shortfallSixths / 6) * contractLessonPrice);
  const yearEndAdjustment = roundMoney(-lessonDebtValue);
  const finalTarget = roundMoney(Math.max(0, terms.baseTarget + yearEndAdjustment));
  const payments = paymentRowsForYear(student.id, schoolYear);
  const paidTotal = roundMoney(
    payments.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0),
  );
  const closingFinancialBalance = roundMoney(terms.openingFinancialBalance + paidTotal - finalTarget);
  const carryoverWholeLessons = Math.floor(excessSixths / 6);
  const carryoverBankMinutes = (excessSixths % 6) * 5;

  return {
    ...terms,
    completedLessons: completed.length,
    bankMinutesThisYear,
    effectiveSixths,
    shortfallSixths,
    excessSixths,
    contractLessonPrice,
    yearEndAdjustment,
    finalTarget,
    paidTotal,
    closingFinancialBalance,
    carryoverWholeLessons,
    carryoverBankMinutes,
    lessonDebtSixths: shortfallSixths,
    lessonDebtValue,
    payments,
  };
};

export const getStudentYearSnapshot = (
  studentId: string,
  schoolYear: number,
): StudentYearSnapshot | undefined => {
  const student = getStudents().find(item => item.id === studentId);
  if (!student || student.paymentType === 'per_lesson') return undefined;
  return calculateStudentYearSnapshot(student, schoolYear);
};

export const formatLessonSixths = (sixths: number): string => {
  const sign = sixths < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(sixths));
  const whole = Math.floor(absolute / 6);
  const remainder = absolute % 6;
  const fractions = ['', '⅙', '⅓', '½', '⅔', '⅚'];
  if (remainder === 0) return `${sign}${whole}`;
  return `${sign}${whole > 0 ? whole : ''}${fractions[remainder]}`;
};

export const isYearEndReportAvailable = (
  schoolYear: number,
  now = new Date(),
): boolean => {
  const stored = getStudentSchoolYearRecords().some(record => record.schoolYear === schoolYear && record.status === 'closed');
  if (stored) return true;
  return dateToIso(now) >= `${schoolYear}-08-31`;
};

const closeRecordFromSnapshot = (snapshot: StudentYearSnapshot, closedAt: string): StudentSchoolYearRecord => ({
  ...snapshot,
  status: 'closed',
  closedAt,
  updatedAt: closedAt,
});

export const ensureSchoolYearRollover = async (now = new Date()): Promise<{
  changed: boolean;
  closedYear?: number;
  openedYear?: number;
  studentsProcessed: number;
}> => {
  const currentSchoolYear = getSchoolYearForDate(now);
  const previousSchoolYear = currentSchoolYear - 1;

  // This feature is introduced during school year 2026. Never fabricate older archives.
  if (previousSchoolYear < FIRST_AUTOMATED_ROLLOVER_YEAR) {
    return { changed: false, studentsProcessed: 0 };
  }

  const rolloverDate = `${currentSchoolYear - 1}-09-01`;
  if (dateToIso(now) < rolloverDate) {
    return { changed: false, studentsProcessed: 0 };
  }

  const store = getMutableStore();
  const students: Student[] = getStudents().map(student => ({ ...student }));
  const records: StudentSchoolYearRecord[] = Array.isArray(store.schoolYearRecords)
    ? store.schoolYearRecords.map((record: StudentSchoolYearRecord) => ({ ...record }))
    : [];
  const closedAt = now.toISOString();
  let changed = false;
  let processed = 0;

  for (let index = 0; index < students.length; index += 1) {
    const student = students[index];
    if (student.paymentType === 'per_lesson') continue;

    let previousRecord = records.find(record =>
      record.studentId === student.id && record.schoolYear === previousSchoolYear,
    );

    if (!previousRecord || previousRecord.status !== 'closed') {
      const snapshot = calculateStudentYearSnapshot(student, previousSchoolYear);
      const closedRecord = closeRecordFromSnapshot(snapshot, closedAt);
      const existingIndex = records.findIndex(record =>
        record.studentId === student.id && record.schoolYear === previousSchoolYear,
      );
      if (existingIndex >= 0) records[existingIndex] = closedRecord;
      else records.push(closedRecord);
      previousRecord = closedRecord;
      changed = true;
    }

    // Inactive students get their archive, but no new annual card is opened.
    if (student.isActive === false) {
      processed += 1;
      continue;
    }

    const currentExists = records.some(record =>
      record.studentId === student.id && record.schoolYear === currentSchoolYear,
    );
    if (currentExists) {
      processed += 1;
      continue;
    }

    const carryoverLessons = previousRecord.carryoverWholeLessons || 0;
    const carryoverBankMinutes = previousRecord.carryoverBankMinutes || 0;
    const openingFinancialBalance = previousRecord.closingFinancialBalance || 0;
    const startingLessonNumber = 1 + carryoverLessons;
    const startReason: SchoolYearStartReason =
      carryoverLessons > 0 || carryoverBankMinutes > 0 ? 'carryover_credit' : 'regular';
    const annualAmountFull = roundMoney(student.annualAmount ?? previousRecord.annualAmountFull ?? 0);
    const expectedLessons = FULL_YEAR_LESSONS;
    const baseTarget = annualAmountFull;
    const currentRecord: StudentSchoolYearRecord = {
      id: `${student.id}:${currentSchoolYear}`,
      studentId: student.id,
      schoolYear: currentSchoolYear,
      status: 'open',
      startReason,
      startingLessonNumber,
      expectedLessons,
      annualAmountFull,
      baseTarget,
      openingFinancialBalance: roundMoney(openingFinancialBalance),
      openingCarryoverLessons: carryoverLessons,
      openingCarryoverBankMinutes: carryoverBankMinutes,
      source: 'rollover',
      createdAt: closedAt,
      updatedAt: closedAt,
    };
    records.push(currentRecord);

    // Student lifecycle dates belong to the student profile and must not be
    // rewritten by an annual accounting rollover. Only school-year display and
    // financial compatibility fields are refreshed here.
    const netTarget = roundMoney(Math.max(0, baseTarget - openingFinancialBalance));
    students[index] = {
      ...student,
      startingLessonNumber,
      calculatedAmount: Math.abs(netTarget - annualAmountFull) > 0.009 ? netTarget : undefined,
      monthlyAmount: student.paymentMonths > 0 ? roundMoney(netTarget / student.paymentMonths) : netTarget,
      lastModified: closedAt,
    };

    changed = true;
    processed += 1;
  }

  if (!changed) {
    return {
      changed: false,
      closedYear: previousSchoolYear,
      openedYear: currentSchoolYear,
      studentsProcessed: processed,
    };
  }

  // One batched mutation: no deletions, no tombstones, safe to retry.
  store.students = students;
  store.schoolYearRecords = records;
  if (!isDevMode()) await hybridSync.onDataChange();

  return {
    changed: true,
    closedYear: previousSchoolYear,
    openedYear: currentSchoolYear,
    studentsProcessed: processed,
  };
};
