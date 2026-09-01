import { getDevStore, isDevMode, markStorageKeyDirty } from './storage';
import { hybridSync } from './hybridSync';

export interface TuitionSettings {
  annualRate: number;
  lessonRate: number;
  updatedAt: string;
}

export const DEFAULT_TUITION_SETTINGS: TuitionSettings = {
  annualRate: 4800,
  lessonRate: 150,
  updatedAt: '',
};

const normalizeMoney = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
};

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
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
};

export const saveTuitionSettings = async (next: Pick<TuitionSettings, 'annualRate' | 'lessonRate'>): Promise<TuitionSettings> => {
  const store = getMutableStore();
  const normalized: TuitionSettings = {
    annualRate: normalizeMoney(next.annualRate, DEFAULT_TUITION_SETTINGS.annualRate),
    lessonRate: normalizeMoney(next.lessonRate, DEFAULT_TUITION_SETTINGS.lessonRate),
    updatedAt: new Date().toISOString(),
  };
  store.tuitionSettings = normalized;
  markStorageKeyDirty('tuitionSettings');
  if (!isDevMode()) await hybridSync.onDataChange();
  return normalized;
};

export const calculateDiscountedAnnualRate = (baseRate: number, discountPercent: number): number => {
  const base = normalizeMoney(baseRate, 0);
  const discount = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  return Math.round((base * (1 - discount / 100) + Number.EPSILON) * 100) / 100;
};
