import { getDevStore, isDevMode, markStorageKeyDirty } from './storage';
import { hybridSync } from './hybridSync';
import { getSchoolYearForDate } from './schoolYear';

export interface TuitionSettings {
  annualRate: number;
  lessonRate: number;
  /** Fixed NIS discount for joining in the preceding school year. */
  priorYearDiscount: number;
  /** Additional NIS per earlier joining school year. */
  additionalYearDiscount: number;
  /** Maximum annual tenure discount in NIS. */
  maxTenureDiscount: number;
  updatedAt: string;
}

export const DEFAULT_TUITION_SETTINGS: TuitionSettings = {
  annualRate: 4800,
  lessonRate: 150,
  priorYearDiscount: 200,
  additionalYearDiscount: 100,
  maxTenureDiscount: 500,
  updatedAt: '',
};

const normalizeMoney = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
};

// Historical cohortDiscounts were percentages. They must not be read as NIS.
const getMutableStore = (): Record<string, any> => {
  if (isDevMode()) return getDevStore();
  if (typeof window === 'undefined') return {};
  return (window as any).__musicSystemStorage || {};
};

export const getTuitionSettings = (): TuitionSettings => {
  const raw = getMutableStore().tuitionSettings;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TUITION_SETTINGS };
  return {
    annualRate: normalizeMoney(raw.annualRate, DEFAULT_TUITION_SETTINGS.annualRate),
    lessonRate: normalizeMoney(raw.lessonRate, DEFAULT_TUITION_SETTINGS.lessonRate),
    priorYearDiscount: normalizeMoney(raw.priorYearDiscount, DEFAULT_TUITION_SETTINGS.priorYearDiscount),
    additionalYearDiscount: normalizeMoney(raw.additionalYearDiscount, DEFAULT_TUITION_SETTINGS.additionalYearDiscount),
    maxTenureDiscount: normalizeMoney(raw.maxTenureDiscount, DEFAULT_TUITION_SETTINGS.maxTenureDiscount),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
};

export const saveTuitionSettings = async (
  next: Pick<TuitionSettings, 'annualRate' | 'lessonRate'> & Partial<Pick<TuitionSettings, 'priorYearDiscount' | 'additionalYearDiscount' | 'maxTenureDiscount'>>,
): Promise<TuitionSettings> => {
  const store = getMutableStore();
  const current = getTuitionSettings();
  const normalized: TuitionSettings = {
    annualRate: normalizeMoney(next.annualRate, DEFAULT_TUITION_SETTINGS.annualRate),
    lessonRate: normalizeMoney(next.lessonRate, DEFAULT_TUITION_SETTINGS.lessonRate),
    priorYearDiscount: normalizeMoney(next.priorYearDiscount ?? current.priorYearDiscount, DEFAULT_TUITION_SETTINGS.priorYearDiscount),
    additionalYearDiscount: normalizeMoney(next.additionalYearDiscount ?? current.additionalYearDiscount, DEFAULT_TUITION_SETTINGS.additionalYearDiscount),
    maxTenureDiscount: normalizeMoney(next.maxTenureDiscount ?? current.maxTenureDiscount, DEFAULT_TUITION_SETTINGS.maxTenureDiscount),
    updatedAt: new Date().toISOString(),
  };
  store.tuitionSettings = normalized;
  markStorageKeyDirty('tuitionSettings');
  if (!isDevMode()) {
    const result = await hybridSync.onDataChange();
    if (!result.success) throw new Error(result.message || 'TUITION_LOCAL_SAVE_FAILED');
  }
  return normalized;
};

/** Fixed NIS discount; annual price is never negative. */
export const calculateDiscountedAnnualRate = (baseRate: number, amount: number): number =>
  Math.round((Math.max(0, normalizeMoney(baseRate, 0) - normalizeMoney(amount, 0)) + Number.EPSILON) * 100) / 100;

/** Returns the school-year key for a student's original start date. */
export const getCohortSchoolYear = (startDate: string | undefined): number | undefined => {
  const match = String(startDate || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 9 ? year + 1 : year;
};

/** Seniority advances at September school-year boundaries, starting one year after joining. */
export const getCohortDiscountAmount = (
  settings: TuitionSettings,
  startDate: string | undefined,
  currentSchoolYear = getSchoolYearForDate(),
): number => {
  const joined = getCohortSchoolYear(startDate);
  if (!joined || joined >= currentSchoolYear) return 0;
  const amount = settings.priorYearDiscount + (currentSchoolYear - joined - 1) * settings.additionalYearDiscount;
  return Math.min(
    normalizeMoney(settings.annualRate, 0),
    normalizeMoney(settings.maxTenureDiscount, 0),
    normalizeMoney(amount, 0),
  );
};

export const calculateCohortAnnualRate = (
  settings: TuitionSettings,
  startDate: string | undefined,
  currentSchoolYear = getSchoolYearForDate(),
): number => calculateDiscountedAnnualRate(
  settings.annualRate,
  getCohortDiscountAmount(settings, startDate, currentSchoolYear),
);
