import { Student, Lesson, Payment, SwapRequest, FileEntry, ScheduleTemplate, IntegrationSettings, Performance, PerformancePayment, OneTimePayment, PerLessonPayment, PerLessonLedger, PerLessonLedgerRow, Holiday, PracticeSession, MonthlyAchievement, LeaderboardEntry, MedalRecord, StoreItem, StorePurchase, YearlyLeaderboardEntry } from './types';
import { hybridSync } from './hybridSync';
import { logger } from './logger';
import { isDevMode, setDevMode } from './devMode';
import { calculateEarnedCopper, formatPriceCompact } from './storeCurrency';

// In-Memory Storage - No localStorage for sensitive data
const inMemoryStorage: Record<string, any> = {};

// Expose storage via window for lessonSwap module access
if (typeof window !== 'undefined') {
  (window as any).__musicSystemStorage = inMemoryStorage;
}

// Dev Mode: Completely isolated in-memory storage (no Worker, no sync)
const devData: Record<string, any> = {
  students: [],
  lessons: [],
  calendar: [],
  payments: [],
  scheduleTemplates: [],
  swapRequests: [], // New field for swap requests
  files: [],
  integrationSettings: {},
  performances: [],
  oneTimePayments: [],
  holidays: [],
  practiceSessions: [],
  monthlyAchievements: [],
  leaderboard: [],
  medals: [],
  messages: [],
  studentStats: {},
  tithePaid: {},
  storeItems: [],
  storePurchases: []
};

export { isDevMode, setDevMode };

export const getDevStore = () => devData;

// Local messages helpers for Gmail sync
export const loadLocalMessages = (): any[] => {
  if (isDevMode()) {
    return devData.messages || [];
  }
  return inMemoryStorage['messages'] || [];
};

export const saveLocalMessages = (messages: any[]): void => {
  if (isDevMode()) {
    devData.messages = messages;
  } else {
    inMemoryStorage['messages'] = messages;
    hybridSync.onDataChange();
  }
};

// Initialize data from Worker
export const initializeStorage = (data: any) => {
  if (!data || typeof data !== 'object') {
    logger.error('❌ Invalid data provided to initializeStorage');
    return;
  }
  
  let initialized = false;
  let keysFound = 0;
  
  Object.keys(data).forEach(key => {
    if (key.startsWith('musicSystem_') || key === 'oneTimePayments') {
      const storageKey = key.replace('musicSystem_', '');
      inMemoryStorage[storageKey] = data[key];
      initialized = true;
      keysFound++;
    }
  });
  
  // Ensure swapRequests exists as empty array if not provided
  if (!inMemoryStorage['swapRequests']) {
    inMemoryStorage['swapRequests'] = [];
  }
  
  // Initialize tithePaid if present
  if (data['musicSystem_tithePaid']) {
    inMemoryStorage['tithePaid'] = data['musicSystem_tithePaid'];
  }
  
  // Initialize studentStats if present
  if (data['musicSystem_studentStats']) {
    inMemoryStorage['studentStats'] = data['musicSystem_studentStats'];
  }
  
  if (initialized) {
    logger.info(`✅ Memory storage initialized with ${keysFound} data keys`);
  } else {
    logger.warn('⚠️ No valid data keys found during initialization');
  }
  
  // Keep only session token in sessionStorage (not localStorage)
  const currentUser = localStorage.getItem('musicSystem_currentUser');
  if (currentUser) {
    sessionStorage.setItem('musicSystem_currentUser', currentUser);
  }
};

// Export all data for Worker sync
export const exportAllData = (allowEmpty: boolean = false): Record<string, any> => {
  const data: Record<string, any> = {};
  
  Object.keys(inMemoryStorage).forEach(key => {
    // Handle special keys that need musicSystem_ prefix
    if (key === 'oneTimePayments') {
      data[key] = inMemoryStorage[key];
    } else if (key === 'tithePaid' || key === 'studentStats') {
      // These need musicSystem_ prefix for proper sync
      data[`musicSystem_${key}`] = inMemoryStorage[key];
    } else {
      data[`musicSystem_${key}`] = inMemoryStorage[key];
    }
  });
  
  data.timestamp = new Date().toISOString();
  
  // 🛡️ GUARD: Check that we have at least student data (unless explicitly allowed to be empty)
  if (!allowEmpty) {
    const hasStudents = data.musicSystem_students && 
                       Array.isArray(data.musicSystem_students) && 
                       data.musicSystem_students.length > 0;
    
    if (!hasStudents) {
      logger.error('❌ PREVENTED EMPTY DATA SYNC - No students found!');
      throw new Error('Cannot export empty data - system integrity check failed');
    }
  }
  
  return data;
};

// Utility function to simulate server-side ID generation
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

// Students
export const getStudents = (): Student[] => {
  if (isDevMode()) return devData['students'] || [];
  return inMemoryStorage['students'] || [];
};

export const addStudent = (student: Omit<Student, 'id'>): Student => {
  const students = getStudents();
  const newStudent: Student = {
    ...student,
    id: generateId(),
    lastModified: new Date().toISOString(),
  };
  students.push(newStudent);
  if (isDevMode()) {
    devData['students'] = students;
  } else {
    inMemoryStorage['students'] = students;
    hybridSync.onDataChange();
  }
  return newStudent;
};

export const updateStudent = (id: string, updatedFields: Partial<Student>): Student | undefined => {
  const students = getStudents();
  const studentIndex = students.findIndex(student => student.id === id);

  if (studentIndex === -1) {
    return undefined; // Student not found
  }

  // Update the student with the provided fields
  students[studentIndex] = { 
    ...students[studentIndex], 
    ...updatedFields,
    lastModified: new Date().toISOString()
  };
  if (isDevMode()) {
    devData['students'] = students;
  } else {
    inMemoryStorage['students'] = students;
    hybridSync.onDataChange();
  }
  return students[studentIndex];
};

export const deleteStudent = (id: string): boolean => {
  const students = getStudents();
  const updatedStudents = students.filter(student => student.id !== id);
  if (updatedStudents.length === students.length) {
    return false; // No student was deleted
  }
  if (isDevMode()) {
    devData['students'] = updatedStudents;
  } else {
    inMemoryStorage['students'] = updatedStudents;
    hybridSync.onDataChange();
  }
  return true;
};

// Update student bank time with notes (feature removed)
export const updateStudentBankTime = (studentId: string, changeInMinutes: number): boolean => {
  // Bank time feature has been removed
  return false;
};

// Lessons
export const getLessons = (): Lesson[] => {
  if (isDevMode()) return devData['lessons'] || [];
  return inMemoryStorage['lessons'] || [];
};

export const addLesson = (lesson: Omit<Lesson, 'id'>): Lesson => {
  const lessons = getLessons();
  const newLesson: Lesson = {
    ...lesson,
    id: generateId(),
    lastModified: new Date().toISOString(),
  };
  lessons.push(newLesson);
  if (isDevMode()) {
    devData['lessons'] = lessons;
  } else {
    inMemoryStorage['lessons'] = lessons;
    hybridSync.onDataChange();
  }
  return newLesson;
};

export const updateLesson = (id: string, updatedFields: Partial<Lesson>): Lesson | undefined => {
  const lessons = getLessons();
  const lessonIndex = lessons.findIndex(lesson => lesson.id === id);

  if (lessonIndex === -1) {
    return undefined; // Lesson not found
  }

  lessons[lessonIndex] = { 
    ...lessons[lessonIndex], 
    ...updatedFields,
    lastModified: new Date().toISOString()
  };
  if (isDevMode()) {
    devData['lessons'] = lessons;
  } else {
    inMemoryStorage['lessons'] = lessons;
    hybridSync.onDataChange();
  }
  return lessons[lessonIndex];
};

export const deleteLesson = async (id: string): Promise<boolean> => {
  const lessons = getLessons();
  const updatedLessons = lessons.filter(lesson => lesson.id !== id);
  if (updatedLessons.length === lessons.length) {
    return false; // No lesson was deleted
  }
  if (isDevMode()) {
    devData['lessons'] = updatedLessons;
  } else {
    inMemoryStorage['lessons'] = updatedLessons;
    // Use onDestructiveChange for deletes to prevent merge from restoring
    await hybridSync.onDestructiveChange();
  }
  return true;
};

// Helper for cascade changes - uses direct upload to prevent merge from restoring deleted records
const persistCascadeChanges = async (
  mutator: (store: typeof inMemoryStorage | typeof devData) => void
): Promise<void> => {
  if (isDevMode()) {
    // בסביבת dev – עובדים רק על devData
    mutator(devData as any);
  } else {
    // בסביבת Production – מעדכנים את inMemoryStorage
    mutator(inMemoryStorage as any);

    // העלאה ישירה ל-Worker ללא merge,
    // כדי שמחיקות לא ישוחזרו ברענון הבא
    await hybridSync.onDestructiveChange();
  }
};

// Cascade delete lesson - removes lesson and related swap requests
export const deleteLessonCascade = async (lessonId: string): Promise<boolean> => {
  const lessons = getLessons();
  const lesson = lessons.find(l => l.id === lessonId);
  if (!lesson) return false;

  const { studentId, date, startTime } = lesson;

  await persistCascadeChanges(store => {
    // 1. Delete the lesson itself
    store['lessons'] = (store['lessons'] || []).filter((l: any) => l.id !== lessonId);

    // 2. Delete related swap requests
    store['swapRequests'] = (store['swapRequests'] || []).filter((r: any) => {
      const byLessonId = r.requesterLessonId === lessonId || r.targetLessonId === lessonId;
      const byLegacyFields =
        (r.requesterId === studentId && r.date === date && r.time === startTime) ||
        (r.targetId === studentId && r.targetDate === date && r.targetTime === startTime);
      return !(byLessonId || byLegacyFields);
    });
  });

  // Use onDestructiveChange to directly upload without merge
  await hybridSync.onDestructiveChange();

  return true;
};

// Cascade delete student - removes student and all related data
export const deleteStudentCascade = async (studentId: string): Promise<boolean> => {
  const exists = getStudents().some(s => s.id === studentId);
  if (!exists) return false;

  await persistCascadeChanges(store => {
    store['students'] = (store['students'] || []).filter((s: any) => s.id !== studentId);
    store['lessons'] = (store['lessons'] || []).filter((l: any) => l.studentId !== studentId);
    store['payments'] = (store['payments'] || []).filter((p: any) => p.studentId !== studentId);
    store['files'] = (store['files'] || []).filter((f: any) => f.studentId !== studentId);
    store['practiceSessions'] = (store['practiceSessions'] || []).filter((s: any) => s.studentId !== studentId);
    store['monthlyAchievements'] = (store['monthlyAchievements'] || []).filter((a: any) => a.studentId !== studentId);
    store['medalRecords'] = (store['medalRecords'] || []).filter((m: any) => m.studentId !== studentId);

    // Clean swap requests
    store['swapRequests'] = (store['swapRequests'] || []).filter((r: any) => {
      const oldShape = r.requesterId !== studentId && r.targetId !== studentId;
      const newShape = r.requesterStudentId !== studentId && r.targetStudentId !== studentId;
      return oldShape && newShape;
    });

    // Delete student statistics
    const stats = store['studentStats'] || {};
    if (stats[studentId]) {
      const updated = { ...stats };
      delete updated[studentId];
      store['studentStats'] = updated;
    }
  });

  // Use onDestructiveChange to directly upload without merge
  await hybridSync.onDestructiveChange();

  return true;
};

// Payments
export const getPayments = (): Payment[] => {
  if (isDevMode()) return devData['payments'] || [];
  return inMemoryStorage['payments'] || [];
};

export const savePayments = (payments: Payment[]): void => {
  if (isDevMode()) {
    devData['payments'] = payments;
  } else {
    inMemoryStorage['payments'] = payments;
    hybridSync.onDataChange();
  }
};

export const addPayment = (payment: Omit<Payment, 'id'>): Payment => {
  const payments = getPayments();
  const newPayment: Payment = {
    ...payment,
    id: generateId(),
    lastModified: new Date().toISOString(),
  };
  payments.push(newPayment);
  if (isDevMode()) {
    devData['payments'] = payments;
  } else {
    inMemoryStorage['payments'] = payments;
    hybridSync.onDataChange();
  }
  return newPayment;
};

export const updatePayment = (studentId: string, month: string, updatedFields: Partial<Payment>): Payment | undefined => {
  const payments = getPayments();
  const paymentIndex = payments.findIndex(payment => payment.studentId === studentId && payment.month === month);

  if (paymentIndex === -1) {
    return undefined;
  }

  payments[paymentIndex] = { 
    ...payments[paymentIndex], 
    ...updatedFields,
    lastModified: new Date().toISOString()
  };
  if (isDevMode()) {
    devData['payments'] = payments;
  } else {
    inMemoryStorage['payments'] = payments;
    hybridSync.onDataChange();
  }
  return payments[paymentIndex];
};

export const deletePayment = async (id: string): Promise<boolean> => {
  const payments = getPayments();
  const updatedPayments = payments.filter(payment => payment.id !== id);
  if (updatedPayments.length === payments.length) {
    return false; // No payment was deleted
  }
  inMemoryStorage['payments'] = updatedPayments;
  await hybridSync.onDestructiveChange();
  return true;
};

// Swap Requests
export const getSwapRequests = (): SwapRequest[] => {
  if (isDevMode()) return devData['swapRequests'] || [];
  return inMemoryStorage['swapRequests'] || [];
};

export const addSwapRequest = (swapRequest: Omit<SwapRequest, 'id'>) => {
  const requests = getSwapRequests();
  const newRequest = {
    ...swapRequest,
    id: Date.now().toString(),
    lastModified: new Date().toISOString(),
  };
  requests.push(newRequest);
  inMemoryStorage['swapRequests'] = requests;
  hybridSync.onDataChange();
  return newRequest;
};

export const updateSwapRequest = (requestId: string, updates: Partial<SwapRequest>) => {
  const requests = getSwapRequests();
  const requestIndex = requests.findIndex(r => r.id === requestId);
  
  if (requestIndex === -1) return;
  
  const request = requests[requestIndex];
  requests[requestIndex] = { 
    ...request, 
    ...updates,
    lastModified: new Date().toISOString()
  };
  
  // If approved, perform the actual swap
  if (updates.status === 'approved') {
    performLessonSwap(requests[requestIndex]);
  }
  
  inMemoryStorage['swapRequests'] = requests;
  hybridSync.onDataChange();
};

export const updateSwapRequestStatus = (requestId: string, status: 'approved' | 'rejected') => {
  updateSwapRequest(requestId, { status });
};

export const performLessonSwap = (swapRequest: SwapRequest) => {
  const lessons = getLessons();
  
  // Find EXISTING lessons only (not templates) - search by date/time/studentId
  const originalLessonIndex = lessons.findIndex(l => 
    l.studentId === swapRequest.requesterId && 
    l.date === swapRequest.date && 
    l.startTime === swapRequest.time
  );
  
  const targetLessonIndex = swapRequest.targetDate && swapRequest.targetTime
    ? lessons.findIndex(l => 
        l.studentId === swapRequest.targetId && 
        l.date === swapRequest.targetDate && 
        l.startTime === swapRequest.targetTime
      )
    : -1;
  
  // Only swap if BOTH lessons exist
  if (originalLessonIndex === -1 || targetLessonIndex === -1) {
    console.error('Cannot swap: one or both lessons not found', {
      originalLessonIndex,
      targetLessonIndex,
      swapRequest
    });
    return;
  }
  
  // Perform bidirectional swap - exchange studentId between the two lessons
  const temp = lessons[originalLessonIndex].studentId;
  lessons[originalLessonIndex].studentId = lessons[targetLessonIndex].studentId;
  lessons[targetLessonIndex].studentId = temp;
  
  // Mark lessons as swapped
  const swapDate = new Date().toLocaleDateString('he-IL');

  lessons[originalLessonIndex].isSwapped = true;
  lessons[originalLessonIndex].notes = `שיעור שהוחלף (${swapDate})`;
  lessons[targetLessonIndex].isSwapped = true;
  lessons[targetLessonIndex].notes = `שיעור שהוחלף (${swapDate})`;
  
  // Save to storage
  inMemoryStorage['lessons'] = lessons;
  hybridSync.onDataChange();
  
  console.log('✅ Lesson swap completed successfully', {
    lesson1: lessons[originalLessonIndex],
    lesson2: lessons[targetLessonIndex]
  });
};

// Helper function to calculate end time
const calculateEndTime = (startTime: string, duration: number): string => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + duration;
  const newHours = Math.floor(totalMinutes / 60);
  const newMinutes = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
};

// Files
export const getFiles = (): FileEntry[] => {
  if (isDevMode()) return devData['files'] || [];
  return inMemoryStorage['files'] || [];
};

export const addFile = (file: Omit<FileEntry, 'id' | 'uploadDate'> & { uploadDate?: string }): FileEntry => {
  const files = getFiles();
  const newFile: FileEntry = {
    ...file,
    id: generateId(),
    uploadDate: file.uploadDate || new Date().toISOString(),
    lastModified: new Date().toISOString(),
  };
  files.push(newFile);

  if (isDevMode()) {
    devData['files'] = files;
  } else {
    inMemoryStorage['files'] = files;
    hybridSync.onDataChange();
  }
  return newFile;
};

export const updateFile = (id: string, updatedFields: Partial<FileEntry>): FileEntry | undefined => {
  const files = getFiles();
  const fileIndex = files.findIndex(file => file.id === id);

  if (fileIndex === -1) return undefined;

  files[fileIndex] = {
    ...files[fileIndex],
    ...updatedFields,
    lastModified: new Date().toISOString(),
  };

  if (isDevMode()) {
    devData['files'] = files;
  } else {
    inMemoryStorage['files'] = files;
    hybridSync.onDataChange();
  }

  return files[fileIndex];
};

export const deleteFile = async (id: string): Promise<boolean> => {
  const files = getFiles();
  const updatedFiles = files.filter(file => file.id !== id);
  if (updatedFiles.length === files.length) return false;

  if (isDevMode()) {
    devData['files'] = updatedFiles;
  } else {
    inMemoryStorage['files'] = updatedFiles;
    await hybridSync.onDestructiveChange();
  }
  return true;
};

// Schedule Templates
export const getScheduleTemplates = (): ScheduleTemplate[] => {
  if (isDevMode()) return devData['scheduleTemplates'] || [];
  return inMemoryStorage['scheduleTemplates'] || [];
};

export const getActiveScheduleTemplate = (): ScheduleTemplate | null => {
  const templates = getScheduleTemplates();
  return templates.find(t => t.isActive) || null;
};

export const addScheduleTemplate = (template: Omit<ScheduleTemplate, 'id' | 'createdAt'>): ScheduleTemplate => {
  const templates = getScheduleTemplates();
   const newTemplate: ScheduleTemplate = {
    ...template,
    id: generateId(),
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  };
  templates.push(newTemplate);
  if (isDevMode()) {
    devData['scheduleTemplates'] = templates;
  } else {
    inMemoryStorage['scheduleTemplates'] = templates;
    hybridSync.onDataChange();
  }
  return newTemplate;
};

export const activateScheduleTemplate = (id: string): ScheduleTemplate | undefined => {
  const templates = getScheduleTemplates();
  const templateIndex = templates.findIndex(template => template.id === id);

  if (templateIndex === -1) {
    return undefined; // Template not found
  }

  const now = new Date().toISOString();

  // Deactivate all other templates
  templates.forEach((template, index) => {
    if (index !== templateIndex && template.isActive) {
      template.isActive = false;
      template.deactivatedAt = now;
      template.lastModified = now;
    }
  });

  // Activate the selected template
  templates[templateIndex] = { 
    ...templates[templateIndex], 
    isActive: true,
    activatedAt: now,
    lastModified: now
  };
  
  if (isDevMode()) {
    devData['scheduleTemplates'] = templates;
  } else {
    inMemoryStorage['scheduleTemplates'] = templates;
    hybridSync.onDataChange();
  }
  return templates[templateIndex];
};

export const updateScheduleTemplate = (id: string, updatedFields: Partial<ScheduleTemplate>): ScheduleTemplate | undefined => {
  const templates = getScheduleTemplates();
  const templateIndex = templates.findIndex(template => template.id === id);

  if (templateIndex === -1) {
    return undefined; // Template not found
  }

  templates[templateIndex] = { 
    ...templates[templateIndex], 
    ...updatedFields,
    lastModified: new Date().toISOString()
  };
  if (isDevMode()) {
    devData['scheduleTemplates'] = templates;
  } else {
    inMemoryStorage['scheduleTemplates'] = templates;
    hybridSync.onDataChange();
  }
  return templates[templateIndex];
};

export const deleteScheduleTemplate = async (id: string): Promise<boolean> => {
  const templates = getScheduleTemplates();
  const updatedTemplates = templates.filter(template => template.id !== id);
  if (updatedTemplates.length === templates.length) {
    return false; // No template was deleted
  }
  if (isDevMode()) {
    devData['scheduleTemplates'] = updatedTemplates;
  } else {
    inMemoryStorage['scheduleTemplates'] = updatedTemplates;
    await hybridSync.onDestructiveChange();
  }
  return true;
};

export const syncStudentWithTemplate = (studentId: string, dayOfWeek: number, timeSlot: string, add: boolean): void => {
  const activeTemplate = getActiveScheduleTemplate();
  if (!activeTemplate) return;

  const dayKey = dayOfWeek.toString();
  
  if (add) {
    // Add student to this time slot
    if (!activeTemplate.schedule[dayKey]) {
      activeTemplate.schedule[dayKey] = {};
    }
    activeTemplate.schedule[dayKey][timeSlot] = {
      studentId,
      duration: 30
    };
  } else {
    // Remove student from this time slot
    if (activeTemplate.schedule[dayKey] && activeTemplate.schedule[dayKey][timeSlot]) {
      delete activeTemplate.schedule[dayKey][timeSlot];
    }
  }

  updateScheduleTemplate(activeTemplate.id, { schedule: activeTemplate.schedule });
};

// Integration Settings
export const getIntegrationSettings = (): IntegrationSettings | null => {
  if (isDevMode()) return devData['integrationSettings'] || null;
  return inMemoryStorage['integrationSettings'] || null;
};

export const saveIntegrationSettings = (settings: IntegrationSettings): void => {
  if (isDevMode()) {
    devData['integrationSettings'] = settings;
  } else {
    inMemoryStorage['integrationSettings'] = settings;
    hybridSync.onDataChange();
  }
};

// User Authentication - Only stored in sessionStorage
export const setCurrentUser = (user: { type: string; studentId?: string; adminId?: string; adminCode?: string } | null): void => {
  sessionStorage.setItem('musicSystem_currentUser', JSON.stringify(user));
  // Also store in localStorage for Worker API access
  if (user) {
    localStorage.setItem('musicSystem_currentUser', JSON.stringify(user));
  } else {
    localStorage.removeItem('musicSystem_currentUser');
  }
};

export const getCurrentUser = (): { type: string; studentId?: string; adminId?: string; adminCode?: string } | null => {
  const storedUser = sessionStorage.getItem('musicSystem_currentUser');
  return storedUser ? JSON.parse(storedUser) : null;
};

// Helper function to calculate lesson number
export const calculateLessonNumber = (studentId: string, lessonDate: string, lessonId?: string): number => {
  const student = getStudents().find(s => s.id === studentId);
  if (!student) return 0;

  // If student hasn't started yet, return 0
  const startDate = new Date(student.startDate);
  const checkDate = new Date(lessonDate);
  
  if (checkDate < startDate) return 0;

  const lessons = getLessons()
    .filter(lesson => lesson.studentId === studentId && new Date(lesson.date) <= checkDate)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (lessonId) {
    const lessonIndex = lessons.findIndex(lesson => lesson.id === lessonId);
    return lessonIndex >= 0 ? lessonIndex + (student.startingLessonNumber || 1) : 0;
  }

  return lessons.length + (student.startingLessonNumber || 1) - 1;
};

// Performances

/**
 * Migrate legacy performance records: if there are no performancePayments[]
 * but there is a paidDate + amount + a "paid" status, synthesize a single
 * payment entry from the legacy fields. Pure function — does not persist.
 */
const migratePerformanceShape = (perf: Performance): Performance => {
  if (perf.performancePayments && perf.performancePayments.length > 0) return perf;
  if (perf.paidDate && perf.amount && perf.amount > 0 && perf.paymentStatus !== 'not_paid') {
    return {
      ...perf,
      performancePayments: [
        {
          id: `${perf.id}-legacy`,
          date: perf.paidDate.slice(0, 10),
          amount: perf.amount,
          travel: perf.travel || 0,
          method: (perf.paymentStatus as any) === 'not_paid' ? undefined : (perf.paymentStatus as 'bank' | 'check' | 'cash'),
          notes: 'מיגרציה אוטומטית מתשלום ישן',
        },
      ],
    };
  }
  return { ...perf, performancePayments: perf.performancePayments || [] };
};

export const getPerformances = (): Performance[] => {
  const raw: Performance[] = isDevMode() ? (devData['performances'] || []) : (inMemoryStorage['performances'] || []);
  return raw.map(migratePerformanceShape);
};

/** Sum of all recorded INCOME payments for a performance (excludes travel — source of truth for income/tithe). */
export const getPerformancePaidTotal = (perf: Performance): number => {
  const migrated = migratePerformanceShape(perf);
  return (migrated.performancePayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
};

/** Sum of all travel reimbursements received. Info only — NEVER counted as income. */
export const getPerformancePaidTravelTotal = (perf: Performance): number => {
  const migrated = migratePerformanceShape(perf);
  return (migrated.performancePayments || []).reduce((sum, p) => sum + (p.travel || 0), 0);
};

/** Derived status from performancePayments[]. */
export const getPerformancePaymentStatus = (perf: Performance): 'not_paid' | 'partial' | 'paid' => {
  const total = (perf.amount || 0);
  const paid = getPerformancePaidTotal(perf);
  if (paid <= 0) return 'not_paid';
  if (total > 0 && paid < total) return 'partial';
  return 'paid';
};

/** Add a payment entry to a performance (source of truth for income). */
export const addPerformancePayment = (
  performanceId: string,
  payment: Omit<PerformancePayment, 'id'>
): Performance | undefined => {
  const performances = getPerformances();
  const idx = performances.findIndex(p => p.id === performanceId);
  if (idx === -1) return undefined;
  const newEntry: PerformancePayment = { ...payment, id: generateId() };
  const existing = performances[idx].performancePayments || [];
  performances[idx] = {
    ...performances[idx],
    performancePayments: [...existing, newEntry],
    lastModified: new Date().toISOString(),
  };
  if (isDevMode()) {
    devData['performances'] = performances;
  } else {
    inMemoryStorage['performances'] = performances;
    hybridSync.onDataChange();
  }
  return performances[idx];
};

export const updatePerformancePayment = (
  performanceId: string,
  paymentId: string,
  updates: Partial<Omit<PerformancePayment, 'id'>>
): Performance | undefined => {
  const performances = getPerformances();
  const idx = performances.findIndex(p => p.id === performanceId);
  if (idx === -1) return undefined;
  const list = performances[idx].performancePayments || [];
  const updated = list.map(p => (p.id === paymentId ? { ...p, ...updates } : p));
  performances[idx] = { ...performances[idx], performancePayments: updated, lastModified: new Date().toISOString() };
  if (isDevMode()) {
    devData['performances'] = performances;
  } else {
    inMemoryStorage['performances'] = performances;
    hybridSync.onDataChange();
  }
  return performances[idx];
};

export const deletePerformancePayment = (
  performanceId: string,
  paymentId: string
): Performance | undefined => {
  const performances = getPerformances();
  const idx = performances.findIndex(p => p.id === performanceId);
  if (idx === -1) return undefined;
  const list = performances[idx].performancePayments || [];
  performances[idx] = {
    ...performances[idx],
    performancePayments: list.filter(p => p.id !== paymentId),
    lastModified: new Date().toISOString(),
  };
  if (isDevMode()) {
    devData['performances'] = performances;
  } else {
    inMemoryStorage['performances'] = performances;
    hybridSync.onDataChange();
  }
  return performances[idx];
};

export const addPerformance = (performance: Omit<Performance, 'id' | 'createdAt'>): Performance => {
  const performances = getPerformances();
  const now = new Date().toISOString();
  const newPerformance: Performance = {
    ...performance,
    id: generateId(),
    createdAt: now,
    lastModified: now,
  };
  performances.push(newPerformance);
  if (isDevMode()) {
    devData['performances'] = performances;
  } else {
    inMemoryStorage['performances'] = performances;
    hybridSync.onDataChange();
  }
  return newPerformance;
};

export const updatePerformance = (id: string, updatedFields: Partial<Performance>): Performance | undefined => {
  const performances = getPerformances();
  const performanceIndex = performances.findIndex(perf => perf.id === id);

  if (performanceIndex === -1) {
    return undefined;
  }

  performances[performanceIndex] = { 
    ...performances[performanceIndex], 
    ...updatedFields,
    lastModified: new Date().toISOString()
  };
  if (isDevMode()) {
    devData['performances'] = performances;
  } else {
    inMemoryStorage['performances'] = performances;
    hybridSync.onDataChange();
  }
  return performances[performanceIndex];
};

export const deletePerformance = async (id: string): Promise<boolean> => {
  const performances = getPerformances();
  const updatedPerformances = performances.filter(perf => perf.id !== id);
  if (updatedPerformances.length === performances.length) {
    return false;
  }
  if (isDevMode()) {
    devData['performances'] = updatedPerformances;
  } else {
    inMemoryStorage['performances'] = updatedPerformances;
    await hybridSync.onDestructiveChange();
  }
  return true;
};

// One Time Payments
export const getOneTimePayments = (): OneTimePayment[] => {
  if (isDevMode()) return devData['oneTimePayments'] || [];
  return inMemoryStorage['oneTimePayments'] || [];
};

export const saveOneTimePayments = (payments: OneTimePayment[]): void => {
  if (isDevMode()) {
    devData['oneTimePayments'] = payments;
  } else {
    inMemoryStorage['oneTimePayments'] = payments;
    hybridSync.onDataChange();
  }
};

export const updateOneTimePayment = (id: string, updates: Partial<OneTimePayment>): OneTimePayment | undefined => {
  const payments = getOneTimePayments();
  const index = payments.findIndex(p => p.id === id);
  if (index === -1) return undefined;
  
  payments[index] = { ...payments[index], ...updates };
  saveOneTimePayments(payments);
  return payments[index];
};

export const deleteOneTimePayment = async (id: string): Promise<boolean> => {
  const payments = getOneTimePayments();
  const updated = payments.filter(p => p.id !== id);
  if (updated.length === payments.length) return false;
  
  if (isDevMode()) {
    devData['oneTimePayments'] = updated;
  } else {
    inMemoryStorage['oneTimePayments'] = updated;
    await hybridSync.onDestructiveChange();
  }
  return true;
};

// Per-Lesson Payments
const roundTo2 = (value: number): number => Number(value.toFixed(2));

export const getPerLessonPayments = (): PerLessonPayment[] => {
  if (isDevMode()) return devData['perLessonPayments'] || [];
  return inMemoryStorage['perLessonPayments'] || [];
};

export const addPerLessonPayment = (payment: Omit<PerLessonPayment, 'id'>): PerLessonPayment => {
  const payments = getPerLessonPayments();
  const newPayment: PerLessonPayment = {
    ...payment,
    id: Date.now().toString(36) + Math.random().toString(36).substring(2),
  };
  payments.push(newPayment);
  
  if (isDevMode()) {
    devData['perLessonPayments'] = payments;
  } else {
    inMemoryStorage['perLessonPayments'] = payments;
    hybridSync.onDataChange();
  }
  return newPayment;
};

export const getStudentPerLessonPayments = (studentId: string): PerLessonPayment[] => {
  return getPerLessonPayments().filter(p => p.studentId === studentId);
};

export const getCompletedLessonsForStudent = (studentId: string): Lesson[] => {
  return getLessons()
    .filter(l => l.studentId === studentId && l.status === 'completed')
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });
};

export const recalculatePerLessonStudentSummary = (studentId: string): Student | undefined => {
  const student = getStudents().find(s => s.id === studentId);
  if (!student || !student.lessonPrice || student.lessonPrice <= 0) return student;

  const totalPaid = roundTo2(
    getStudentPerLessonPayments(studentId).reduce((sum, payment) => sum + (payment.amount || 0), 0)
  );
  const paidLessonsCount = Math.floor(totalPaid / student.lessonPrice);
  const perLessonBalance = roundTo2(totalPaid - (paidLessonsCount * student.lessonPrice));

  return updateStudent(studentId, {
    paidLessonsCount,
    perLessonBalance,
  });
};

export const getStudentPerLessonLedger = (studentId: string): PerLessonLedger => {
  const student = getStudents().find(s => s.id === studentId);
  const lessonPrice = student?.lessonPrice || 0;
  const lessons = getCompletedLessonsForStudent(studentId);
  const payments = getStudentPerLessonPayments(studentId)
    .slice()
    .sort((a, b) => {
      const dateCompare = (a.paymentDate || '').localeCompare(b.paymentDate || '');
      if (dateCompare !== 0) return dateCompare;
      return a.id.localeCompare(b.id);
    });

  const paymentPools = payments.map(payment => ({
    id: payment.id,
    paymentDate: payment.paymentDate,
    remaining: roundTo2(payment.amount || 0),
  }));

  const rows: PerLessonLedgerRow[] = [];
  let runningBalance = 0;

  for (const lesson of lessons) {
    let remainingDue = roundTo2(lessonPrice);
    let amountPaid = 0;
    const paymentDates: string[] = [];

    for (const payment of paymentPools) {
      if (remainingDue <= 0) break;
      if (payment.remaining <= 0) continue;

      const allocated = roundTo2(Math.min(payment.remaining, remainingDue));
      if (allocated <= 0) continue;

      payment.remaining = roundTo2(payment.remaining - allocated);
      remainingDue = roundTo2(remainingDue - allocated);
      amountPaid = roundTo2(amountPaid + allocated);

      if (!paymentDates.includes(payment.paymentDate)) {
        paymentDates.push(payment.paymentDate);
      }
    }

    const balance = roundTo2(amountPaid - lessonPrice);
    runningBalance = roundTo2(runningBalance + amountPaid - lessonPrice);

    rows.push({
      id: lesson.id,
      rowType: 'lesson',
      lessonId: lesson.id,
      lessonDate: lesson.date,
      amountDue: roundTo2(lessonPrice),
      amountPaid,
      paymentDates,
      balance,
      runningBalance,
    });
  }

  const remainingCreditPayments = paymentPools.filter(payment => payment.remaining > 0);
  const remainingCredit = roundTo2(remainingCreditPayments.reduce((sum, payment) => sum + payment.remaining, 0));

  if (remainingCredit > 0) {
    runningBalance = roundTo2(runningBalance + remainingCredit);

    rows.push({
      id: `credit-${studentId}`,
      rowType: 'credit',
      amountDue: 0,
      amountPaid: remainingCredit,
      paymentDates: Array.from(new Set(remainingCreditPayments.map(payment => payment.paymentDate))),
      balance: remainingCredit,
      runningBalance,
    });
  }

  const totalPaid = roundTo2(payments.reduce((sum, payment) => sum + (payment.amount || 0), 0));
  const totalDue = roundTo2(lessons.length * lessonPrice);
  const totalBalance = roundTo2(totalPaid - totalDue);

  return {
    lessonPrice,
    completedLessonsCount: lessons.length,
    totalDue,
    totalPaid,
    totalBalance,
    rows,
  };
};

export const updatePerLessonPayment = (id: string, updates: Partial<PerLessonPayment>): PerLessonPayment | undefined => {
  const payments = getPerLessonPayments();
  const index = payments.findIndex(p => p.id === id);
  if (index === -1) return undefined;

  const previousPayment = payments[index];
  const nextStudentId = updates.studentId || previousPayment.studentId;
  const nextPaymentDate = updates.paymentDate || previousPayment.paymentDate;
  const nextAmount = typeof updates.amount === 'number' ? updates.amount : previousPayment.amount;
  const nextStudent = getStudents().find(s => s.id === nextStudentId);

  payments[index] = {
    ...previousPayment,
    ...updates,
    paymentDate: nextPaymentDate,
    month: nextPaymentDate.substring(0, 7),
    lessonsCount: nextStudent?.lessonPrice ? Math.floor(nextAmount / nextStudent.lessonPrice) : previousPayment.lessonsCount,
  };

  if (isDevMode()) {
    devData['perLessonPayments'] = payments;
  } else {
    inMemoryStorage['perLessonPayments'] = payments;
    hybridSync.onDataChange();
  }

  recalculatePerLessonStudentSummary(previousPayment.studentId);
  if (nextStudentId !== previousPayment.studentId) {
    recalculatePerLessonStudentSummary(nextStudentId);
  }

  return payments[index];
};

export const deletePerLessonPayment = async (id: string): Promise<boolean> => {
  const payments = getPerLessonPayments();
  const paymentToDelete = payments.find(p => p.id === id);
  if (!paymentToDelete) return false;

  const updated = payments.filter(p => p.id !== id);

  if (isDevMode()) {
    devData['perLessonPayments'] = updated;
  } else {
    inMemoryStorage['perLessonPayments'] = updated;
  }

  recalculatePerLessonStudentSummary(paymentToDelete.studentId);

  if (!isDevMode()) {
    await hybridSync.onDestructiveChange();
  }

  return true;
};

// Record a per-lesson payment with balance tracking
export const recordPerLessonPayment = (
  studentId: string, 
  amount: number, 
  paymentDate: string, 
  notes?: string
): { payment: PerLessonPayment; newBalance: number; lessonsCovered: number } | null => {
  const student = getStudents().find(s => s.id === studentId);
  if (!student || !student.lessonPrice) return null;

  const lessonPrice = student.lessonPrice;
  const currentPaidLessons = student.paidLessonsCount || 0;
  const currentBalance = student.perLessonBalance || 0;

  // Calculate how many lessons this payment covers
  const totalAvailable = amount + currentBalance;
  const lessonsCovered = Math.floor(totalAvailable / lessonPrice);
  const newBalance = roundTo2(totalAvailable - (lessonsCovered * lessonPrice));

  // Create payment record
  const payment = addPerLessonPayment({
    studentId,
    amount,
    lessonsCount: lessonsCovered,
    paymentDate,
    month: paymentDate.substring(0, 7), // YYYY-MM
    notes,
  });

  const updatedStudent = recalculatePerLessonStudentSummary(studentId);

  return {
    payment,
    newBalance: updatedStudent?.perLessonBalance ?? newBalance,
    lessonsCovered: Math.max(0, (updatedStudent?.paidLessonsCount ?? currentPaidLessons) - currentPaidLessons),
  };
};

// Convert annual student to per-lesson and migrate existing payments
export const convertAnnualToPerLesson = (
  studentId: string,
  lessonPrice: number
): { convertedPayments: PerLessonPayment[]; totalAmount: number } | null => {
  const student = getStudents().find(s => s.id === studentId);
  if (!student) return null;
  
  // Get all annual payments for this student
  const allPayments = getPayments();
  const studentPayments = allPayments.filter(p => p.studentId === studentId && p.status === 'paid' && p.amount > 0);
  
  if (studentPayments.length === 0) {
    return { convertedPayments: [], totalAmount: 0 };
  }
  
  let totalAmount = 0;
  const convertedPayments: PerLessonPayment[] = [];
  
  // Convert each annual payment to a per-lesson payment
  for (const payment of studentPayments) {
    const paymentDate = payment.paidDate || `${payment.month}-01`;
    const amount = payment.amount;
    totalAmount += amount;
    
    const newPayment = addPerLessonPayment({
      studentId,
      amount,
      lessonsCount: Math.floor(amount / lessonPrice),
      paymentDate,
      month: payment.month,
      notes: 'הועבר ממסלול שנתי',
    });
    
    convertedPayments.push(newPayment);
  }
  
  // Calculate how many lessons these payments cover
  const totalLessonsCovered = Math.floor(totalAmount / lessonPrice);
  const remainingBalance = totalAmount - (totalLessonsCovered * lessonPrice);
  
  // Update student with per-lesson fields
  updateStudent(studentId, {
    paymentType: 'per_lesson',
    lessonPrice,
    paidLessonsCount: totalLessonsCovered,
    perLessonBalance: remainingBalance,
  });
  
  // Remove the annual payments
  const updatedPayments = allPayments.filter(p => p.studentId !== studentId);
  savePayments(updatedPayments);
  
  return { convertedPayments, totalAmount }
};

// Holidays
export const getHolidays = (): Holiday[] => {
  if (isDevMode()) return devData['holidays'] || [];
  return inMemoryStorage['holidays'] || [];
};

export const addHoliday = (date: string, description?: string): Holiday => {
  const holidays = getHolidays();
  const now = new Date().toISOString();
  const newHoliday: Holiday = {
    id: generateId(),
    date,
    description,
    createdAt: now,
    lastModified: now,
  };
  holidays.push(newHoliday);
  if (isDevMode()) {
    devData['holidays'] = holidays;
  } else {
    inMemoryStorage['holidays'] = holidays;
    hybridSync.onDataChange();
  }
  return newHoliday;
};

export const deleteHoliday = async (date: string): Promise<boolean> => {
  const holidays = getHolidays();
  const updatedHolidays = holidays.filter(h => h.date !== date);
  if (updatedHolidays.length === holidays.length) {
    return false;
  }
  if (isDevMode()) {
    devData['holidays'] = updatedHolidays;
  } else {
    inMemoryStorage['holidays'] = updatedHolidays;
    await hybridSync.onDestructiveChange();
  }
  return true;
};

export const isHoliday = (date: string): boolean => {
  const holidays = getHolidays();
  return holidays.some(h => h.date === date);
};

// Practice Sessions
export const getPracticeSessions = (): PracticeSession[] => {
  if (isDevMode()) return devData['practiceSessions'] || [];
  return inMemoryStorage['practiceSessions'] || [];
};

export const getStudentPracticeSessions = (studentId: string): PracticeSession[] => {
  const sessions = getPracticeSessions();
  return sessions.filter(s => s.studentId === studentId).sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
};

export const addPracticeSession = (
  session: Omit<PracticeSession, 'id' | 'createdAt'>
): PracticeSession => {
  const sessions = getPracticeSessions();
  const now = new Date().toISOString();

  const newSession: PracticeSession = {
    ...session,
    id: generateId(),
    createdAt: now,
    lastModified: now,
  };

  sessions.push(newSession);

  // ✅ Recalc monthly achievements from source-of-truth sessions
  recalcMonthlyAchievementFromSessions(newSession.studentId, newSession.date.slice(0, 7));

  if (isDevMode()) {
    devData['practiceSessions'] = sessions;
    devData['monthlyAchievements'] = getMonthlyAchievements();
  } else {
    inMemoryStorage['practiceSessions'] = sessions;
    inMemoryStorage['monthlyAchievements'] = getMonthlyAchievements();
    hybridSync.onDataChange();
  }

  return newSession;
};


export const updatePracticeSession = (
  id: string,
  updatedFields: Partial<PracticeSession>
): PracticeSession | undefined => {
  const sessions = getPracticeSessions();
  const index = sessions.findIndex(s => s.id === id);
  if (index === -1) return undefined;

  const before = sessions[index];
  const beforeMonth = before.date.slice(0, 7);

  const now = new Date().toISOString();

  sessions[index] = {
    ...before,
    ...updatedFields,
    lastModified: now,
  };

  const after = sessions[index];
  const afterMonth = after.date.slice(0, 7);

  // ✅ Recalc affected month(s)
  recalcMonthlyAchievementFromSessions(after.studentId, afterMonth);
  if (beforeMonth !== afterMonth) {
    recalcMonthlyAchievementFromSessions(before.studentId, beforeMonth);
  }

  if (isDevMode()) {
    devData['practiceSessions'] = sessions;
    devData['monthlyAchievements'] = getMonthlyAchievements();
  } else {
    inMemoryStorage['practiceSessions'] = sessions;
    inMemoryStorage['monthlyAchievements'] = getMonthlyAchievements();
    hybridSync.onDataChange();
  }

  return sessions[index];
};


export const deletePracticeSession = async (id: string): Promise<boolean> => {
  const sessions = getPracticeSessions();
  const sessionToDelete = sessions.find(s => s.id === id);

  const updatedSessions = sessions.filter(s => s.id !== id);
  if (updatedSessions.length === sessions.length) return false;

  if (isDevMode()) {
    devData['practiceSessions'] = updatedSessions;

    if (sessionToDelete) {
      recalcMonthlyAchievementFromSessions(
        sessionToDelete.studentId,
        sessionToDelete.date.slice(0, 7)
      );
    }

    devData['monthlyAchievements'] = getMonthlyAchievements();
  } else {
    inMemoryStorage['practiceSessions'] = updatedSessions;

    if (sessionToDelete) {
      recalcMonthlyAchievementFromSessions(
        sessionToDelete.studentId,
        sessionToDelete.date.slice(0, 7)
      );
    }

    inMemoryStorage['monthlyAchievements'] = getMonthlyAchievements();

    // ✅ important for deletes
    await hybridSync.onDestructiveChange();
  }

  return true;
};


// Monthly Achievements
export const getMonthlyAchievements = (): MonthlyAchievement[] => {
  if (isDevMode()) return devData['monthlyAchievements'] || [];
  return inMemoryStorage['monthlyAchievements'] || [];
};

export const getStudentMonthlyAchievements = (studentId: string): MonthlyAchievement[] => {
  const achievements = getMonthlyAchievements();
  return achievements.filter(a => a.studentId === studentId);
};

export const getCurrentMonthAchievement = (studentId: string): MonthlyAchievement | null => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const achievements = getMonthlyAchievements();
  return achievements.find(a => a.studentId === studentId && a.month === currentMonth) || null;
};

const recalcMonthlyAchievementFromSessions = (
  studentId: string,
  month: string // YYYY-MM
): void => {
  const sessions = getPracticeSessions().filter(
    (s) => s.studentId === studentId && s.date.startsWith(month)
  );

  // Sum minutes per date
  const dailyTotals: Record<string, number> = {};
  for (const s of sessions) {
    dailyTotals[s.date] = (dailyTotals[s.date] || 0) + (s.durationMinutes || 0);
  }

  const maxDailyMinutes =
    Object.keys(dailyTotals).length > 0 ? Math.max(...Object.values(dailyTotals)) : 0;

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const practicedDays = Object.keys(dailyTotals).length;
  const dailyAverage = practicedDays > 0 ? totalMinutes / practicedDays : 0;

  // Longest streak inside month
  const practicedDates = Object.keys(dailyTotals)
    .filter((d) => dailyTotals[d] >= 1)
    .sort();

  let maxStreak = 0;
  let currentStreak = 0;
  let prev: Date | null = null;

  for (const d of practicedDates) {
    const cur = new Date(d);
    if (!prev) {
      currentStreak = 1;
    } else {
      const diffDays = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      currentStreak = diffDays === 1 ? currentStreak + 1 : 1;
    }
    maxStreak = Math.max(maxStreak, currentStreak);
    prev = cur;
  }

  const achievements = getMonthlyAchievements();
  const index = achievements.findIndex(a => a.studentId === studentId && a.month === month);
  const now = new Date().toISOString();

  const next = {
    id: index !== -1 ? achievements[index].id : generateId(),
    studentId,
    month,
    maxDailyAverage: dailyAverage,
    maxDailyMinutes,
    maxStreak,
    createdAt: index !== -1 ? achievements[index].createdAt : now,
    updatedAt: now,
    lastModified: now,
  };

  if (index !== -1) achievements[index] = next;
  else achievements.push(next);

  if (isDevMode()) {
    devData['monthlyAchievements'] = achievements;
  } else {
    inMemoryStorage['monthlyAchievements'] = achievements;
  }
};

export const updateMonthlyAchievement = (
  studentId: string,
  _updates: { maxDailyAverage?: number; maxDailyMinutes?: number; maxStreak?: number }
): void => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  recalcMonthlyAchievementFromSessions(studentId, currentMonth);

  if (!isDevMode()) {
    hybridSync.onDataChange();
  }
};

export const getCurrentMonthLeaderboard = (): LeaderboardEntry[] => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const achievements = getMonthlyAchievements().filter(a => a.month === currentMonth);
  const students = getStudents();
  
  return achievements
    .map(a => {
      const student = students.find(s => s.id === a.studentId);
      if (!student) return null;
      
      return {
        studentId: a.studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        dailyAverage: a.maxDailyAverage,
        maxDailyMinutes: a.maxDailyMinutes,
        maxStreak: a.maxStreak,
      };
    })
    .filter((entry): entry is LeaderboardEntry => entry !== null)
    .sort((a, b) => b.dailyAverage - a.dailyAverage);
};

export const getCurrentQuarterLeaderboard = (): LeaderboardEntry[] => {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();
  
  // Determine quarter months (Sep-Nov, Dec-Feb, Mar-May, Jun-Aug)
  let quarterMonths: string[];
  if (month >= 8 && month <= 10) {
    // Q1: Sep-Nov
    quarterMonths = [
      `${year}-09`,
      `${year}-10`,
      `${year}-11`
    ];
  } else if (month === 11 || month <= 1) {
    // Q2: Dec-Feb (crosses year boundary)
    const startYear = month === 11 ? year : year - 1;
    quarterMonths = [
      `${startYear}-12`,
      `${startYear + 1}-01`,
      `${startYear + 1}-02`
    ];
  } else if (month >= 2 && month <= 4) {
    // Q3: Mar-May
    quarterMonths = [
      `${year}-03`,
      `${year}-04`,
      `${year}-05`
    ];
  } else {
    // Q4: Jun-Aug
    quarterMonths = [
      `${year}-06`,
      `${year}-07`,
      `${year}-08`
    ];
  }
  
  const achievements = getMonthlyAchievements().filter(a => quarterMonths.includes(a.month));
  const students = getStudents();
  
  // Aggregate achievements by student
  const aggregated = new Map<string, { dailyAverage: number; maxDailyMinutes: number; maxStreak: number }>();
  
  achievements.forEach(a => {
    const existing = aggregated.get(a.studentId);
    if (!existing) {
      aggregated.set(a.studentId, {
        dailyAverage: a.maxDailyAverage,
        maxDailyMinutes: a.maxDailyMinutes,
        maxStreak: a.maxStreak,
      });
    } else {
      aggregated.set(a.studentId, {
        dailyAverage: Math.max(existing.dailyAverage, a.maxDailyAverage),
        maxDailyMinutes: Math.max(existing.maxDailyMinutes, a.maxDailyMinutes),
        maxStreak: Math.max(existing.maxStreak, a.maxStreak),
      });
    }
  });
  
  return Array.from(aggregated.entries())
    .map(([studentId, stats]) => {
      const student = students.find(s => s.id === studentId);
      if (!student) return null;
      
      return {
        studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        dailyAverage: stats.dailyAverage,
        maxDailyMinutes: stats.maxDailyMinutes,
        maxStreak: stats.maxStreak,
      };
    })
    .filter((entry): entry is LeaderboardEntry => entry !== null)
    .sort((a, b) => b.dailyAverage - a.dailyAverage);
};

// ============= YEARLY LEADERBOARD (5 CATEGORIES + MEDAL KPI) =============

/**
 * Get the current academic year range (Sep 1 to Sep 1)
 */
const getAcademicYearRange = (): { start: Date; end: Date } => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  
  // Academic year starts Sep 1
  // If we're in Sep-Dec, academic year is currentYear to currentYear+1
  // If we're in Jan-Aug, academic year is currentYear-1 to currentYear
  let startYear: number;
  if (currentMonth >= 8) { // Sep (8) or later
    startYear = currentYear;
  } else {
    startYear = currentYear - 1;
  }
  
  const start = new Date(startYear, 8, 1, 0, 0, 0, 0); // Sep 1, 00:00
  const end = new Date(startYear + 1, 8, 1, 0, 0, 0, 0); // Next Sep 1, 00:00 (exclusive)
  
  return { start, end };
};

/**
 * Get current calendar week range (Saturday 00:00 to Saturday 00:00)
 */
const getCurrentWeekRange = (): { start: Date; end: Date } => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  
  // Calculate days since last Saturday
  // If today is Saturday (6), daysSinceSat = 0
  // If today is Sunday (0), daysSinceSat = 1
  // etc.
  const daysSinceSat = (dayOfWeek + 1) % 7;
  
  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceSat);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  
  return { start, end };
};

/**
 * Get rolling 7 days window (D-7 to D-1)
 * Today is NOT included
 */
const getRolling7DaysRange = (): { start: Date; end: Date } => {
  const now = new Date();
  
  // End = yesterday 23:59:59
  const end = new Date(now);
  end.setDate(now.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  
  // Start = 7 days before today at 00:00
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  
  return { start, end };
};

/**
 * Calculate max daily minutes from sessions
 */
const calcMaxDailyMinutes = (sessions: PracticeSession[]): number => {
  if (sessions.length === 0) return 0;
  
  const dailyTotals: Record<string, number> = {};
  sessions.forEach(s => {
    dailyTotals[s.date] = (dailyTotals[s.date] || 0) + s.durationMinutes;
  });
  
  return Math.max(0, ...Object.values(dailyTotals));
};

/**
 * Calculate longest streak of consecutive days with practice
 */
const calcMaxStreak = (sessions: PracticeSession[]): number => {
  if (sessions.length === 0) return 0;
  
  // Get unique dates with at least 1 minute
  const datesWithPractice = new Set<string>();
  sessions.forEach(s => {
    if (s.durationMinutes >= 1) {
      datesWithPractice.add(s.date);
    }
  });
  
  if (datesWithPractice.size === 0) return 0;
  
  // Sort dates
  const sortedDates = Array.from(datesWithPractice).sort();
  
  let maxStreak = 1;
  let currentStreak = 1;
  
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    
    // Check if consecutive days
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  
  return maxStreak;
};

/**
 * Calculate highest average between lessons
 * Average = total minutes in segment / calendar days in segment
 */
const calcMaxAvgBetweenLessons = (studentId: string, sessions: PracticeSession[], academicYearStart: Date, academicYearEnd: Date): number => {
  const lessons = getLessons()
    .filter(l => l.studentId === studentId && l.status === 'completed')
    .filter(l => {
      const lessonDate = new Date(l.date);
      return lessonDate >= academicYearStart && lessonDate < academicYearEnd;
    })
    .sort((a, b) => {
      // Sort by date, then by startTime
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });
  
  if (lessons.length < 2) return 0;
  
  let maxAvg = 0;
  
  for (let i = 1; i < lessons.length; i++) {
    const prevLesson = lessons[i - 1];
    const currLesson = lessons[i];
    
    // Segment: from prevLesson start time to currLesson start time
    const segmentStart = new Date(`${prevLesson.date}T${prevLesson.startTime}:00`);
    const segmentEnd = new Date(`${currLesson.date}T${currLesson.startTime}:00`);
    
    // Calculate calendar days in segment
    const daysDiff = Math.max(1, Math.ceil((segmentEnd.getTime() - segmentStart.getTime()) / (1000 * 60 * 60 * 24)));
    
    // Sum practice minutes in this segment
    const segmentSessions = sessions.filter(s => {
      const sessionDate = new Date(s.date);
      return sessionDate >= segmentStart && sessionDate < segmentEnd;
    });
    
    const totalMinutes = segmentSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
    const avg = totalMinutes / daysDiff;
    
    maxAvg = Math.max(maxAvg, avg);
  }
  
  return maxAvg;
};

/**
 * Calculate rolling 7 days total
 */
const calcRolling7DaysTotal = (sessions: PracticeSession[]): number => {
  const { start, end } = getRolling7DaysRange();
  
  return sessions
    .filter(s => {
      const sessionDate = new Date(s.date);
      return sessionDate >= start && sessionDate <= end;
    })
    .reduce((sum, s) => sum + s.durationMinutes, 0);
};

/**
 * Calculate current week max daily minutes
 */
const calcWeeklyMaxDaily = (sessions: PracticeSession[]): number => {
  const { start, end } = getCurrentWeekRange();
  
  const weeklySessions = sessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate >= start && sessionDate < end;
  });
  
  return calcMaxDailyMinutes(weeklySessions);
};

/**
 * Get yearly leaderboard with 5 categories + medal KPI
 */
export const getYearlyLeaderboard = (): YearlyLeaderboardEntry[] => {
  const students = getStudents();
  const allSessions = getPracticeSessions();
  const { start: yearStart, end: yearEnd } = getAcademicYearRange();
  
  return students.map(student => {
    // Filter sessions for this student within academic year
    const studentSessions = allSessions.filter(s => {
      if (s.studentId !== student.id) return false;
      const sessionDate = new Date(s.date);
      return sessionDate >= yearStart && sessionDate < yearEnd;
    });
    
    // Category 1: Max daily total - yearly
    const maxDailyMinutesYearly = calcMaxDailyMinutes(studentSessions);
    
    // Category 2: Longest streak - yearly
    const maxStreakYearly = calcMaxStreak(studentSessions);
    
    // Category 3: Highest weekly average between lessons - yearly
    const maxAvgBetweenLessons = calcMaxAvgBetweenLessons(student.id, studentSessions, yearStart, yearEnd);
    
    // Category 4: Max daily total - current calendar week
    const maxDailyMinutesWeekly = calcWeeklyMaxDaily(allSessions.filter(s => s.studentId === student.id));
    
    // Category 5: Rolling 7 days total (D-7 to D-1)
    const rolling7DaysTotal = calcRolling7DaysTotal(allSessions.filter(s => s.studentId === student.id));
    
    // KPI: Current medal score (copper equivalent)
    const currentMedalScore = calculateEarnedCopper(student.id);
    
    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      maxDailyMinutesYearly,
      maxStreakYearly,
      maxAvgBetweenLessons,
      maxDailyMinutesWeekly,
      rolling7DaysTotal,
      currentMedalScore,
    };
  });
};

// Medal Records
export const getMedalRecords = (): MedalRecord[] => {
  return inMemoryStorage['medalRecords'] || [];
};

export const getStudentMedalRecords = (studentId: string): MedalRecord[] => {
  const records = getMedalRecords();
  return records
    .filter(r => r.studentId === studentId)
    .sort((a, b) => new Date(b.earnedDate).getTime() - new Date(a.earnedDate).getTime());
};

export const addMedalRecord = (record: Omit<MedalRecord, 'id' | 'createdAt'>): MedalRecord => {
  const records = getMedalRecords();
  const now = new Date().toISOString();
  const newRecord: MedalRecord = {
    ...record,
    id: generateId(),
    createdAt: now,
    lastModified: now,
  };
  records.push(newRecord);
  inMemoryStorage['medalRecords'] = records;
  hybridSync.onDataChange();
  return newRecord;
};

export const updateMedalAsUsed = (medalId: string, usedForItem: string): boolean => {
  const records = getMedalRecords();
  const medalIndex = records.findIndex(m => m.id === medalId);
  
  if (medalIndex === -1) return false;
  
  records[medalIndex] = {
    ...records[medalIndex],
    used: true,
    usedDate: new Date().toISOString().split('T')[0],
    usedForItem,
    lastModified: new Date().toISOString()
  };
  
  inMemoryStorage['medalRecords'] = records;
  hybridSync.onDataChange();
  return true;
};

export const refundMedal = (medalId: string): boolean => {
  const records = getMedalRecords();
  const medalIndex = records.findIndex(m => m.id === medalId);
  
  if (medalIndex === -1 || !records[medalIndex].used) return false;
  
  records[medalIndex] = {
    ...records[medalIndex],
    used: false,
    usedDate: undefined,
    usedForItem: undefined,
    lastModified: new Date().toISOString()
  };
  
  inMemoryStorage['medalRecords'] = records;
  hybridSync.onDataChange();
  return true;
};

export const getStudentBestAchievements = (studentId: string): {
  bestDailyAverage: number;
  bestDailyMinutes: number;
  bestStreak: number;
} => {
  const achievements = getStudentMonthlyAchievements(studentId);
  
  if (achievements.length === 0) {
    return { bestDailyAverage: 0, bestDailyMinutes: 0, bestStreak: 0 };
  }
  
  return {
    bestDailyAverage: Math.max(...achievements.map(a => a.maxDailyAverage)),
    bestDailyMinutes: Math.max(...achievements.map(a => a.maxDailyMinutes)),
    bestStreak: Math.max(...achievements.map(a => a.maxStreak)),
  };
};

// Clear practice and medal data - for fresh start
export const clearPracticeAndMedalData = async (): Promise<void> => {
  logger.info('🧹 Clearing all practice sessions, monthly achievements, and medal records...');
  
  inMemoryStorage['practiceSessions'] = [];
  inMemoryStorage['monthlyAchievements'] = [];
  inMemoryStorage['medalRecords'] = [];
  
  // Only sync if we have students (otherwise it's an empty system)
  const students = getStudents();
  if (students && students.length > 0) {
    await hybridSync.onDataChange();
    logger.info('✅ Practice data cleared and synced');
  } else {
    logger.info('ℹ️ Practice data cleared (no sync - empty system)');
  }
};

// Student Statistics Cache
export const saveStudentStatistics = (studentId: string, stats: {
  intervals: any[];
  maxDaily: number;
  yearly: any[];
  weeklyAverage: number;
}) => {
  if (isDevMode()) {
    if (!devData['studentStats']) devData['studentStats'] = {};
    devData['studentStats'][studentId] = {
      ...stats,
      lastUpdated: new Date().toISOString()
    };
  } else {
    if (!inMemoryStorage['studentStats']) inMemoryStorage['studentStats'] = {};
    inMemoryStorage['studentStats'][studentId] = {
      ...stats,
      lastUpdated: new Date().toISOString()
    };
    hybridSync.onDataChange();
  }
};

export const getStudentStatistics = (studentId: string) => {
  if (isDevMode()) {
    return devData['studentStats']?.[studentId] || null;
  }
  return inMemoryStorage['studentStats']?.[studentId] || null;
};

// Tithe Paid Management
export const getTithePaid = (): Record<string, boolean> => {
  if (isDevMode()) return devData['tithePaid'] || {};
  return inMemoryStorage['tithePaid'] || {};
};

export const saveTithePaid = async (tithePaid: Record<string, boolean>): Promise<{ success: boolean; synced: boolean }> => {
  if (isDevMode()) {
    devData['tithePaid'] = tithePaid;
    return { success: true, synced: false };
  } else {
    inMemoryStorage['tithePaid'] = tithePaid;
    const result = await hybridSync.onDataChange();
    return result;
  }
};

// ==================== STORE MANAGEMENT ====================

// Store Items
export const getStoreItems = (): StoreItem[] => {
  if (isDevMode()) return devData['storeItems'] || [];
  return inMemoryStorage['storeItems'] || [];
};

export const upsertStoreItem = (item: Partial<StoreItem> & { name: string; priceCredits: number; stock: number; isActive: boolean }): StoreItem => {
  const items = getStoreItems();
  const now = new Date().toISOString();
  
  if (item.id) {
    // Update existing
    const index = items.findIndex(i => i.id === item.id);
    if (index !== -1) {
      items[index] = { ...items[index], ...item, lastModified: now };
      if (isDevMode()) {
        devData['storeItems'] = items;
      } else {
        inMemoryStorage['storeItems'] = items;
        hybridSync.onDataChange();
      }
      return items[index];
    }
  }
  
  // Create new
  const newItem: StoreItem = {
    id: generateId(),
    createdAt: now,
    lastModified: now,
    ...item
  };
  items.push(newItem);
  
  if (isDevMode()) {
    devData['storeItems'] = items;
  } else {
    inMemoryStorage['storeItems'] = items;
    hybridSync.onDataChange();
  }
  return newItem;
};

export const deleteStoreItem = async (id: string): Promise<boolean> => {
  const items = getStoreItems();
  const updatedItems = items.filter(i => i.id !== id);
  if (updatedItems.length === items.length) return false;
  
  if (isDevMode()) {
    devData['storeItems'] = updatedItems;
  } else {
    inMemoryStorage['storeItems'] = updatedItems;
    await hybridSync.onDestructiveChange();
  }
  return true;
};

// Store Purchases
export const getStorePurchases = (): StorePurchase[] => {
  if (isDevMode()) return devData['storePurchases'] || [];
  return inMemoryStorage['storePurchases'] || [];
};

export const addStorePurchase = (purchase: Omit<StorePurchase, 'id' | 'lastModified'>): StorePurchase => {
  const purchases = getStorePurchases();
  const now = new Date().toISOString();
  
  const newPurchase: StorePurchase = {
    ...purchase,
    id: generateId(),
    lastModified: now
  };
  purchases.push(newPurchase);
  
  if (isDevMode()) {
    devData['storePurchases'] = purchases;
  } else {
    inMemoryStorage['storePurchases'] = purchases;
    hybridSync.onDataChange();
  }
  return newPurchase;
};

export const getStudentPurchases = (studentId: string): StorePurchase[] => {
  return getStorePurchases().filter(p => p.studentId === studentId);
};

// ============= USED COPPER TRACKING =============

/**
 * Get total copper spent by a student (for medal-based purchases)
 */
export const getStudentUsedCopper = (studentId: string): number => {
  if (isDevMode()) {
    const usedCopper = devData['usedCopper'] || {};
    return usedCopper[studentId] || 0;
  }
  const usedCopper = inMemoryStorage['usedCopper'] || {};
  return usedCopper[studentId] || 0;
};

/**
 * Set total used copper for a student
 */
export const setStudentUsedCopper = (studentId: string, value: number): void => {
  if (isDevMode()) {
    if (!devData['usedCopper']) devData['usedCopper'] = {};
    devData['usedCopper'][studentId] = Math.max(0, value);
  } else {
    if (!inMemoryStorage['usedCopper']) inMemoryStorage['usedCopper'] = {};
    inMemoryStorage['usedCopper'][studentId] = Math.max(0, value);
    hybridSync.onDataChange();
  }
};

/**
 * Add to student's used copper
 */
export const addStudentUsedCopper = (studentId: string, amount: number): number => {
  const current = getStudentUsedCopper(studentId);
  const newValue = current + amount;
  setStudentUsedCopper(studentId, newValue);
  return newValue;
};

/**
 * Calculate available copper for a student
 * availableCopper = earnedCopperTotal - usedCopperTotal
 */
export const getAvailableCopper = (studentId: string): number => {
  const earned = calculateEarnedCopper(studentId);
  const used = getStudentUsedCopper(studentId);
  return Math.max(0, earned - used);
};

// Legacy Credits Management (kept for backward compatibility)
export const getStudentCredits = (studentId: string): number => {
  const students = getStudents();
  const student = students.find(s => s.id === studentId);
  return student?.credits || 0;
};

export const setStudentCredits = (studentId: string, value: number): boolean => {
  const students = getStudents();
  const index = students.findIndex(s => s.id === studentId);
  if (index === -1) return false;
  
  students[index] = { 
    ...students[index], 
    credits: Math.max(0, value),
    lastModified: new Date().toISOString()
  };
  
  if (isDevMode()) {
    devData['students'] = students;
  } else {
    inMemoryStorage['students'] = students;
    hybridSync.onDataChange();
  }
  return true;
};

export const addStudentCredits = (studentId: string, delta: number): number => {
  const current = getStudentCredits(studentId);
  const newValue = Math.max(0, current + delta);
  setStudentCredits(studentId, newValue);
  return newValue;
};

// ============= ATOMIC PURCHASE STORE ITEM =============

/**
 * Atomic purchase of a store item using copper-based currency
 * 
 * Flow: validate stock & active -> compute availableCopper -> 
 *       write purchase -> increment usedCopperTotal -> decrement stock -> single sync
 */
export const purchaseStoreItem = async (
  studentId: string, 
  itemId: string, 
  sessions: any[]
): Promise<{ ok: boolean; reason?: string; copperSpent?: number }> => {
  const items = getStoreItems();
  const item = items.find(i => i.id === itemId);
  
  // 1. Validate item exists
  if (!item) {
    return { ok: false, reason: 'המוצר לא נמצא' };
  }
  
  // 2. Validate item is active
  if (!item.isActive) {
    return { ok: false, reason: 'המוצר אינו זמין כרגע' };
  }
  
  // 3. Validate stock
  if (item.stock <= 0) {
    return { ok: false, reason: 'המוצר אזל מהמלאי' };
  }
  
  // 4. Compute available copper (priceCredits = copper equivalent)
  const availableCopper = getAvailableCopper(studentId);
  const priceCopper = item.priceCredits;
  
  if (availableCopper < priceCopper) {
    return { 
      ok: false, 
      reason: `אין מספיק מדליות (יש לך ${formatPriceCompact(availableCopper)}, צריך ${formatPriceCompact(priceCopper)})` 
    };
  }
  
  // 5. Check additional requirements (streak, practice minutes)
  if (item.requirements) {
    const { minStreakDays, minMinutesInLastNDays, windowDays = 7 } = item.requirements;
    
    if (minStreakDays && minStreakDays > 0) {
      const { getCurrentStreak } = await import('./medalEngine');
      const streak = getCurrentStreak(studentId);
      if (streak < minStreakDays) {
        return { ok: false, reason: `נדרש רצף של ${minStreakDays} ימים (יש לך ${streak})` };
      }
    }
    
    if (minMinutesInLastNDays && minMinutesInLastNDays > 0) {
      const now = new Date();
      const windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() - windowDays);
      
      const minutesInWindow = sessions
        .filter((s: any) => {
          const sessionDate = new Date(s.date);
          return sessionDate >= windowStart && sessionDate <= now;
        })
        .reduce((sum: number, s: any) => sum + s.durationMinutes, 0);
      
      if (minutesInWindow < minMinutesInLastNDays) {
        return { ok: false, reason: `נדרשות ${minMinutesInLastNDays} דקות אימון ב-${windowDays} ימים אחרונים (יש לך ${minutesInWindow})` };
      }
    }
  }
  
  // ===== ALL CHECKS PASSED - ATOMIC PURCHASE =====
  const now = new Date().toISOString();
  
  // 6. Create purchase record
  const purchases = getStorePurchases();
  const newPurchase: StorePurchase = {
    id: generateId(),
    studentId,
    itemId,
    purchasedAt: now,
    priceCreditsAtPurchase: priceCopper,
    lastModified: now
  };
  purchases.push(newPurchase);
  
  // 7. Increment usedCopper
  const newUsedCopper = getStudentUsedCopper(studentId) + priceCopper;
  
  // 8. Decrement stock
  const itemIndex = items.findIndex(i => i.id === itemId);
  items[itemIndex] = { 
    ...items[itemIndex], 
    stock: items[itemIndex].stock - 1, 
    lastModified: now 
  };
  
  // 9. Persist all changes atomically (single sync)
  if (isDevMode()) {
    devData['storePurchases'] = purchases;
    devData['storeItems'] = items;
    if (!devData['usedCopper']) devData['usedCopper'] = {};
    devData['usedCopper'][studentId] = newUsedCopper;
  } else {
    inMemoryStorage['storePurchases'] = purchases;
    inMemoryStorage['storeItems'] = items;
    if (!inMemoryStorage['usedCopper']) inMemoryStorage['usedCopper'] = {};
    inMemoryStorage['usedCopper'][studentId] = newUsedCopper;
    // Single sync call for all changes
    hybridSync.onDataChange();
  }
  
  return { ok: true, copperSpent: priceCopper };
};

// ==================== PER-LESSON PAYMENT HELPERS ====================

// Get count of completed lessons for a student
export const getCompletedLessonsCount = (studentId: string): number => {
  return getCompletedLessonsForStudent(studentId).length;
};

// Update paid lessons count for a student
export const updatePaidLessonsCount = (studentId: string, count: number): Student | undefined => {
  return updateStudent(studentId, { paidLessonsCount: count });
};
