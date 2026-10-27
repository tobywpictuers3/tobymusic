import { hybridSync } from './hybridSync';
import { exportAllData, isDevMode } from './storage';
import { downloadCanonicalDropboxLatest } from './canonicalDropboxRead';
import { isLocalJsonDraftActive } from './localJsonDraft';

const WARNING_EVENT = 'toby:financial-durability-warning';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const PATCH_FLAG = '__tobyFinancialDurabilityInstalled';

let lastObservedFingerprint = '';
let pendingFingerprint: string | null = null;
let verificationRunning = false;
let originals: { onDataChange: any; onDestructiveChange: any } | null = null;

const canonicalize = (value: any): any => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, any>>((out, key) => {
      out[key] = canonicalize(value[key]);
      return out;
    }, {});
};

const studentFinancialProjection = (students: any): any[] => {
  if (!Array.isArray(students)) return [];
  return students.map(student => ({
    id: student?.id,
    annualAmount: student?.annualAmount,
    annualDiscountEnabled: student?.annualDiscountEnabled,
    annualDiscountPercent: student?.annualDiscountPercent,
    annualRateManuallyOverridden: student?.annualRateManuallyOverridden,
    lessonRateManuallyOverridden: student?.lessonRateManuallyOverridden,
    calculatedAmount: student?.calculatedAmount,
    monthlyAmount: student?.monthlyAmount,
    paymentMonths: student?.paymentMonths,
    paymentType: student?.paymentType,
    paymentStatus: student?.paymentStatus,
    paymentMethod: student?.paymentMethod,
    lessonPrice: student?.lessonPrice,
    startingLessonNumber: student?.startingLessonNumber,
    startDate: student?.startDate,
    endDate: student?.endDate,
  }));
};

const financialProjection = (data: Record<string, any>): Record<string, any> => ({
  students: studentFinancialProjection(data?.musicSystem_students),
  tuitionSettings: data?.musicSystem_tuitionSettings || null,
  payments: data?.musicSystem_payments || [],
  oneTimePayments: data?.oneTimePayments || [],
  perLessonPayments: data?.musicSystem_perLessonPayments || [],
  perLessonLedger: data?.musicSystem_perLessonLedger || [],
  performances: data?.musicSystem_performances || [],
  schoolYearRecords: data?.musicSystem_schoolYearRecords || [],
  priorYearBalances: data?.musicSystem_priorYearBalances || [],
});

const fingerprintProjection = (data: Record<string, any>): string =>
  JSON.stringify(canonicalize(financialProjection(data)));

const currentSnapshot = (): Record<string, any> => exportAllData(true);
const currentFingerprint = (): string => fingerprintProjection(currentSnapshot());
const hasNonEmptyStudentSet = (snapshot: Record<string, any>): boolean =>
  Array.isArray(snapshot?.musicSystem_students) && snapshot.musicSystem_students.length > 0;

const emitWarning = (message: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WARNING_EVENT, { detail: { message } }));
};

const remoteMatchesFinancialProjection = async (expectedSnapshot: Record<string, any>): Promise<boolean> => {
  const expected = fingerprintProjection(expectedSnapshot);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (isLocalJsonDraftActive()) return false;
    // Critical financial verification must never accept a historical fallback
    // as if it were the current canonical Dropbox latest object.
    const response = await downloadCanonicalDropboxLatest();
    if (response.success && response.data && fingerprintProjection(response.data) === expected) {
      return true;
    }
    await delay(450 * (attempt + 1));
  }
  return false;
};

const queueVerification = (fingerprint?: string) => {
  if (isDevMode() || isLocalJsonDraftActive()) return;
  pendingFingerprint = fingerprint || currentFingerprint();
  if (verificationRunning) return;
  void runVerificationLoop();
};

const runVerificationLoop = async () => {
  if (verificationRunning) return;
  verificationRunning = true;

  try {
    while (pendingFingerprint) {
      if (isDevMode() || isLocalJsonDraftActive()) return;
      if (!hybridSync.getSyncState().isOnline) return;

      const targetFingerprint = pendingFingerprint;
      pendingFingerprint = null;

      // Give the normal fast save path a moment to finish first. The user UI
      // remains responsive; this layer only verifies/repairs in the background.
      for (let attempt = 0; attempt < 50 && hybridSync.getSyncState().isSyncing; attempt += 1) {
        await delay(120);
      }

      if (isLocalJsonDraftActive()) return;

      const snapshot = currentSnapshot();
      const snapshotFingerprint = fingerprintProjection(snapshot);

      // If more financial edits arrived while waiting, verify the newest state.
      if (snapshotFingerprint !== targetFingerprint) {
        pendingFingerprint = snapshotFingerprint;
        continue;
      }

      if (await remoteMatchesFinancialProjection(snapshot)) continue;
      if (isLocalJsonDraftActive()) return;

      // Never allow a background safety net to turn a transient empty/failed
      // hydration state into a destructive full-database repair upload.
      if (!hasNonEmptyStudentSet(snapshot)) {
        pendingFingerprint = snapshotFingerprint;
        emitWarning('האימות הכספי נעצר כי מצב התלמידות המקומי אינו תקין. לא בוצעה העלאת תיקון ל-Dropbox.');
        return;
      }

      // Cutover safety: this layer verifies only. A failed verification must not
      // bypass the canonical sync gateway by uploading a full database snapshot.
      pendingFingerprint = snapshotFingerprint;
      emitWarning('שינוי כספי נשמר מקומית אך העותק האחרון ב-Dropbox עדיין לא אומת. לא בוצעה העלאת תיקון עוקפת; יש להשאיר את המערכת פתוחה עד שהסנכרון הרגיל יושלם.');
      return;
    }
  } catch {
    if (!isLocalJsonDraftActive()) {
      pendingFingerprint = currentFingerprint();
      emitWarning('אימות השמירה הכספית נכשל זמנית. הנתונים המקומיים נשמרו והמערכת תנסה שוב אוטומטית.');
    }
  } finally {
    verificationRunning = false;
  }
};

export const installFinancialDurabilityGuard = (): void => {
  const manager = hybridSync as any;
  if (manager[PATCH_FLAG]) return;

  originals = {
    onDataChange: manager.onDataChange,
    onDestructiveChange: manager.onDestructiveChange,
  };

  lastObservedFingerprint = currentFingerprint();

  const wrap = (method: 'onDataChange' | 'onDestructiveChange') => {
    manager[method] = async function(...args: any[]) {
      const fingerprintBeforeSave = isDevMode() || isLocalJsonDraftActive()
        ? lastObservedFingerprint
        : currentFingerprint();
      const financialChanged = fingerprintBeforeSave !== lastObservedFingerprint;

      if (financialChanged) {
        lastObservedFingerprint = fingerprintBeforeSave;
      }

      const result = await originals![method].apply(this, args);

      if (financialChanged && result?.success) {
        queueVerification(fingerprintBeforeSave);
      }

      return result;
    };
  };

  wrap('onDataChange');
  wrap('onDestructiveChange');
  manager[PATCH_FLAG] = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (pendingFingerprint && !isLocalJsonDraftActive()) queueVerification(pendingFingerprint);
    });
  }
};

export const subscribeFinancialDurabilityWarnings = (
  callback: (message: string) => void,
): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ message?: string }>).detail;
    callback(detail?.message || 'שמירת נתון כספי לא אומתה.');
  };

  window.addEventListener(WARNING_EVENT, handler);
  return () => window.removeEventListener(WARNING_EVENT, handler);
};
