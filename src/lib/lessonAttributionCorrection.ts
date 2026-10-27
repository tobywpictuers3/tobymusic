import { getDevStore, getLessons, getPayments, getStudents, isDevMode, markStorageKeyDirty } from './storage';
import { hybridSync } from './hybridSync';
import { downloadCanonicalDropboxLatest } from './canonicalDropboxRead';
import type { Lesson } from './types';
import { getStudentSchoolYearRecords } from './schoolYear';
import {
  applyLessonAttributionToLessons,
  planLessonAttribution,
  type LessonAttributionSpec,
} from './lessonAttributionCorrection.core';

export * from './lessonAttributionCorrection.core';

/** Exactly one completed lesson recovered from the authorized 2026-08-30 archive.
 *  Current canonical data no longer contains its ID; never restore the entire archive.
 */
const verifiedArchivedLesson: Lesson = {
  id: 'mta9jhzskkn6onmv7lj',
  studentId: 'mta9j48yncgyygkpbgm',
  date: '2026-08-26', startTime: '18:10', endTime: '18:40',
  status: 'completed', isOneOff: true, lastModified: '2026-08-26T15:43:11.300Z',
};

const withVerifiedArchiveLesson = (spec: LessonAttributionSpec): Lesson[] => {
  const lessons = getLessons();
  if (spec.correctionId !== 'ayala-alpha-2027-carryover-v1' ||
      lessons.some(l => l.id === verifiedArchivedLesson.id)) return lessons;
  return [...lessons, { ...verifiedArchivedLesson }];
};

export const previewLessonAttribution = (spec: LessonAttributionSpec) =>
  planLessonAttribution(spec, {
    lessons: withVerifiedArchiveLesson(spec) as any,
    payments: getPayments() as any,
    studentIds: getStudents().map(s => s.id),
    yearRecords: getStudentSchoolYearRecords() as any,
  });

/** Explicit admin action only. Re-plans right before writing to stay idempotent. */
export const applyLessonAttributionDurably = async (spec: LessonAttributionSpec) => {
  const plan = previewLessonAttribution(spec);
  if (!plan.canApply) throw new Error('CORRECTION_BLOCKED');
  if (plan.pendingCount === 0) return { plan, changed: false };

  const next = applyLessonAttributionToLessons(plan, withVerifiedArchiveLesson(spec), new Date().toISOString());
  const store: Record<string, any> = isDevMode() ? getDevStore() : (window as any).__musicSystemStorage;
  store.lessons = next;
  markStorageKeyDirty('lessons');
  if (!isDevMode()) {
    const result = await hybridSync.onDataChange();
    if (!result.success) throw new Error(result.message || 'CORRECTION_SAVE_FAILED');
    if (!(await hybridSync.manualSync())) throw new Error('CORRECTION_CANONICAL_SYNC_FAILED');
    const checked = await downloadCanonicalDropboxLatest();
    const remote = checked.data?.musicSystem_lessons as Lesson[] | undefined;
    const allVerified = checked.success && spec.lessonIds.every(id => {
      const intended = next.find(l => l.id === id);
      const copies = remote?.filter(l => l.id === id) || [];
      return intended && copies.length === 1 &&
        copies[0].studentId === spec.toStudentId &&
        copies[0].countedInSchoolYear === spec.targetSchoolYear &&
        copies[0].mergedDuplicateOf === intended.mergedDuplicateOf &&
        copies[0].correctionAudit?.correctionId === spec.correctionId;
    });
    if (!allVerified) throw new Error('CORRECTION_READBACK_UNVERIFIED');
  }
  return { plan, changed: true };
};
