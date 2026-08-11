import { hybridSync } from './hybridSync';
import { exportAllData, isDevMode } from './storage';
import { workerApi } from './workerApi';
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
    calculatedAmount: student?.calculatedAmount,
    monthlyAmount: student?.monthlyAmount,
    paymentMonths: student?.paymentMonths,
    paymentType: student?.paymentType,
    paymentStatus: student?.paymentStatus,
    paymentMethod: student?.paymentMethod,
    startingLessonNumber: student?.startingLessonNumber,
    startDate: student?.startDate,
    endDate: student?.endDate,
  }));
};

const financialProjection = (data: Record<string, any>): Record<string, any> => ({
  students: studentFinancialProjection(data?.musicSystem_students),
  payments: data?.musicSystem_payments || [],
  oneTimePayments: data?.oneTimePayments || [],
  perLessonPayments: data?.musicSystem_perLessonPayments || [],
  perLessonLedger: data?.musicSystem_perLessonLedger || [],
  performances: data?.musicSystem_performances || [],
  schoolYearRecords: data?.musicSystem_schoolYearRecords || [],
});

const fingerprintProjection = (data: Record<string, any>): string =>
  JSON.stringify(canonicalize(financialProjection(data)));

const currentSnapshot = (): Record<string, any> => exportAllData(true);
const currentFingerprint = (): string => fingerprintProjection(currentSnapshot());

const emitWarning = (message: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WARNING_EVENT, { detail: { message } }));
};

const remoteMatchesFinancialProjection = async (expectedSnapshot: Record<string, any>): Promise<boolean> => {
  const expected = fingerprintProjection(expectedSnapshot);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (isLocalJsonDraftActive()) return false;
    const response: any = await workerApi.downloadLatest();
    if (response?.success && response.data && fingerprintProjection(response.data) === expected) {
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

      // Repair with one exact full-snapshot upload, then verify again. This is
      // intentionally a background safety net and does not add confirmation
      // dialogs or extra clicks to ordinary payment work.
      const repairResult = await hybridSync.restoreData(snapshot, { uploadImmediately: true });
      if (!repairResult.success || !repairResult.synced) {
        pendingFingerprint = snapshotFingerprint;
        emitWarning('שינוי כספי נשמר מקומית אך שמירתו ב-Dropbox לא אומתה. המערכת תנסה שוב אוטומטית.');
        return;
      }

      if (!(await remoteMatchesFinancialProjection(snapshot))) {
        pendingFingerprint = snapshotFingerprint;
        emitWarning('שינוי כספי הועלה אך לא הצלחנו לאמת שהעותק האחרון ב-Dropbox תואם. המערכת תנסה שוב אוטומטית.');
        return;
      }
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
