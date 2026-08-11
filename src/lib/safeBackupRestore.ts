import { getDevStore, isDevMode } from './storage';
import { beginLocalJsonDraftSession } from './localJsonDraft';

export type SafeBackupImportResult = {
  success: boolean;
  synced: boolean;
  reloadRequired: boolean;
  message: string;
};

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

  // Explicit local restore is a replacement operation. Auth/session values are
  // outside this application-data object and therefore are never touched.
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
        message: 'הגיבוי נטען למצב הבדיקה בלבד. אין קריאה או כתיבה ל-Dropbox.',
      };
    }

    const draftResult = await beginLocalJsonDraftSession();
    if (!draftResult.success) {
      return {
        success: false,
        synced: false,
        reloadRequired: false,
        message: draftResult.message,
      };
    }

    // From this point all automatic Dropbox writes and full merges are paused.
    // The imported data may be inspected/edited freely until the global Save
    // button explicitly commits and verifies the current full snapshot.
    replaceActiveStore(data);
    window.dispatchEvent(new CustomEvent('toby:storage-imported'));

    return {
      success: true,
      synced: false,
      reloadRequired: false,
      message: 'ה-JSON נטען מקומית. הסנכרון ל-Dropbox מושהה עד לחיצה על שמור שינויים.',
    };
  } catch {
    return {
      success: false,
      synced: false,
      reloadRequired: false,
      message: 'שגיאה בקריאת קובץ הגיבוי. לא בוצע שינוי.',
    };
  }
};
