import { getLessons, getStudents, updateLesson, addLesson, updateStudentBankTime } from './storage';
import { Lesson } from './types';
import {
  getSchoolYearBounds,
  getSchoolYearForDate,
  getStudentSchoolYearRecord,
  isPriorYearDebtMakeupLesson,
} from './schoolYear';

export interface LessonNumberingResult {
  lessonNumber: number;
  isBankTimeLesson: boolean;
  isSkippedLesson: boolean;
  bankTimeChange?: number;
}

const isSkippedForNumbering = (lesson: Lesson): boolean =>
  Boolean(lesson.notes?.includes('דילוג מיספור')) || isPriorYearDebtMakeupLesson(lesson);

/**
 * Single source of truth for lesson numbering.
 * Numbering restarts per school year (Sep 1-Aug 31), but can start above #1
 * when a closed year carried extra lessons forward. Billing is deliberately
 * separate from numbering; see schoolYear.ts.
 */
export const calculateSchoolYearLessonNumber = (
  studentId: string,
  lessonDate: string,
  lessonId?: string,
): LessonNumberingResult => {
  const student = getStudents().find(item => item.id === studentId);
  if (!student) return { lessonNumber: 0, isBankTimeLesson: false, isSkippedLesson: false };

  const schoolYear = getSchoolYearForDate(lessonDate);
  const bounds = getSchoolYearBounds(schoolYear);
  const yearRecord = getStudentSchoolYearRecord(studentId, schoolYear);
  const studentStartSchoolYear = getSchoolYearForDate(student.startDate);
  const startingLessonNumber = Math.max(
    1,
    yearRecord?.startingLessonNumber ??
      (studentStartSchoolYear === schoolYear ? (student.startingLessonNumber || 1) : 1),
  );

  const targetLesson = lessonId ? getLessons().find(lesson => lesson.id === lessonId) : undefined;
  if (targetLesson?.lockedNumber) {
    return {
      lessonNumber: targetLesson.lockedNumber,
      isBankTimeLesson: Boolean(targetLesson.notes?.includes('בנק זמן')),
      isSkippedLesson: isSkippedForNumbering(targetLesson),
    };
  }

  if (targetLesson && isSkippedForNumbering(targetLesson)) {
    return {
      lessonNumber: 0,
      isBankTimeLesson: Boolean(targetLesson.notes?.includes('בנק זמן')),
      isSkippedLesson: true,
    };
  }

  const completedLessons = getLessons()
    .filter(lesson =>
      lesson.studentId === studentId &&
      lesson.status === 'completed' &&
      lesson.date >= bounds.start &&
      lesson.date <= bounds.end &&
      lesson.date <= lessonDate &&
      !isSkippedForNumbering(lesson),
    )
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.id.localeCompare(b.id),
    );

  if (lessonId) {
    const index = completedLessons.findIndex(lesson => lesson.id === lessonId);
    if (index < 0) {
      return {
        lessonNumber: 0,
        isBankTimeLesson: Boolean(targetLesson?.notes?.includes('בנק זמן')),
        isSkippedLesson: false,
      };
    }
    return {
      lessonNumber: startingLessonNumber + index,
      isBankTimeLesson: Boolean(targetLesson?.notes?.includes('בנק זמן')),
      isSkippedLesson: false,
    };
  }

  return {
    lessonNumber: startingLessonNumber + completedLessons.length,
    isBankTimeLesson: false,
    isSkippedLesson: false,
  };
};

// Backward-compatible public name used by existing student views.
export const calculateEnhancedLessonNumber = calculateSchoolYearLessonNumber;

// Handle bank time to lesson conversion (legacy compatibility).
export const convertBankTimeToLesson = (studentId: string): boolean => {
  const student = getStudents().find(s => s.id === studentId);
  if (!student) return false;

  const lessons = getLessons()
    .filter(l => l.studentId === studentId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const lastBankTimeAddition = lessons
    .reverse()
    .find(l => l.notes?.includes('עדכון בנק זמן: +'));

  if (!lastBankTimeAddition) return false;

  const duplicateLesson: Omit<Lesson, 'id'> = {
    studentId,
    date: lastBankTimeAddition.date,
    startTime: lastBankTimeAddition.startTime,
    endTime: lastBankTimeAddition.endTime,
    notes: `${lastBankTimeAddition.notes || ''} (תוספת בנק זמן - ${new Date().toLocaleDateString('he-IL')})`,
    isOneOff: true,
    status: 'completed'
  };

  addLesson(duplicateLesson);
  updateStudentBankTime(studentId, -30);
  return true;
};

// Handle lesson skipping for negative bank time (legacy compatibility).
export const handleNegativeBankTime = (studentId: string, lessonId: string): boolean => {
  const student = getStudents().find(s => s.id === studentId);
  if (!student) return false;

  const targetLesson = getLessons().find(l => l.studentId === studentId && l.id === lessonId);
  if (!targetLesson) return false;

  updateLesson(lessonId, {
    notes: `${targetLesson.notes || ''} (דילוג מיספור - החסרה בבנק זמן - ${new Date().toLocaleDateString('he-IL')})`,
    status: 'cancelled'
  });

  return true;
};

export const autoManageBankTime = (_studentId: string): void => {
  // Kept for API compatibility. Year-end bank conversion is calculated in schoolYear.ts.
};
