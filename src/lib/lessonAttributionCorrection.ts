import { getDevStore, getLessons, getPayments, getStudents, isDevMode, markStorageKeyDirty } from './storage';
import { hybridSync } from './hybridSync';
import { getStudentSchoolYearRecords } from './schoolYear';
import {
  applyLessonAttributionToLessons,
  planLessonAttribution,
  type LessonAttributionSpec,
} from './lessonAttributionCorrection.core';

export * from './lessonAttributionCorrection.core';

export const previewLessonAttribution = (spec: LessonAttributionSpec) =>
  planLessonAttribution(spec, {
    lessons: getLessons() as any,
    payments: getPayments() as any,
    studentIds: getStudents().map(s => s.id),
    yearRecords: getStudentSchoolYearRecords() as any,
  });

/** Explicit admin action only. Re-plans right before writing to stay idempotent. */
export const applyLessonAttributionDurably = async (spec: LessonAttributionSpec) => {
  const plan = previewLessonAttribution(spec);
  if (!plan.canApply) throw new Error('CORRECTION_BLOCKED');
  if (plan.pendingCount === 0) return { plan, changed: false };

  const next = applyLessonAttributionToLessons(plan, getLessons(), new Date().toISOString());
  const store: Record<string, any> = isDevMode() ? getDevStore() : (window as any).__musicSystemStorage;
  store.lessons = next;
  markStorageKeyDirty('lessons');
  if (!isDevMode()) {
    const result = await hybridSync.onDataChange();
    if (!result.success) throw new Error(result.message || 'CORRECTION_SAVE_FAILED');
  }
  return { plan, changed: true };
};
