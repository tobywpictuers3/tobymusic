import { hybridSync } from './hybridSync';
import { exportAllData, getDevStore, isDevMode } from './storage';
import { workerApi } from './workerApi';

export type SafeBackupImportResult = {
  success: boolean;
  synced: boolean;
  reloadRequired: boolean;
  message: string;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isSystemDataKey = (key: string): boolean => key.startsWith('musicSystem_') || key === 'oneTimePayments';

const storageKeyForDataKey = (key: string): string => {
  return key === 'oneTimePayments' ? key : key.replace(/^musicSystem_/, '');
};

const deepClone = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const getActiveStore = (): Record<string, any> => {
  if (isDevMode()) return getDevStore();

  const store = typeof window !== 'undefined'
    ? (window as any).__musicSystemStorage
    : null;

  if (!store || typeof store !== 'object') {
    throw new Error('ACTIVE_STORAGE_UNAVAILABLE');
  }

  return store;
};

const validateBackup = (data: any): string | null => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'מבנה קובץ הגיבוי אינו תקין';
  }

  const systemKeys = Object.keys(data).filter(isSystemDataKey);
  if (systemKeys.length === 0) {
    return 'קובץ הגיבוי אינו מכיל נתוני מערכת';
  }

  if (!Array.isArray(data.musicSystem_students)) {
    return 'קובץ הגיבוי חסר רשימת תלמידות תקינה';
  }

  return null;
};

const replaceActiveStore = (data: Record<string, any>): void => {
  const store = getActiveStore();

  // Explicit restore is a replacement operation. Auth/session values are not
  // stored in this application-data object and therefore are not touched.
  Object.keys(store).forEach(key => {
    delete store[key];
  });

  Object.entries(data).forEach(([dataKey, value]) => {
    if (!isSystemDataKey(dataKey)) return;
    store[storageKeyForDataKey(dataKey)] = deepClone(value);
  });

  // Backward-compatible defaults for older backups.
  if (!store.__tombstones || typeof store.__tombstones !== 'object') store.__tombstones = {};
  if (!Array.isArray(store.swapRequests)) store.swapRequests = [];
  if (!store.tithePaid || typeof store.tithePaid !== 'object' || Array.isArray(store.tithePaid)) store.tithePaid = {};
  if (!Array.isArray(store.titheHistory)) store.titheHistory = [];
  if (!store.studentStats || typeof store.studentStats !== 'object' || Array.isArray(store.studentStats)) store.studentStats = {};
};

const waitUntilSyncIdle = async (timeoutMs = 15_000): Promise<boolean> => {
  const startedAt = Date.now();
  while (hybridSync.getSyncState().isSyncing) {
    if (Date.now() - startedAt > timeoutMs) return false;
    await delay(120);
  }
  return true;
};

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

const appDataMatches = (expected: Record<string, any>, actual: Record<string, any>): boolean => {
  const expectedKeys = Object.keys(expected)
    .filter(key => key !== 'timestamp' && isSystemDataKey(key))
    .sort();

  return expectedKeys.every(key => {
    return JSON.stringify(canonicalize(expected[key])) === JSON.stringify(canonicalize(actual?.[key]));
  });
};

const verifyLatestSnapshot = async (expected: Record<string, any>): Promise<boolean> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response: any = await workerApi.downloadLatest();
    if (response?.success && response.data && appDataMatches(expected, response.data)) {
      return true;
    }
    await delay(500 * (attempt + 1));
  }
  return false;
};

export const importBackupSafely = async (file: File): Promise<SafeBackupImportResult> => {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const validationError = validateBackup(data);

    if (validationError) {
      return { success: false, synced: false, reloadRequired: false, message: validationError };
    }

    if (isDevMode()) {
      replaceActiveStore(data);
      window.dispatchEvent(new CustomEvent('toby:storage-imported'));
      return {
        success: true,
        synced: false,
        reloadRequired: false,
        message: 'הגיבוי נטען למצב הבדיקה בלבד. לא בוצעה כתיבה ל-Dropbox.',
      };
    }

    const idle = await waitUntilSyncIdle();
    if (!idle) {
      return {
        success: false,
        synced: false,
        reloadRequired: false,
        message: 'לא ניתן לייבא כרגע כי סנכרון קודם עדיין פעיל. נסי שוב בעוד כמה שניות.',
      };
    }

    // Quiesce only the heavy download+merge path during this explicit restore.
    // Direct uploads remain available so the imported snapshot can be saved.
    const manager = hybridSync as any;
    const originalFullSync = manager.syncToWorker;
    manager.syncToWorker = async () => true;

    try {
      replaceActiveStore(data);
      const exactSnapshot = exportAllData(true);
      const restoreResult = await hybridSync.restoreData(exactSnapshot, { uploadImmediately: true });

      if (!restoreResult.success) {
        return {
          success: false,
          synced: false,
          reloadRequired: false,
          message: 'הגיבוי נטען לזיכרון אך העלאתו ל-Dropbox נכשלה. לא בוצע רענון.',
        };
      }

      const verified = await verifyLatestSnapshot(exactSnapshot);
      if (!verified) {
        return {
          success: false,
          synced: false,
          reloadRequired: false,
          message: 'הגיבוי נטען מקומית אך לא הצלחנו לאמת שהעותק המלא נשמר ב-Dropbox. לא בוצע רענון.',
        };
      }

      return {
        success: true,
        synced: true,
        reloadRequired: true,
        message: 'הגיבוי יובא, נשמר ואומת מול העותק האחרון ב-Dropbox.',
      };
    } finally {
      manager.syncToWorker = originalFullSync;
    }
  } catch {
    return {
      success: false,
      synced: false,
      reloadRequired: false,
      message: 'שגיאה בקריאת קובץ הגיבוי. לא בוצע שינוי מאומת.',
    };
  }
};
