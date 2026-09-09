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
