import type { Student } from './types';

const hebrewNameCollator = new Intl.Collator('he-IL', {
  sensitivity: 'base',
  numeric: true,
  usage: 'sort',
});

const normalizeNamePart = (value: unknown): string => String(value ?? '').trim();

const compareNamePart = (a: string, b: string): number => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return hebrewNameCollator.compare(a, b);
};

export const compareStudentsByLastName = (
  a: Pick<Student, 'id' | 'firstName' | 'lastName'>,
  b: Pick<Student, 'id' | 'firstName' | 'lastName'>,
): number => {
  const lastNameOrder = compareNamePart(
    normalizeNamePart(a.lastName),
    normalizeNamePart(b.lastName),
  );
  if (lastNameOrder !== 0) return lastNameOrder;

  const firstNameOrder = compareNamePart(
    normalizeNamePart(a.firstName),
    normalizeNamePart(b.firstName),
  );
  if (firstNameOrder !== 0) return firstNameOrder;

  return hebrewNameCollator.compare(String(a.id ?? ''), String(b.id ?? ''));
};

/**
 * Canonical student-list ordering for the UI.
 * Sorts the existing array in place so legacy callers that rely on the
 * storage array identity keep working, while every consumer of getStudents()
 * receives the same surname-first alphabetical order.
 */
export const sortStudentsByLastNameInPlace = <T extends Pick<Student, 'id' | 'firstName' | 'lastName'>>(
  students: T[],
): T[] => students.sort(compareStudentsByLastName);

const currentSchoolYearStartInJerusalem = (now: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const baseYear = month >= 9 ? year : year - 1;
  return `${baseYear}-09-01`;
};

/**
 * Operational-list visibility for the current school year.
 *
 * - A currently active student is always visible, including a student whose
 *   activity was renewed after September 1.
 * - A currently inactive student remains visible only when the stored dates
 *   prove that she was already active on September 1 and left later.
 * - A student who was already inactive on September 1 stays out of ordinary
 *   student lists. Her record is still preserved and remains visible in the
 *   Students card/index screen.
 *
 * We deliberately require an explicit leftDate to prove that a currently
 * inactive legacy student was active on September 1. Missing historical dates
 * are not guessed.
 */
export const isStudentVisibleInCurrentSchoolYearLists = (
  student: Pick<Student, 'isActive' | 'startDate' | 'leftDate'>,
  now: Date = new Date(),
): boolean => {
  if (student.isActive !== false) return true;

  const schoolYearStart = currentSchoolYearStartInJerusalem(now);
  const joinedBySchoolYearStart = !student.startDate || student.startDate <= schoolYearStart;
  const leftAfterSchoolYearStart = Boolean(student.leftDate && student.leftDate > schoolYearStart);

  return joinedBySchoolYearStart && leftAfterSchoolYearStart;
};

export const filterStudentsForCurrentSchoolYearLists = <T extends Student>(
  students: T[],
  now: Date = new Date(),
): T[] => students
  .filter(student => isStudentVisibleInCurrentSchoolYearLists(student, now))
  .sort(compareStudentsByLastName);

/**
 * The Students index is the only place that intentionally shows everyone.
 * Current active students come first, alphabetically by surname; current
 * inactive students follow, also alphabetically by surname.
 */
export const sortStudentsForStudentCards = <T extends Student>(students: T[]): T[] => [...students].sort((a, b) => {
  const aInactive = a.isActive === false ? 1 : 0;
  const bInactive = b.isActive === false ? 1 : 0;
  if (aInactive !== bInactive) return aInactive - bInactive;
  return compareStudentsByLastName(a, b);
});
