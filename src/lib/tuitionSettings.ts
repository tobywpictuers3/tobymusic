import { getDevStore, isDevMode, markStorageKeyDirty } from './storage';
import { hybridSync } from './hybridSync';

export interface TuitionSettings {
  annualRate: number;
  lessonRate: number;
  /**
   * Discount percent by the school year in which the student first joined.
   * The key follows the platform school-year convention: 2026 = 2025-09-01..2026-08-31.
   */
  cohortDiscounts: Record<string, number>;
  updatedAt: string;
}

export const DEFAULT_TUITION_SETTINGS: TuitionSettings = {
  annualRate: 4800,
  lessonRate: 150,
  cohortDiscounts: {},
  updatedAt: '',
};

const normalizeMoney = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
};

const normalizePercent = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(Math.min(100, Math.max(0, numeric)) * 100) / 100;
};

const normalizeCohortDiscounts = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => /^\d{4}$/.test(key))
      .map(([key, percent]) => [key, normalizePercent(percent)]),
  );
};

const getMutableStore = (): Record<string, any> => {
  if (isDevMode()) return getDevStore();
  if (typeof window === 'undefined') return {};
  return (window as any).__musicSystemStorage || {};
};

export const getTuitionSettings = (): TuitionSettings => {
  const raw = getMutableStore().tuitionSettings;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TUITION_SETTINGS, cohortDiscounts: {} };
  return {
    annualRate: normalizeMoney(raw.annualRate, DEFAULT_TUITION_SETTINGS.annualRate),
    lessonRate: normalizeMoney(raw.lessonRate, DEFAULT_TUITION_SETTINGS.lessonRate),
    cohortDiscounts: normalizeCohortDiscounts(raw.cohortDiscounts),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
};

export const saveTuitionSettings = async (
  next: Pick<TuitionSettings, 'annualRate' | 'lessonRate'> & Partial<Pick<TuitionSettings, 'cohortDiscounts'>>,
): Promise<TuitionSettings> => {
  const store = getMutableStore();
  const current = getTuitionSettings();
  const normalized: TuitionSettings = {
    annualRate: normalizeMoney(next.annualRate, DEFAULT_TUITION_SETTINGS.annualRate),
    lessonRate: normalizeMoney(next.lessonRate, DEFAULT_TUITION_SETTINGS.lessonRate),
    cohortDiscounts: normalizeCohortDiscounts(next.cohortDiscounts ?? current.cohortDiscounts),
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

export const calculateDiscountedAnnualRate = (baseRate: number, discountPercent: number): number => {
  const base = normalizeMoney(baseRate, 0);
  const discount = normalizePercent(discountPercent);
  return Math.round((base * (1 - discount / 100) + Number.EPSILON) * 100) / 100;
};

/** Returns the school-year key for a student's original start date. */
export const getCohortSchoolYear = (startDate: string | undefined): number | undefined => {
  const match = String(startDate || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 9 ? year + 1 : year;
};

export const getCohortDiscountPercent = (
  settings: TuitionSettings,
  startDate: string | undefined,
): number => {
  const schoolYear = getCohortSchoolYear(startDate);
  if (!schoolYear) return 0;
  return normalizePercent(settings.cohortDiscounts[String(schoolYear)] || 0);
};

export const calculateCohortAnnualRate = (
  settings: TuitionSettings,
  startDate: string | undefined,
): number => calculateDiscountedAnnualRate(settings.annualRate, getCohortDiscountPercent(settings, startDate));
