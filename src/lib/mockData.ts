import type { Student, Lesson, Payment, SwapRequest, FileEntry, PracticeSession, ScheduleTemplate, PerLessonPayment } from './types';

/**
 * Fixed fictional fixtures for the isolated /dev-admin environment.
 * No genuine contact details, external URLs or production Dropbox records.
 * These are recreated on page reload; edits made during a rehearsal are temporary.
 */
const DEMO_NAMES: Array<[string, string]> = [
  ['שרה', 'כהן'],
  ['רחל', 'לוי'],
  ['מירי', 'אברהם'],
  ['אסתר', 'פרידמן'],
  ['חני', 'גולדברג'],
  ['לאה', 'רוזנברג'],
  ['תמר', 'ויסמן'],
  ['דבורה', 'קליין'],
  ['נועה', 'שטרן'],
  ['יהודית', 'ברק'],
];

export const mockStudents: Student[] = DEMO_NAMES.map(([firstName, lastName], index) => {
  const perLesson = index === 2 || index === 6;
  const annualAmount = index % 3 === 0 ? 5400 : 4800;
  return {
    id: `demo-student-${String(index + 1).padStart(2, '0')}`,
    firstName,
    lastName,
    phone: '000-000-0000',
    email: `demo-student-${String(index + 1).padStart(2, '0')}@example.invalid`,
    personalCode: String(6100 + index),
    swapCode: String(8100 + index),
    startDate: index === 4 ? '2026-10-01' : '2026-09-01',
    isActive: true,
    startingLessonNumber: 1,
    annualAmount,
    paymentMonths: 12,
    monthlyAmount: perLesson ? 0 : annualAmount / 12,
    paymentType: perLesson ? 'per_lesson' : 'annual',
    lessonPrice: perLesson ? 150 : undefined,
    paymentMethod: index % 3 === 0 ? 'cash' : 'bank',
    credits: (index + 1) * 8,
    notes: 'תלמידת דמה — ללא פרטי קשר אמיתיים. סביבת התנסות בלבד.',
  };
});

const HISTORY_DATES = ['2026-09-10', '2026-10-08', '2026-11-05'];
const formatTime = (totalMinutes: number): string =>
  `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;

export const mockLessons: Lesson[] = [
  ...mockStudents.flatMap((student, index) =>
    HISTORY_DATES.map((date, weekIndex) => {
      const minutes = 14 * 60 + index * 30;
      return {
        id: `demo-lesson-${index + 1}-${weekIndex + 1}`,
        studentId: student.id,
        date,
        startTime: formatTime(minutes),
        endTime: formatTime(minutes + 30),
        status: 'completed' as const,
        grade: (index + weekIndex) % 4 + 2,
        notes: weekIndex === 2 ? 'עבודה על קצב וקריאת תווים' : 'תרגול וחזרה על החומר',
      };
    }),
  ),
  ...mockStudents.map((student, index) => {
    const minutes = 14 * 60 + index * 30;
    return {
      id: `demo-upcoming-${index + 1}`,
      studentId: student.id,
      date: '2026-11-19',
      startTime: formatTime(minutes),
      endTime: formatTime(minutes + 30),
      status: 'scheduled' as const,
    };
  }),
];

export const mockPayments: Payment[] = mockStudents
  .filter(student => student.paymentType !== 'per_lesson')
  .flatMap((student, index) =>
    ['2026-09', '2026-10'].map((month, monthIndex) => ({
      id: `demo-payment-${student.id}-${month}`,
      studentId: student.id,
      month,
      amount: student.monthlyAmount,
      status: index === 3 && monthIndex === 1 ? 'pending' as const : 'paid' as const,
      paymentMethod: student.paymentMethod === 'cash' ? 'cash' as const : 'bank' as const,
      paidDate: index === 3 && monthIndex === 1 ? undefined : `${month}-05`,
    })),
  );

export const mockPerLessonPayments: PerLessonPayment[] = mockStudents
  .filter(student => student.paymentType === 'per_lesson')
  .map(student => ({
    id: `demo-per-lesson-payment-${student.id}`,
    studentId: student.id,
    amount: 300,
    lessonsCount: 2,
    paymentDate: '2026-10-10',
    month: '2026-10',
    notes: 'תשלום דמה עבור שני שיעורים',
  }));

export const mockSwapRequests: SwapRequest[] = [
  {
    id: 'demo-swap-01',
    requesterId: mockStudents[0].id,
    targetId: mockStudents[1].id,
    date: '2026-11-19',
    time: '14:00',
    targetDate: '2026-11-19',
    targetTime: '14:30',
    reason: 'בקשת החלפה לדוגמה',
    status: 'pending',
    createdAt: '2026-11-10T10:00:00.000Z',
  },
];

// Never link a demo record to a real attachment or mailbox.
export const mockFiles: FileEntry[] = [];

export const mockPracticeSessions: PracticeSession[] = mockStudents.flatMap((student, index) =>
  ['2026-11-10', '2026-11-12', '2026-11-13'].map((date, day) => ({
    id: `demo-practice-${index + 1}-${day + 1}`,
    studentId: student.id,
    date,
    durationMinutes: 10 + index * 2 + day * 5,
    createdAt: `${date}T17:00:00.000Z`,
  })),
);

export const mockScheduleTemplates: ScheduleTemplate[] = [
  {
    id: 'demo-weekly-schedule-2027',
    name: 'מערכת שיעורים — דמו תשפ״ז',
    effectiveDate: '2026-09-01',
    isActive: true,
    createdAt: '2026-08-25T12:00:00.000Z',
    activatedAt: '2026-09-01T00:00:00.000Z',
    schedule: {
      '0': {
        '14:00': { studentId: mockStudents[0].id, studentName: 'שרה כהן', duration: 30 },
        '14:30': { studentId: mockStudents[1].id, studentName: 'רחל לוי', duration: 30 },
        '15:00': { studentId: mockStudents[2].id, studentName: 'מירי אברהם', duration: 30 },
        '15:30': { studentId: mockStudents[3].id, studentName: 'אסתר פרידמן', duration: 30 },
      },
      '1': {
        '14:00': { studentId: mockStudents[4].id, studentName: 'חני גולדברג', duration: 30 },
        '14:30': { studentId: mockStudents[5].id, studentName: 'לאה רוזנברג', duration: 30 },
        '15:00': { studentId: mockStudents[6].id, studentName: 'תמר ויסמן', duration: 30 },
      },
      '2': {
        '14:00': { studentId: mockStudents[7].id, studentName: 'דבורה קליין', duration: 30 },
        '14:30': { studentId: mockStudents[8].id, studentName: 'נועה שטרן', duration: 30 },
        '15:00': { studentId: mockStudents[9].id, studentName: 'יהודית ברק', duration: 30 },
      },
    },
  },
];
