/**
 * Note games storage — follows the same pattern as lessonSwap/swapStore.ts:
 * reads/writes the shared in-memory store (window.__musicSystemStorage) or the
 * isolated devData in /dev-admin, and notifies hybridSync on change.
 *
 * Safety rules (see TOBY_PROJECT_KNOWLEDGE.md):
 * - Buckets are created lazily on first write only, so a device that has not yet
 *   loaded remote data never uploads an empty bucket over real data.
 * - The buckets are listed in hybridSync conflictKeys → merged by id, not overwritten.
 * - Deletions record tombstones so they survive merges from other devices.
 * - Results are append-only: there is no update path for a result.
 * - Old backups without these buckets load safely (getters return []).
 */
import { getDevStore, isDevMode, recordTombstones } from '@/lib/storage';
import { hybridSync } from '@/lib/hybridSync';
import type { NoteGameAssignment, NoteGameLevel, NoteGameResult } from './types';

const LEVELS = 'noteGameLevels';
const ASSIGNMENTS = 'noteGameAssignments';
const RESULTS = 'noteGameResults';

type BucketKey = typeof LEVELS | typeof ASSIGNMENTS | typeof RESULTS;

const store = (): Record<string, any> => {
  if (isDevMode()) return getDevStore() as Record<string, any>;
  const win = window as any;
  if (!win.__musicSystemStorage) win.__musicSystemStorage = {};
  return win.__musicSystemStorage;
};

const read = <T,>(key: BucketKey): T[] => {
  const value = store()[key];
  return Array.isArray(value) ? (value as T[]) : [];
};

const write = <T,>(key: BucketKey, records: T[]): void => {
  // Assigning a new array (not mutating) marks the bucket dirty through the storage proxy.
  store()[key] = records;
  if (!isDevMode()) hybridSync.onDataChange();
};

const newId = (): string => Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
const nowIso = (): string => new Date().toISOString();

// ---------------- Levels ----------------

export const getNoteGameLevels = (): NoteGameLevel[] => read<NoteGameLevel>(LEVELS);

export const getNoteGameLevel = (id: string): NoteGameLevel | undefined =>
  getNoteGameLevels().find((l) => l.id === id);

export const addNoteGameLevel = (
  level: Omit<NoteGameLevel, 'id' | 'createdAt' | 'lastModified'>,
): NoteGameLevel => {
  const now = nowIso();
  const created: NoteGameLevel = { ...level, id: newId(), createdAt: now, lastModified: now };
  write(LEVELS, [...getNoteGameLevels(), created]);
  return created;
};

export const updateNoteGameLevel = (
  id: string,
  patch: Partial<Omit<NoteGameLevel, 'id' | 'createdAt'>>,
): NoteGameLevel | undefined => {
  const levels = getNoteGameLevels();
  const idx = levels.findIndex((l) => l.id === id);
  if (idx < 0) return undefined;
  const updated: NoteGameLevel = { ...levels[idx], ...patch, id, lastModified: nowIso() };
  const next = levels.slice();
  next[idx] = updated;
  write(LEVELS, next);
  return updated;
};

/** A level that is assigned to any student cannot be deleted — deactivate the assignments first. */
export const isNoteGameLevelInUse = (id: string): boolean =>
  getNoteGameAssignments().some((a) => a.levelId === id && a.active);

export const deleteNoteGameLevel = (id: string): boolean => {
  if (isNoteGameLevelInUse(id)) return false;
  const levels = getNoteGameLevels();
  const next = levels.filter((l) => l.id !== id);
  if (next.length === levels.length) return false;
  recordTombstones(LEVELS, [id]);
  write(LEVELS, next);
  return true;
};

// ---------------- Assignments ----------------

export const getNoteGameAssignments = (): NoteGameAssignment[] => read<NoteGameAssignment>(ASSIGNMENTS);

export const getStudentNoteGameAssignments = (studentId: string, activeOnly = true): NoteGameAssignment[] =>
  getNoteGameAssignments().filter((a) => a.studentId === studentId && (!activeOnly || a.active));

export const assignNoteGameLevel = (studentId: string, levelId: string, tempoOverride?: number): NoteGameAssignment => {
  const all = getNoteGameAssignments();
  const existing = all.find((a) => a.studentId === studentId && a.levelId === levelId);
  const now = nowIso();
  if (existing) {
    const updated: NoteGameAssignment = { ...existing, active: true, tempoOverride, assignedAt: now, lastModified: now };
    write(ASSIGNMENTS, all.map((a) => (a.id === existing.id ? updated : a)));
    return updated;
  }
  const created: NoteGameAssignment = {
    id: newId(),
    studentId,
    levelId,
    active: true,
    tempoOverride,
    assignedAt: now,
    createdAt: now,
    lastModified: now,
  };
  write(ASSIGNMENTS, [...all, created]);
  return created;
};

/** Deactivate (kept for history; results keep pointing to it). */
export const setNoteGameAssignmentActive = (id: string, active: boolean): NoteGameAssignment | undefined => {
  const all = getNoteGameAssignments();
  const found = all.find((a) => a.id === id);
  if (!found) return undefined;
  const updated: NoteGameAssignment = { ...found, active, lastModified: nowIso() };
  write(ASSIGNMENTS, all.map((a) => (a.id === id ? updated : a)));
  return updated;
};

// ---------------- Results (append-only) ----------------

export const getNoteGameResults = (): NoteGameResult[] => read<NoteGameResult>(RESULTS);

export const getStudentNoteGameResults = (studentId: string): NoteGameResult[] =>
  getNoteGameResults()
    .filter((r) => r.studentId === studentId)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));

export const recordNoteGameResult = (
  result: Omit<NoteGameResult, 'id' | 'createdAt' | 'lastModified' | 'completedAt'>,
): NoteGameResult => {
  const now = nowIso();
  const created: NoteGameResult = { ...result, id: newId(), completedAt: now, createdAt: now, lastModified: now };
  write(RESULTS, [...getNoteGameResults(), created]);
  return created;
};

// ---------------- Progress helpers ----------------

/**
 * Suggest a level-up to the teacher (never applied automatically):
 * the last 3 rounds on this assignment passed, the last one at or above the target tempo.
 */
export const shouldSuggestLevelUp = (assignment: NoteGameAssignment, level: NoteGameLevel): boolean => {
  const recent = getNoteGameResults()
    .filter((r) => r.assignmentId === assignment.id)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
    .slice(0, 3);
  if (recent.length < 3) return false;
  return recent.every((r) => r.passed) && recent[0].tempo >= level.tempoTarget;
};

/** Next tempo for the student on this assignment, based on their last round. */
export const nextTempoFor = (assignment: NoteGameAssignment, level: NoteGameLevel): number => {
  const start = assignment.tempoOverride ?? level.tempoStart;
  const last = getNoteGameResults()
    .filter((r) => r.assignmentId === assignment.id)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))[0];
  if (!last) return start;
  if (!last.passed || !level.tempoStep) return Math.max(start, Math.min(last.tempo, level.tempoTarget));
  return Math.min(level.tempoTarget, Math.max(start, last.tempo + level.tempoStep));
};
