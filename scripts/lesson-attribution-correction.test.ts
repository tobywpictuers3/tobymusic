import { describe, expect, test } from 'bun:test';
import {
  AYALA_ALPHA_CORRECTION as spec,
  applyLessonAttributionToLessons,
  planLessonAttribution,
} from '../src/lib/lessonAttributionCorrection.core';

const lesson = { id: 'mta9jhzskkn6onmv7lj', studentId: 'mta9j48yncgyygkpbgm', date: '2026-08-26', startTime: '16:00', status: 'completed' };
const base = () => ({
  lessons: [{ ...lesson }],
  payments: [{ id: 'p1', studentId: 'mtiqnlocbewy2afa217', month: '2026-09', amount: 1600, status: 'paid' }],
  studentIds: ['mtiqnlocbewy2afa217', 'mta9j48yncgyygkpbgm'],
  yearRecords: [],
});

describe('Ayala Alpha lesson attribution', () => {
  test('moves lesson to active card, counts in 2027, keeps original date', () => {
    const data = base();
    const plan = planLessonAttribution(spec, data);
    expect(plan.canApply).toBe(true);
    const [out] = applyLessonAttributionToLessons(plan, data.lessons, '2026-10-27T00:00:00Z');
    expect(out.studentId).toBe('mtiqnlocbewy2afa217');
    expect(out.countedInSchoolYear).toBe(2027);
    expect(out.date).toBe('2026-08-26');
    expect((out as any).correctionAudit.originalStudentId).toBe('mta9j48yncgyygkpbgm');
  });

  test('idempotent: second run changes nothing and lesson count stays 1', () => {
    const data = base();
    const once = applyLessonAttributionToLessons(planLessonAttribution(spec, data), data.lessons, 't');
    const plan2 = planLessonAttribution(spec, { ...data, lessons: once });
    expect(plan2.pendingCount).toBe(0);
    expect(applyLessonAttributionToLessons(plan2, once, 't2')).toEqual(once);
    expect(once.length).toBe(1);
  });

  test('blocks when the active card already has the same completed lesson', () => {
    const data = base();
    data.lessons.push({ ...lesson, id: 'twin', studentId: 'mtiqnlocbewy2afa217' });
    expect(planLessonAttribution(spec, data).canApply).toBe(false);
  });

  test('blocks when source lesson is missing', () => {
    expect(planLessonAttribution(spec, { ...base(), lessons: [] }).canApply).toBe(false);
  });

  test('blocks when target year 2027 is closed', () => {
    const data = { ...base(), yearRecords: [{ studentId: 'mtiqnlocbewy2afa217', schoolYear: 2027, status: 'closed' }] };
    expect(planLessonAttribution(spec, data).canApply).toBe(false);
  });

  test('1600 September payment is reported, never changed', () => {
    const data = base();
    const plan = planLessonAttribution(spec, data);
    expect(plan.exceptions.some(e => e.startsWith('TARGET_PAYMENT_SOURCE_UNVERIFIED:2026-09:1600'))).toBe(true);
    applyLessonAttributionToLessons(plan, data.lessons, 't');
    expect(data.payments[0]).toEqual({ id: 'p1', studentId: 'mtiqnlocbewy2afa217', month: '2026-09', amount: 1600, status: 'paid' });
  });
});
