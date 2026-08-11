import { hybridSync } from './hybridSync';
import { exportAllData, getDevStore, isDevMode } from './storage';
import { workerApi } from './workerApi';

export type TitheHistoryEvent = {
  id: string;
  monthKey: string;
  paid: boolean;
  updatedAt: string;
};

const HISTORY_STORAGE_KEY = 'titheHistory';
const HISTORY_DATA_KEY = 'musicSystem_titheHistory';
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PATCH_FLAG = '__tobyTitheHistoryMergeGuardInstalled';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let titheWriteTail: Promise<void> = Promise.resolve();

const runSerialized = async <T,>(task: () => Promise<T>): Promise<T> => {
  const previous = titheWriteTail;
  let release!: () => void;
  titheWriteTail = new Promise<void>(resolve => {
    release = resolve;
  });

  await previous;
  try {
    return await task();
  } finally {
    release();
  }
};

const waitUntilSyncIdle = async (timeoutMs = 15_000): Promise<boolean> => {
  const startedAt = Date.now();
  while (hybridSync.getSyncState().isSyncing) {
    if (Date.now() - startedAt > timeoutMs) return false;
    await delay(120);
  }
  return true;
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

const normalizeEvents = (value: unknown): TitheHistoryEvent[] => {
  if (!Array.isArray(value)) return [];

  return value.filter((event): event is TitheHistoryEvent => {
    return !!event
      && typeof event === 'object'
      && typeof event.id === 'string'
      && typeof event.monthKey === 'string'
      && MONTH_KEY_RE.test(event.monthKey)
      && typeof event.paid === 'boolean'
      && typeof event.updatedAt === 'string'
      && !Number.isNaN(new Date(event.updatedAt).getTime());
  });
};

const mergeHistory = (left: unknown, right: unknown): TitheHistoryEvent[] => {
  const byId = new Map<string, TitheHistoryEvent>();

  [...normalizeEvents(left), ...normalizeEvents(right)].forEach(event => {
    const existing = byId.get(event.id);
    if (!existing) {
      byId.set(event.id, event);
      return;
    }

    const existingTime = new Date(existing.updatedAt).getTime();
    const eventTime = new Date(event.updatedAt).getTime();
    if (eventTime > existingTime || (eventTime === existingTime && event.id > existing.id)) {
      byId.set(event.id, event);
    }
  });

  return Array.from(byId.values()).sort((a, b) => {
    const timeDiff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
  });
};

export const installTitheHistoryMergeGuard = (): void => {
  const manager = hybridSync as any;
  if (manager[PATCH_FLAG]) return;

  const originalMerge = manager.mergeDataWithConflictResolution;
  if (typeof originalMerge !== 'function') return;

  manager.mergeDataWithConflictResolution = function(localData: any, remoteData: any) {
    const merged = originalMerge.call(this, localData, remoteData);
    const history = mergeHistory(localData?.[HISTORY_DATA_KEY], remoteData?.[HISTORY_DATA_KEY]);

    if (history.length > 0 || HISTORY_DATA_KEY in (localData || {}) || HISTORY_DATA_KEY in (remoteData || {})) {
      merged[HISTORY_DATA_KEY] = history;
    }

    return merged;
  };

  manager[PATCH_FLAG] = true;
};

const derivePaidMap = (store: Record<string, any>): Record<string, boolean> => {
  const baseline = store.tithePaid && typeof store.tithePaid === 'object' && !Array.isArray(store.tithePaid)
    ? { ...store.tithePaid }
    : {};

  const ordered = mergeHistory(store[HISTORY_STORAGE_KEY], []);
  ordered.forEach(event => {
    baseline[event.monthKey] = event.paid;
  });

  return baseline;
};

export const hydrateTithePaidFromHistory = (): Record<string, boolean> => {
  const store = getActiveStore();
  const derived = derivePaidMap(store);
  store.tithePaid = derived;
  if (!Array.isArray(store[HISTORY_STORAGE_KEY])) store[HISTORY_STORAGE_KEY] = [];
  return derived;
};

const createEventId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tithe-${crypto.randomUUID()}`;
  }
  return `tithe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const remoteContainsEvent = async (eventId: string): Promise<boolean> => {
  const response: any = await workerApi.downloadLatest();
  if (!response?.success || !response.data) return false;
  return normalizeEvents(response.data[HISTORY_DATA_KEY]).some(event => event.id === eventId);
};

const persistNormalModeTithe = async (
  monthKey: string,
  paid: boolean,
): Promise<{ success: boolean; synced: boolean; message: string }> => {
  const idle = await waitUntilSyncIdle();
  if (!idle) {
    return {
      success: false,
      synced: false,
      message: 'סנכרון קודם עדיין פעיל ולכן שמירת המעשר לא אומתה. נסי שוב בעוד כמה שניות.',
    };
  }

  // No full download+merge may start between creating the event and its
  // Dropbox read-back verification. This closes the race where an older full
  // sync captured state before the event and could apply that stale snapshot
  // after the new event had already been verified.
  const manager = hybridSync as any;
  const originalFullSync = manager.syncToWorker;
  manager.syncToWorker = async () => true;

  try {
    const store = getActiveStore();
    const current = derivePaidMap(store);
    const event: TitheHistoryEvent = {
      id: createEventId(),
      monthKey,
      paid,
      updatedAt: new Date().toISOString(),
    };

    current[monthKey] = paid;
    store.tithePaid = current;
    store[HISTORY_STORAGE_KEY] = mergeHistory(store[HISTORY_STORAGE_KEY], [event]);

    const snapshot = exportAllData(true);
    const firstWrite = await hybridSync.restoreData(snapshot, { uploadImmediately: true });
    if (!firstWrite.success) {
      return {
        success: true,
        synced: false,
        message: 'הסימון נשמר מקומית אך העלאתו ל-Dropbox נכשלה',
      };
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (await remoteContainsEvent(event.id)) {
        return { success: true, synced: true, message: 'המעשר נשמר ואומת בדרופבוקס' };
      }

      // Retry the exact current snapshot through the direct-upload path only.
      // A full merge intentionally remains quiesced until verification ends.
      if (attempt === 1) {
        await hybridSync.restoreData(exportAllData(true), { uploadImmediately: true });
      }

      await delay(600 * (attempt + 1));
    }

    return {
      success: true,
      synced: false,
      message: 'הסימון נשמר מקומית אך לא אומת בדרופבוקס',
    };
  } catch {
    return {
      success: true,
      synced: false,
      message: 'הסימון נשמר מקומית אך שמירת הענן נכשלה',
    };
  } finally {
    manager.syncToWorker = originalFullSync;
  }
};

export const persistTitheMonthDurably = async (
  monthKey: string,
  paid: boolean,
): Promise<{ success: boolean; synced: boolean; message: string }> => {
  if (!MONTH_KEY_RE.test(monthKey)) {
    return { success: false, synced: false, message: 'מפתח חודש לא תקין' };
  }

  installTitheHistoryMergeGuard();

  if (isDevMode()) {
    const store = getActiveStore();
    const current = derivePaidMap(store);
    const event: TitheHistoryEvent = {
      id: createEventId(),
      monthKey,
      paid,
      updatedAt: new Date().toISOString(),
    };

    current[monthKey] = paid;
    store.tithePaid = current;
    store[HISTORY_STORAGE_KEY] = mergeHistory(store[HISTORY_STORAGE_KEY], [event]);
    return { success: true, synced: false, message: 'נשמר במצב בדיקה בלבד' };
  }

  return runSerialized(() => persistNormalModeTithe(monthKey, paid));
};

export const getCurrentDurableTithePaid = (): Record<string, boolean> => {
  return derivePaidMap(getActiveStore());
};
