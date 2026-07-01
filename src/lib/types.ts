// Data Models for Music Students Management System - Updated

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  additionalPhones?: string[]; // Additional phone numbers
  additionalEmails?: string[]; // Additional email addresses
  personalCode: string; // 4-digit personal code
  swapCode: string; // 4-digit swap code for automatic swap approvals (required)
  startDate: string; // ISO date string (default: September 1st)
  endDate?: string; // Optional end date - when student stops lessons
  isActive?: boolean; // true=active (default), false=left
  leftDate?: string; // ISO date - when student left
  leftReason?: string; // Optional: why student left
  startingLessonNumber: number; // Starting lesson number (default: 1)
  annualAmount: number; // Annual payment amount
  paymentMonths: number; // Number of payment months (default: 12)
  calculatedAmount?: number; // Proportional amount when starting mid-year (overrides annualAmount for payment calculation)
  monthlyAmount: number; // Calculated: (calculatedAmount || annualAmount) / paymentMonths
  notes?: string;
  credits?: number; // Store credits for purchasing items (default: 0)
  lastModified?: string; // Optimistic locking timestamp
  // Per-lesson payment fields
  paymentType?: 'annual' | 'per_lesson'; // Payment track (default: 'annual')
  lessonPrice?: number; // Price per lesson (for per_lesson type)
  paidLessonsCount?: number; // Number of lessons paid for (for per_lesson type)
  perLessonBalance?: number; // Balance in NIS (positive = credit, negative = debt)
}

export interface Lesson {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD format
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
  isOneOff?: boolean; // for makeup lessons or special sessions
  lockedNumber?: number; // locked lesson number that won't change
  isFromTemplate?: boolean; // indicates lesson was generated from active template
  grade?: number; // lesson grade 1-5 (homework grade)
  gradeNotes?: string; // optional text notes for the grade
  isSwapped?: boolean; // indicates this lesson was swapped with another student
  lastModified?: string; // Optimistic locking timestamp
}

export interface Payment {
  id: string;
  studentId: string;
  month: string; // YYYY-MM format
  amount: number;
  status: 'not_paid' | 'pending' | 'paid' | 'debt';
  paymentMethod: 'bank' | 'check' | 'cash' | 'inactive';
  notes?: string;
  paidDate?: string;
  lastModified?: string; // Optimistic locking timestamp
}

export interface OneTimePayment {
  id: string;
  month: string; // YYYY-MM format
  amount: number;
  description: string;
  paidDate: string;
}

// Per-lesson payment record
export interface PerLessonPayment {
  id: string;
  studentId: string;
  amount: number; // Amount paid in NIS
  lessonsCount: number; // How many lessons this covers (calculated)
  paymentDate: string; // Date of payment (YYYY-MM-DD)
  month: string; // YYYY-MM format for monthly reporting
  notes?: string;
}

export interface PerLessonLedgerRow {
  id: string;
  rowType: 'lesson' | 'credit';
  lessonId?: string;
  lessonDate?: string;
  amountDue: number;
  amountPaid: number;
  paymentDates: string[];
  balance: number; // positive = credit, negative = debt
  runningBalance: number; // cumulative balance after this row
}

export interface PerLessonLedger {
  lessonPrice: number;
  completedLessonsCount: number;
  totalDue: number;
  totalPaid: number;
  totalBalance: number; // positive = credit, negative = debt
  rows: PerLessonLedgerRow[];
}

export interface PerformancePayment {
  id: string;
  date: string;     // YYYY-MM-DD - actual date money received
  amount: number;   // Income amount in NIS — EXCLUDES travel. Source of truth for income/tithe.
  travel?: number;  // Travel reimbursement received in this payment (info only — NEVER counted as income)
  method?: 'bank' | 'check' | 'cash';
  notes?: string;
}

export interface Performance {
  id: string;
  name: string;
  client?: string;
  clientEmail?: string;
  clientPhone?: string;
  date: string; // YYYY-MM-DD format
  timeEstimate?: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | string; // can be specific time HH:MM or general
  orderContent?: string;
  amount?: number;
  travel?: number;
  invoiceNumber?: string;
  receiptNumber?: string;
  /** @deprecated kept for backward compatibility — actual status is derived from performancePayments[] */
  paymentStatus: 'not_paid' | 'bank' | 'check' | 'cash';
  /** @deprecated kept for backward compatibility — actual payment dates live in performancePayments[] */
  paidDate?: string; // YYYY-MM-DD format
  /** Source of truth for income & status. Each entry counts in its own date/month/year. */
  performancePayments?: PerformancePayment[];
  notes?: string;
  status: 'open' | 'closed'; // open = not finalized, closed = finalized
  createdAt: string;
  lastModified?: string; // Optimistic locking timestamp
}

export interface SwapRequest {
  id: string;
  requesterId: string;
  targetId: string;
  date: string;
  time: string;
  targetDate?: string; // New field for target lesson date
  targetTime?: string; // New field for target lesson time
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  lastModified?: string; // Optimistic locking timestamp
}

/**
 * NEW (for StudentFiles): file kind + handwrite template
 */
export type StudentFileKind = 'upload' | 'handwrite' | 'link';
export type HandwriteTemplate = 'blank' | 'lines' | 'staff';

export interface FileEntry {
  id: string;
  studentId: string;

  // Display
  name: string;
  description?: string; // optional description/explanation for the file

  // Where to open the file (worker serve_attachment or external URL)
  webViewLink: string;

  // When created/uploaded
  uploadDate: string;

  // NEW: what kind of file this is
  kind?: StudentFileKind;

  // NEW: Dropbox path (for delete/replace) for uploaded/handwrite files
  dropboxPath?: string;

  // NEW: file info (optional)
  mimeType?: string;
  size?: number;

  // NEW: for handwrite pages
  template?: HandwriteTemplate;

  lastModified?: string; // Optimistic locking timestamp
}

export interface IntegrationSettings {
  apiBaseUrl: string;
  apiSecret: string;
  syncEnabled: boolean;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  effectiveDate: string; // ISO date string - when this template becomes active
  isActive: boolean;
  schedule: WeeklyScheduleData;
  createdAt: string;
  activatedAt?: string; // When this template was activated
  deactivatedAt?: string; // When this template was deactivated
  lastModified?: string; // Optimistic locking timestamp
}

export interface WeeklyScheduleData {
  [dayOfWeek: string]: { // '0'-'6' for Sunday-Saturday
    [timeSlot: string]: { // 'HH:MM' format
      studentId: string;
      studentName?: string; // cached for display
      duration: 30; // always 30 minutes
    };
  };
}

export interface StudentSchedule {
  studentId: string;
  dayOfWeek: number; // 0-6
  timeSlot: string; // HH:MM
  duration: 30; // always 30 minutes
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD format
  description?: string;
  createdAt: string;
  lastModified?: string; // Optimistic locking timestamp
}

export interface PracticeSession {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD format
  startTime?: string; // HH:MM - optional for manual entry
  endTime?: string; // HH:MM - optional for manual entry
  durationMinutes: number; // total minutes
  createdAt: string;
  lastModified?: string; // Optimistic locking timestamp
}

export interface MedalRecord {
  id: string;
  studentId: string;
  medalType: 'duration' | 'streak';
  level: 'bronze' | 'silver' | 'gold' | 'platinum' | 'streak3' | 'streak6' | 'streak14' | 'streak21';
  durationMinutes?: number;
  streakDays?: number;
  earnedDate: string; // YYYY-MM-DD
  createdAt: string;
  used?: boolean; // whether medal was used for store purchase
  usedDate?: string; // when medal was used
  usedForItem?: string; // what item was purchased
  lastModified?: string; // Optimistic locking timestamp
}

export interface MonthlyAchievement {
  id: string;
  studentId: string;
  month: string; // YYYY-MM
  maxDailyAverage: number;
  maxDailyMinutes: number;
  maxStreak: number;
  createdAt: string;
  updatedAt: string;
  lastModified?: string; // Optimistic locking timestamp
}

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  // Legacy fields (kept for backward compatibility)
  dailyAverage: number;
  maxDailyMinutes: number;
  maxStreak: number;
}

// NEW: Yearly leaderboard with 5 categories + medal KPI
export interface YearlyLeaderboardEntry {
  studentId: string;
  studentName: string;
  // Category 1: Max daily total - yearly
  maxDailyMinutesYearly: number;
  // Category 2: Longest streak - yearly
  maxStreakYearly: number;
  // Category 3: Highest weekly average between lessons - yearly
  maxAvgBetweenLessons: number;
  // Category 4: Max daily total - current calendar week (Sat-Sat)
  maxDailyMinutesWeekly: number;
  // Category 5: Rolling 7 days (D-7 to D-1)
  rolling7DaysTotal: number;
  // KPI: Current medal score (copper equivalent)
  currentMedalScore: number;
}

export interface Attachment {
  url: string;        // Public URL from Worker
  path: string;       // Path for deletion
  name: string;       // Original filename
  size: number;       // File size in bytes
  type?: string;      // MIME type
}

export interface Message {
  id: string;
  senderId: string; // 'admin' or student ID
  senderName: string;
  recipientIds: string[]; // 'all', 'admin', or specific student IDs
  subject: string;
  content: string;
  contentHtml?: string; // HTML version for rich text
  attachments?: Attachment[]; // File attachments
  createdAt: string;
  expiresAt?: string; // optional expiration date
  scheduledFor?: string; // scheduled send time
  isRead?: { [studentId: string]: boolean }; // track read status per recipient
  starred?: { [studentId: string]: boolean }; // starred status per user
  starExpiresAt?: { [studentId: string]: string }; // star expiration per user
  isDeleted?: { [studentId: string]: boolean }; // track deleted status per recipient
  isDraft?: boolean; // draft status
  inReplyTo?: string; // ID of message being replied to
  type: 'general' | 'swap_request' | 'swap_approval' | 'swap_rejection' | 'swap_notice';
  messageType?: 'broadcast' | 'group' | 'direct-teacher' | 'direct-student';
  reactions?: { [userId: string]: string }; // emoji reactions per user
  // Gmail sync fields
  gmailMessageId?: string; // Gmail message ID for bidirectional sync
  threadId?: string; // Gmail thread ID
  metadata?: {
    swapRequestId?: string;
    action?: 'approve_or_reject';
    [key: string]: any;
  };
  // Email bridge fields
  emailSent?: boolean;            // was this sent via email?
  emailSentAt?: string;           // ISO timestamp of email send
  emailSource?: 'lovable' | 'email'; // origin of message
  pendingApproval?: boolean;      // student→all: waiting for Toby OK
  approvalRequestedAt?: string;   // when approval was requested
  approvedAt?: string;            // when Toby approved
}

// Store Item for the medal store
export interface StoreItem {
  id: string;
  name: string;
  description?: string;
  priceCredits: number;
  stock: number;
  imageUrl?: string;
  imagePath?: string;
  createdAt: string;
  isActive: boolean;
  requirements?: {
    minStreakDays?: number;
    minMinutesInLastNDays?: number;
    windowDays?: number; // default 7
  };
  lastModified?: string;
}

// Store Purchase record
export interface StorePurchase {
  id: string;
  studentId: string;
  itemId: string;
  purchasedAt: string;
  priceCreditsAtPurchase: number;
  lastModified?: string;
}
