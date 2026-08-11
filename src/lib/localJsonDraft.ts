import { hybridSync } from './hybridSync';
import { exportAllData, isDevMode } from './storage';
import { workerApi } from './workerApi';

export type LocalJsonDraftState = {
  active: boolean;
  saving: boolean;
};

export type LocalJsonDraftResult = {
  success: boolean;
  synced: boolean;
  message: string;
};

const STATE_EVENT = 'toby:local-json-draft-state';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let state: LocalJsonDraftState = { active: false, saving: false };
let originals: Record<string, any> | null = null;

const emitState = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: { ...state } }));
};

export const getLocalJsonDraftState = (): LocalJsonDraftState => ({ ...state });
export const isLocalJsonDraftActive = (): boolean => state.active;

export const subscribeLocalJsonDraftState = (
  callback: (next: LocalJsonDraftState) => void,
): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<LocalJsonDraftState>).detail;
    callback(detail || getLocalJsonDraftState());
  };

  window.addEventListener(STATE_EVENT, handler);
  callback(getLocalJsonDraftState());
  return () => window.removeEventListener(STATE_EVENT, handler);
};

const pausedSaveResult = (): LocalJsonDraftResult => ({
  success: true,
  synced: false,
  message: 'מצב JSON מקומי פעיל — השינוי נשמר בזיכרון בלבד עד לחיצה על שמור שינויים',
});

const applyPausedMethods = () => {
  if (!originals) return;
  const manager = hybridSync as any;

  manager.onDataChange = async () => pausedSaveResult();
  manager.onDestructiveChange = async () => pausedSaveResult();
  manager.syncToWorker = async () => true;
  manager.directUpload = async () => true;
  manager.manualSync = async () => true;
  manager.restoreData = async () => pausedSaveResult();
  manager.scheduleCloudUpload = () => undefined;
};

const patchSync = () => {
  if (originals) return;
  const manager = hybridSync as any;
  originals = {
    onDataChange: manager.onDataChange,
    onDestructiveChange: manager.onDestructiveChange,
    syncToWorker: manager.syncToWorker,
    directUpload: manager.directUpload,
    manualSync: manager.manualSync,
    restoreData: manager.restoreData,
    scheduleCloudUpload: manager.scheduleCloudUpload,
  };
  applyPausedMethods();
};

const restoreSync = () => {
  if (!originals) return;
  const manager = hybridSync as any;
  Object.entries(originals).forEach(([key, value]) => {
    manager[key] = value;
  });
  originals = null;
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
      if (key !== 'timestamp') out[key] = canonicalize(value[key]);
      return out;
    }, {});
};

const snapshotsMatch = (expected: Record<string, any>, actual: Record<string, any>): boolean => {
  const expectedKeys = Object.keys(expected)
    .filter(key => key !== 'timestamp' && (key.startsWith('musicSystem_') || key === 'oneTimePayments'))
    .sort();

  return expectedKeys.every(key =>
    JSON.stringify(canonicalize(expected[key])) === JSON.stringify(canonicalize(actual?.[key])),
  );
};

const verifyLatestSnapshot = async (expected: Record<string, any>): Promise<boolean> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response: any = await workerApi.downloadLatest();
    if (response?.success && response.data && snapshotsMatch(expected, response.data)) return true;
    await delay(500 * (attempt + 1));
  }
  return false;
};

export const beginLocalJsonDraftSession = async (): Promise<LocalJsonDraftResult> => {
  if (isDevMode()) {
    return { success: true, synced: false, message: 'מצב בדיקה כבר מבודד מ-Dropbox' };
  }

  if (state.active) return pausedSaveResult();

  // Pause all future automatic writes/merges first, then wait for an already
  // running operation to finish before the imported JSON replaces memory.
  patchSync();
  state = { active: true, saving: false };
  emitState();

  const idle = await waitUntilSyncIdle();
  if (!idle) {
    restoreSync();
    state = { active: false, saving: false };
    emitState();
    return {
      success: false,
      synced: false,
      message: 'לא ניתן להיכנס למצב JSON מקומי כי סנכרון קודם עדיין פעיל. נסי שוב בעוד כמה שניות.',
    };
  }

  return {
    success: true,
    synced: false,
    message: 'הסנכרון ל-Dropbox מושהה עד לחיצה על שמור שינויים',
  };
};

export const commitLocalJsonDraftSession = async (): Promise<LocalJsonDraftResult> => {
  if (isDevMode()) {
    return { success: true, synced: false, message: 'מצב בדיקה נשמר בזיכרון בלבד' };
  }

  if (!state.active || !originals) {
    return { success: false, synced: false, message: 'אין JSON מקומי שממתין לשמירה' };
  }

  if (state.saving) {
    return { success: false, synced: false, message: 'שמירה כבר מתבצעת' };
  }

  state = { ...state, saving: true };
  emitState();

  const manager = hybridSync as any;

  try {
    const idle = await waitUntilSyncIdle();
    if (!idle) {
      return {
        success: false,
        synced: false,
        message: 'סנכרון קודם עדיין פעיל. מצב ה-JSON המקומי נשאר מושהה ולא אבד.',
      };
    }

    // Up to three passes: if the user edits data while Save is still running,
    // upload the newest complete snapshot again before resuming normal sync.
    for (let pass = 0; pass < 3; pass += 1) {
      const snapshot = exportAllData(true);

      // restoreData updates the sync manager's local/cloud counters correctly.
      // Only its direct upload path is temporarily restored; full merge remains
      // paused until read-back verification succeeds.
      manager.directUpload = originals.directUpload;
      const result = await originals.restoreData.call(manager, snapshot, { uploadImmediately: true });
      applyPausedMethods();

      if (!result?.success || !result?.synced) {
        return {
          success: false,
          synced: false,
          message: result?.message || 'העלאת ה-JSON ל-Dropbox נכשלה. הסנכרון נשאר מושהה.',
        };
      }

      const verified = await verifyLatestSnapshot(snapshot);
      if (!verified) {
        return {
          success: false,
          synced: false,
          message: 'הקובץ הועלה אך לא הצלחנו לאמת שהעותק האחרון ב-Dropbox זהה. הסנכרון נשאר מושהה.',
        };
      }

      const latestLocal = exportAllData(true);
      if (snapshotsMatch(snapshot, latestLocal)) {
        restoreSync();
        state = { active: false, saving: false };
        emitState();
        return {
          success: true,
          synced: true,
          message: 'ה-JSON נשמר ואומת ב-Dropbox. הסנכרון האוטומטי חזר לפעולה.',
        };
      }
    }

    return {
      success: false,
      synced: false,
      message: 'הנתונים המשיכו להשתנות בזמן השמירה. הסנכרון נשאר מושהה כדי לא לאבד שינויים; לחצי שוב על שמור שינויים.',
    };
  } catch {
    return {
      success: false,
      synced: false,
      message: 'שמירת ה-JSON נכשלה. הסנכרון נשאר מושהה והנתונים המקומיים לא נדרסו.',
    };
  } finally {
    if (state.active) {
      applyPausedMethods();
      state = { ...state, saving: false };
      emitState();
    }
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', event => {
    if (!state.active) return;
    const message = 'נטען JSON מקומי שטרם נשמר ל-Dropbox.';
    event.preventDefault();
    event.returnValue = message;
    return message;
  });
}
