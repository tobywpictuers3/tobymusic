/**
 * Pure planner for an approved, audited lesson re-attribution correction.
 * Moves completed lessons from an old student card to the active card and
 * counts them in a target school-year contract, preserving the original date.
 * Never touches payments: payments are only reported as exceptions.
 */

export interface CorrectionLesson {
  id: string;
  studentId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status: string;
  countedInSchoolYear?: number;
  correctionAudit?: { correctionId: string; originalStudentId: string; targetSchoolYear: number };
}

export interface CorrectionPayment {
  id: string;
  studentId: string;
  month: string;
  amount: number;
  status: string;
  paidDate?: string;
}

export interface CorrectionYearRecord {
  studentId: string;
  schoolYear: number;
  status: string;
}

export interface LessonAttributionSpec {
  correctionId: string;
  fromStudentId: string;
  toStudentId: string;
  targetSchoolYear: number;
  /** Explicitly approved lesson ids. */
  lessonIds: string[];
  reason: string;
}

export type CorrectionAction = 'reattribute' | 'already_applied';

export interface CorrectionPlanItem {
  lessonId: string;
  date: string;
  action: CorrectionAction;
}

export interface CorrectionPlan {
  spec: LessonAttributionSpec;
  items: CorrectionPlanItem[];
  /** Other completed lessons on the old card that were NOT approved — report only. */
  candidateLessonIds: string[];
  exceptions: string[];
  /** True when nothing blocks applying. */
  canApply: boolean;
  pendingCount: number;
}

export const schoolYearOfDate = (date: string): number => {
  const [y, m] = date.slice(0, 10).split('-').map(Number);
  return m >= 9 ? y + 1 : y;
};

export const AYALA_ALPHA_CORRECTION: LessonAttributionSpec = {
  correctionId: 'ayala-alpha-2027-carryover-v1',
  fromStudentId: 'mta9j48yncgyygkpbgm',
  toStudentId: 'mtiqnlocbewy2afa217',
  targetSchoolYear: 2027,
  lessonIds: ['mta9jhzskkn6onmv7lj'],
  reason: 'אושר ע"י בעלת המערכת: שיעורים שבוצעו בשנה שעברה נספרים בחוזה תשפ"ז',
};

export const planLessonAttribution = (
  spec: LessonAttributionSpec,
  data: {
    lessons: CorrectionLesson[];
    payments: CorrectionPayment[];
    studentIds: string[];
    yearRecords: CorrectionYearRecord[];
  },
): CorrectionPlan => {
  const exceptions: string[] = [];
  const items: CorrectionPlanItem[] = [];

  if (!data.studentIds.includes(spec.toStudentId)) exceptions.push(`TARGET_STUDENT_MISSING:${spec.toStudentId}`);
  if (spec.fromStudentId === spec.toStudentId) exceptions.push('SAME_STUDENT');

  const targetRecord = data.yearRecords.find(r => r.studentId === spec.toStudentId && r.schoolYear === spec.targetSchoolYear);
  if (targetRecord?.status === 'closed') exceptions.push(`TARGET_YEAR_CLOSED:${spec.targetSchoolYear}`);

  for (const lessonId of spec.lessonIds) {
    const matches = data.lessons.filter(l => l.id === lessonId);
    if (matches.length === 0) {
      exceptions.push(`LESSON_SOURCE_MISSING:${lessonId}`);
      continue;
    }
    if (matches.length > 1) {
      exceptions.push(`LESSON_DUPLICATE_ID:${lessonId}`);
      continue;
    }
    const lesson = matches[0];
    if (lesson.correctionAudit?.correctionId === spec.correctionId
      && lesson.studentId === spec.toStudentId
      && lesson.countedInSchoolYear === spec.targetSchoolYear) {
      items.push({ lessonId, date: lesson.date, action: 'already_applied' });
      continue;
    }
    if (lesson.correctionAudit) {
      exceptions.push(`LESSON_HAS_OTHER_CORRECTION:${lessonId}`);
      continue;
    }
    if (lesson.studentId !== spec.fromStudentId) {
      exceptions.push(`LESSON_OWNER_MISMATCH:${lessonId}`);
      continue;
    }
    if (lesson.status !== 'completed') {
      exceptions.push(`LESSON_NOT_COMPLETED:${lessonId}`);
      continue;
    }
    // Guard against double counting: the active card must not already hold a
    // completed lesson in the same slot (e.g. a manual re-entry).
    const twin = data.lessons.find(l =>
      l.id !== lesson.id &&
      l.studentId === spec.toStudentId &&
      l.status === 'completed' &&
      l.date === lesson.date &&
      (l.startTime || '') === (lesson.startTime || ''),
    );
    if (twin) {
      exceptions.push(`DUPLICATE_LESSON_ON_TARGET:${lessonId}~${twin.id}`);
      continue;
    }
    items.push({ lessonId, date: lesson.date, action: 'reattribute' });
  }

  const candidateLessonIds = data.lessons
    .filter(l => l.studentId === spec.fromStudentId && l.status === 'completed' && !spec.lessonIds.includes(l.id))
    .map(l => l.id);
  if (candidateLessonIds.length) exceptions.push(`UNAPPROVED_OLD_CARD_LESSONS:${candidateLessonIds.length} (report only)`);

  // Payments are never moved. Report what exists so owner can verify the source.
  const oldPayments = data.payments.filter(p => p.studentId === spec.fromStudentId && p.status === 'paid');
  if (oldPayments.length) exceptions.push(`OLD_CARD_PAYMENTS_UNMOVED:${oldPayments.length} (report only)`);
  const targetPayments = data.payments.filter(p =>
    p.studentId === spec.toStudentId && p.status === 'paid' && schoolYearOfDate(`${p.month}-01`) === spec.targetSchoolYear,
  );
  for (const p of targetPayments) {
    exceptions.push(`TARGET_PAYMENT_SOURCE_UNVERIFIED:${p.month}:${p.amount} (report only, not changed)`);
  }

  const blocking = exceptions.filter(e => !e.includes('(report only'));
  const pendingCount = items.filter(i => i.action === 'reattribute').length;
  return { spec, items, candidateLessonIds, exceptions, canApply: blocking.length === 0, pendingCount };
};

/** Pure apply: returns new lesson array. Idempotent. Throws if plan blocked. */
export const applyLessonAttributionToLessons = <L extends CorrectionLesson>(
  plan: CorrectionPlan,
  lessons: L[],
  appliedAt: string,
): L[] => {
  if (!plan.canApply) throw new Error('CORRECTION_BLOCKED');
  const ids = new Set(plan.items.filter(i => i.action === 'reattribute').map(i => i.lessonId));
  return lessons.map(lesson => {
    if (!ids.has(lesson.id)) return lesson;
    return {
      ...lesson,
      studentId: plan.spec.toStudentId,
      countedInSchoolYear: plan.spec.targetSchoolYear,
      correctionAudit: {
        correctionId: plan.spec.correctionId,
        originalStudentId: lesson.studentId,
        originalSchoolYear: schoolYearOfDate(lesson.date),
        targetSchoolYear: plan.spec.targetSchoolYear,
        appliedAt,
        reason: plan.spec.reason,
      },
      lastModified: appliedAt,
    };
  });
};
