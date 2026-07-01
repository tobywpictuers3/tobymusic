import { workerApi, WorkerResponse } from './workerApi';
import { logger } from './logger';
import {
  clearDirtyDataKeys,
  exportAllData,
  initializeStorage,
  isDevMode,
  peekDirtyDataKeys,
} from './storage';
import { recalculateAllMonthlyAchievements } from './recalculateAchievements';
import { getManagerCode } from './devMode';

/**
 * Hybrid Sync Manager - Worker as source of truth, in-memory storage as app state
 *
 * Adds a transparent Sync Status API for UI:
 *  - lastLocalSaveAt (saved locally)
 *  - lastCloudSyncAt (synced to Dropbox/Worker)
 *  - lastError
 *  - subscribeSyncState()
 */

export type SyncUiState = {
  isOnline: boolean;
  isSyncing: boolean;

  /** ISO time: last time we saved local state (even if cloud failed/offline) */
  lastLocalSaveAt: string | null;

  /** ISO time: last time we confirmed cloud sync success */
  lastCloudSyncAt: string | null;

  /** ISO time: last successful sync time (legacy field) */
  lastSyncTime: string | null;

  /** number of pending changes waiting for cloud */
  pendingChanges: number;

  /** last error message (if any) */
  lastError: string | null;
};

const LS_LAST_LOCAL = 'musicSystem_lastLocalSaveAt';
const LS_LAST_CLOUD = 'musicSystem_lastCloudSyncAt';
const LS_LAST_ERROR = 'musicSystem_lastCloudSyncError';
const LS_LAST_ERROR_MSG = 'musicSystem_lastCloudSyncErrorMessage';
const LS_LOCAL_SNAPSHOT = 'musicSystem_localSnapshot';
const LS_LOCAL_SNAPSHOT_INDEX = 'musicSystem_localSnapshotIndex';
const LS_LOCAL_SNAPSHOT_PREFIX = 'musicSystem_localSnapshot:';
const LS_HAS_UNSYNCED = 'musicSystem_hasUnsyncedChanges';
const WORKER_BASE_URL = 'https://lovable-dropbox-api.w0504124161.workers.dev';

type SyncListener = (state: SyncUiState) => void;

type SyncResult = { success: boolean; synced: boolean; message: string };

class HybridSyncManager {
  private listeners = new Set<SyncListener>();

  private syncState: SyncUiState = {
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncTime: null,

    lastLocalSaveAt: typeof window !== 'undefined' ? localStorage.getItem(LS_LAST_LOCAL) : null,
    lastCloudSyncAt: typeof window !== 'undefined' ? localStorage.getItem(LS_LAST_CLOUD) : null,
    lastError: typeof window !== 'undefined' ? localStorage.getItem(LS_LAST_ERROR_MSG) : null,

    pendingChanges: 0,
  };

  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private pendingQueue: Array<() => Promise<void>> = [];

  private isSyncingInternal = false;
  private pendingResync = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceResolvers: Array<(result: { success: boolean; synced: boolean; message: string }) => void> = [];
  private dataVersion = 0;
  private cloudVersion = 0;
  private uploadInFlight = false;
  private pendingUploadAfterCurrent = false;
  private uploadWorker: Worker | null = null;
  private uploadWorkerSeq = 0;
  private uploadWorkerCallbacks = new Map<number, (result: WorkerResponse) => void>();

  // Background full-merge sync (download+merge+upload). Heavy, so it runs at
  // long intervals — NOT on every save.
  private backgroundMergeInterval: ReturnType<typeof setInterval> | null = null;
  private readonly BACKGROUND_MERGE_MS = 3 * 60 * 1000; // 3 minutes

  // Deferred achievements recalc — coalesced so rapid saves don't trigger it
  // multiple times.
  private achievementsRecalcTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ACHIEVEMENTS_RECALC_DEBOUNCE_MS = 2500;

  constructor() {
    this.setupNetworkListeners();
    this.setupUnloadListener();
    this.startOfflineRetry();
    this.startBackgroundMergeSync();
  }

  /* =======================
     Public API for UI
     ======================= */

  getSyncState(): SyncUiState {
    return { ...this.syncState };
  }

  subscribeSyncState(cb: SyncListener): () => void {
    this.listeners.add(cb);
    // Push current immediately
    try {
      cb(this.getSyncState());
    } catch {
      // ignore UI errors
    }
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit() {
    const snapshot = this.getSyncState();
    for (const cb of this.listeners) {
      try {
        cb(snapshot);
      } catch {
        // ignore
      }
    }
  }

  /* =======================
     Internal helpers
     ======================= */

  private setLastLocalSaveNow() {
    const now = new Date().toISOString();
    this.syncState.lastLocalSaveAt = now;
    this.syncState.lastError = null; // local save succeeded; clear visible error (cloud may still fail later)

    try {
      localStorage.setItem(LS_LAST_LOCAL, now);
      localStorage.setItem(LS_HAS_UNSYNCED, 'true');
    } catch {}
    this.emit();
  }

  private setSyncing(on: boolean) {
    this.syncState.isSyncing = on;
    this.emit();
  }

  private setCloudSuccessNow(uploadedVersion: number = this.dataVersion) {
    const now = new Date().toISOString();
    this.cloudVersion = Math.max(this.cloudVersion, uploadedVersion);
    this.syncState.lastSyncTime = now;
    this.syncState.lastCloudSyncAt = now;
    this.syncState.lastError = null;
    this.syncState.pendingChanges = Math.max(0, this.dataVersion - this.cloudVersion);

    try {
      localStorage.setItem(LS_LAST_CLOUD, now);
      localStorage.setItem(LS_HAS_UNSYNCED, this.syncState.pendingChanges === 0 ? 'false' : 'true');
      localStorage.removeItem(LS_LAST_ERROR);
      localStorage.removeItem(LS_LAST_ERROR_MSG);
    } catch {}

    this.emit();
  }

  private setCloudError(err: unknown) {
    const when = new Date().toISOString();
    const msg =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'SYNC_FAILED';

    this.syncState.lastError = msg;

    try {
      localStorage.setItem(LS_LAST_ERROR, when);
      localStorage.setItem(LS_LAST_ERROR_MSG, msg);
    } catch {}

    this.emit();
  }

  private hasValidDataShape(data: any): boolean {
    return !!(
      data &&
      typeof data === 'object' &&
      Object.keys(data).some((k) => k.startsWith('musicSystem_') || k === 'oneTimePayments')
    );
  }

  private persistLocalSnapshot(options: { full?: boolean } = {}): void {
    try {
      const data = this.gatherAllData();
      if (this.hasValidDataShape(data)) {
        const allDataKeys = Object.keys(data).filter((key) => key !== 'timestamp');
        const dirtyDataKeys = options.full ? allDataKeys : peekDirtyDataKeys();
        const keysToPersist = (dirtyDataKeys.length > 0 ? dirtyDataKeys : allDataKeys)
          .filter((key) => key in data);

        const existingIndexRaw = localStorage.getItem(LS_LOCAL_SNAPSHOT_INDEX);
        const existingIndex = existingIndexRaw ? JSON.parse(existingIndexRaw) : [];
        const nextIndex = new Set<string>(Array.isArray(existingIndex) ? existingIndex : []);

        for (const key of keysToPersist) {
          localStorage.setItem(`${LS_LOCAL_SNAPSHOT_PREFIX}${key}`, JSON.stringify(data[key]));
          nextIndex.add(key);
        }

        localStorage.setItem(`${LS_LOCAL_SNAPSHOT_PREFIX}timestamp`, JSON.stringify(data.timestamp));
        localStorage.setItem(LS_LOCAL_SNAPSHOT_INDEX, JSON.stringify(Array.from(nextIndex)));
        clearDirtyDataKeys(keysToPersist);
      }
    } catch (error) {
      logger.warn('⚠️ Could not persist local sync snapshot:', error);
    }
  }

  private readLocalSnapshot(): any | null {
    try {
      const indexRaw = localStorage.getItem(LS_LOCAL_SNAPSHOT_INDEX);
      if (indexRaw) {
        const index = JSON.parse(indexRaw);
        if (Array.isArray(index) && index.length > 0) {
          const data: Record<string, any> = {};
          for (const key of index) {
            const valueRaw = localStorage.getItem(`${LS_LOCAL_SNAPSHOT_PREFIX}${key}`);
            if (valueRaw != null) data[key] = JSON.parse(valueRaw);
          }
          const timestampRaw = localStorage.getItem(`${LS_LOCAL_SNAPSHOT_PREFIX}timestamp`);
          if (timestampRaw != null) data.timestamp = JSON.parse(timestampRaw);
          if (this.hasValidDataShape(data)) return data;
        }
      }

      const raw = localStorage.getItem(LS_LOCAL_SNAPSHOT);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return this.hasValidDataShape(parsed) ? parsed : null;
    } catch (error) {
      logger.warn('⚠️ Could not read local sync snapshot:', error);
      return null;
    }
  }

  /* =======================
     Network / unload
     ======================= */

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      logger.info('🌐 Network online - syncing...');
      this.syncState.isOnline = true;
      this.emit();
      this.processPendingQueue();
      // When we just came back online, run one full merge to reconcile with
      // anything other devices wrote while we were offline.
      void this.syncToWorker();
    });

    window.addEventListener('offline', () => {
      logger.warn('📡 Network offline - using cache');
      this.syncState.isOnline = false;
      this.emit();
    });
  }

  private startBackgroundMergeSync() {
    if (this.backgroundMergeInterval) return;
    this.backgroundMergeInterval = setInterval(() => {
      if (isDevMode()) return;
      if (!this.syncState.isOnline) return;
      if (this.isSyncingInternal) return;
      // Don't fight an active debounce / fresh user save.
      if (this.debounceTimer !== null) return;
      void this.syncToWorker();
    }, this.BACKGROUND_MERGE_MS);
  }

  private scheduleAchievementsRecalc() {
    if (this.achievementsRecalcTimer) {
      clearTimeout(this.achievementsRecalcTimer);
    }
    this.achievementsRecalcTimer = setTimeout(() => {
      this.achievementsRecalcTimer = null;
      try {
        recalculateAllMonthlyAchievements();
      } catch (err) {
        logger.warn('⚠️ Deferred achievements recalc failed:', err);
      }
    }, this.ACHIEVEMENTS_RECALC_DEBOUNCE_MS);
  }

  private startOfflineRetry() {
    this.retryInterval = setInterval(() => {
      if (this.syncState.pendingChanges > 0 && !this.syncState.isOnline) {
        logger.info('🔄 Retrying offline sync (2min interval)...');
        this.directUpload().then((success) => {
          if (success) {
            logger.info('✅ Offline retry succeeded!');
            this.syncState.isOnline = true;
            this.emit();
          }
        });
      }
    }, 2 * 60 * 1000);
  }

  private setupUnloadListener() {
    window.addEventListener('beforeunload', (e) => {
      if (isDevMode()) {
        logger.info('🔧 DEV MODE: Skipping beforeunload sync');
        return;
      }

      // If there's a pending debounce, treat it as pending changes
      const hasPendingDebounce = this.debounceTimer !== null;

      if (this.syncState.pendingChanges > 0 || hasPendingDebounce) {
        const warningMessage =
          'יש שינויים שטרם נשמרו בדרופבוקס! האם את בטוחה שאת רוצה לצאת?';
        e.preventDefault();
        e.returnValue = warningMessage;

        logger.warn('⚠️ User trying to leave with pending changes');

        // Best-effort last sync (no UI guarantee)
        if (this.syncState.isOnline) {
          try {
            const data = this.gatherAllData();
            const dataSize = JSON.stringify(data).length;
            if (dataSize >= 100) {
              const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
              navigator.sendBeacon(
                'https://lovable-dropbox-api.w0504124161.workers.dev/?action=upload_versioned',
                blob
              );
            }
          } catch (error) {
            logger.error('❌ beforeunload sync prevented:', error);
          }
        }

        return warningMessage;
      }
    });
  }

  /* =======================
     Init load
     ======================= */

  async loadDataOnInit(): Promise<void> {
    if (isDevMode()) {
      logger.info('🔧 DEV MODE: Skipping Worker data load');
      return;
    }

    const emptyData = {
      musicSystem_students: [],
      musicSystem_lessons: [],
      musicSystem_payments: [],
      musicSystem_swapRequests: [],
      musicSystem_files: [],
      musicSystem_scheduleTemplates: [],
      musicSystem_performances: [],
      musicSystem_holidays: [],
      musicSystem_practiceSessions: [],
      musicSystem_monthlyAchievements: [],
      musicSystem_medalRecords: [],
      oneTimePayments: [],
    };

    try {
      logger.info('🔄 Loading from Worker...');

      if (!this.syncState.isOnline) {
        const snapshot = this.readLocalSnapshot();
        logger.warn('📡 Offline - loading local snapshot if available');
        this.updateInMemoryStorage(snapshot || emptyData);
        return;
      }

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_LOADING_WORKER')), 8000)
      );

      const result = (await Promise.race([
        workerApi.downloadLatest(),
        timeout,
      ])) as any;

      if (result && result.success && result.data) {
        const dataKeys = Object.keys(result.data);
        const hasMeaningfulData =
          dataKeys.some((k) => k.startsWith('musicSystem_')) || dataKeys.length > 1;

        if (!hasMeaningfulData) {
          const snapshot = this.readLocalSnapshot();
          logger.warn('⚠️ Loaded empty/invalid data from Worker - using local snapshot if available');
          this.updateInMemoryStorage(snapshot || emptyData);
          this.syncState.lastSyncTime = null;
          this.emit();
        } else {
          const snapshot = localStorage.getItem(LS_HAS_UNSYNCED) === 'true' ? this.readLocalSnapshot() : null;
          const dataToLoad = snapshot
            ? this.mergeDataWithConflictResolution(snapshot, result.data)
            : result.data;
          logger.info(snapshot ? '✅ Data loaded from Worker and merged with local snapshot' : '✅ Data loaded from Worker');
          this.updateInMemoryStorage(dataToLoad);
          this.persistLocalSnapshot({ full: true });
          // Treat init load as "cloud ok" (but do not reset pendingChanges)
          this.syncState.lastSyncTime = new Date().toISOString();
          this.emit();
          if (snapshot) void this.directUpload();
        }
      } else if (result && result.error === 'NO_VERSION_FOUND') {
        logger.info('ℹ️ No version found on Worker - starting fresh (first use)');
        this.updateInMemoryStorage(emptyData);
      } else {
        const errorMessage = result?.error || 'WORKER_LOAD_FAILED';
        const snapshot = this.readLocalSnapshot();
        if (snapshot) {
          logger.warn('⚠️ Worker load failed - using local unsynced snapshot:', errorMessage);
          this.updateInMemoryStorage(snapshot);
        }
        logger.error('❌ Worker load failed - keeping local state empty and blocking silent overwrite:', errorMessage);
        this.setCloudError(errorMessage);
      }
    } catch (error) {
      const snapshot = this.readLocalSnapshot();
      if (snapshot) {
        logger.warn('⚠️ Load error - using local unsynced snapshot:', error);
        this.updateInMemoryStorage(snapshot);
      }
      logger.error('❌ Load error - keeping local state empty and blocking silent overwrite:', error);
      this.setCloudError(error);
    }
  }

  private updateInMemoryStorage(data: any) {
    try {
      initializeStorage(data);
      logger.info('💾 Memory updated from Worker');
    } catch (error) {
      logger.error('❌ Memory update error:', error);
    }
  }

  /* =======================
     Merge helpers
     ======================= */

  private mergeDataWithConflictResolution(localData: any, remoteData: any): any {
    const merged = { ...remoteData };

    const conflictKeys = [
      'musicSystem_practiceSessions',
      'musicSystem_students',
      'musicSystem_lessons',
      'musicSystem_payments',
      'musicSystem_performances',
      'musicSystem_monthlyAchievements',
      'musicSystem_medalRecords',
      'musicSystem_swapRequests',
      'musicSystem_files',
      'musicSystem_scheduleTemplates',
      'musicSystem_holidays',
      'oneTimePayments',
      // ⚠️ CRITICAL: messages MUST be merged by id, otherwise messages
      // sent by one user while another user is syncing get overwritten.
      'musicSystem_messages',
      'musicSystem_perLessonPayments',
      'musicSystem_storeItems',
      'musicSystem_storePurchases',
      'musicSystem_integrationSettings',
    ];

    const directCopyKeys = ['musicSystem_studentStats', 'musicSystem_tithePaid'];

    directCopyKeys.forEach((key) => {
      if (localData[key]) merged[key] = localData[key];
    });

    // ---- Tombstones: union local + remote, keep latest deletedAt per id ----
    const TOMB_KEY = 'musicSystem___tombstones';
    const localTomb = (localData[TOMB_KEY] && typeof localData[TOMB_KEY] === 'object') ? localData[TOMB_KEY] : {};
    const remoteTomb = (remoteData[TOMB_KEY] && typeof remoteData[TOMB_KEY] === 'object') ? remoteData[TOMB_KEY] : {};
    const mergedTomb: Record<string, Record<string, string>> = {};
    const allCats = new Set([...Object.keys(localTomb), ...Object.keys(remoteTomb)]);
    const TOMB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    allCats.forEach((cat) => {
      const a = localTomb[cat] || {};
      const b = remoteTomb[cat] || {};
      const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
      const out: Record<string, string> = {};
      ids.forEach((id) => {
        const ta = a[id] ? new Date(a[id]).getTime() : 0;
        const tb = b[id] ? new Date(b[id]).getTime() : 0;
        const latest = Math.max(ta, tb);
        if (latest <= 0) return;
        // Drop tombstones older than TTL — safe cleanup
        if (nowMs - latest > TOMB_TTL_MS) return;
        out[id] = new Date(latest).toISOString();
      });
      if (Object.keys(out).length > 0) mergedTomb[cat] = out;
    });
    merged[TOMB_KEY] = mergedTomb;

    // Mapping from conflict array key → tombstone category name
    const tombCategoryFor: Record<string, string> = {
      'musicSystem_practiceSessions': 'practiceSessions',
      'musicSystem_students': 'students',
      'musicSystem_lessons': 'lessons',
      'musicSystem_payments': 'payments',
      'musicSystem_performances': 'performances',
      'musicSystem_monthlyAchievements': 'monthlyAchievements',
      'musicSystem_medalRecords': 'medalRecords',
      'musicSystem_swapRequests': 'swapRequests',
      'musicSystem_files': 'files',
      'musicSystem_scheduleTemplates': 'scheduleTemplates',
      'musicSystem_holidays': 'holidays',
      'oneTimePayments': 'oneTimePayments',
      'musicSystem_messages': 'messages',
      'musicSystem_perLessonPayments': 'perLessonPayments',
      'musicSystem_storeItems': 'storeItems',
      'musicSystem_storePurchases': 'storePurchases',
    };

    conflictKeys.forEach((key) => {
      const localRecords = localData[key];
      const remoteRecords = remoteData[key];

      if (localRecords && remoteRecords) {
        try {
          const localArray =
            typeof localRecords === 'string' ? JSON.parse(localRecords) : localRecords;
          const remoteArray =
            typeof remoteRecords === 'string' ? JSON.parse(remoteRecords) : remoteRecords;
          const tombMap = mergedTomb[tombCategoryFor[key]] || undefined;
          merged[key] = this.mergeRecords(localArray, remoteArray, tombMap);
        } catch (error) {
          logger.warn(`Failed to merge ${key}, using local:`, error);
          merged[key] = localRecords;
        }
      } else if (localRecords) {
        const tombMap = mergedTomb[tombCategoryFor[key]] || undefined;
        merged[key] = tombMap
          ? this.mergeRecords(Array.isArray(localRecords) ? localRecords : [], [], tombMap)
          : localRecords;
      } else if (remoteRecords) {
        const tombMap = mergedTomb[tombCategoryFor[key]] || undefined;
        if (tombMap) {
          merged[key] = this.mergeRecords([], Array.isArray(remoteRecords) ? remoteRecords : [], tombMap);
        }
      }
    });

    Object.keys(localData).forEach((key) => {
      if (key === TOMB_KEY) return; // already handled
      if (!conflictKeys.includes(key) && key !== 'timestamp') merged[key] = localData[key];
    });

    merged.timestamp = new Date().toISOString();
    return merged;
  }

  private mergeRecords(
    localRecords: any[],
    remoteRecords: any[],
    tombstones?: Record<string, string>,
  ): any {
    const recordMap = new Map<string, any>();
    const tombTimeFor = (id: string): number => {
      if (!tombstones) return 0;
      const raw = tombstones[id];
      return raw ? new Date(raw).getTime() : 0;
    };
    const recordTimeOf = (rec: any): number => {
      if (!rec) return 0;
      if (rec.lastModified) return new Date(rec.lastModified).getTime();
      if (rec.createdAt) return new Date(rec.createdAt).getTime();
      return 0;
    };
    const passesTombstone = (rec: any): boolean => {
      const t = tombTimeFor(String(rec.id));
      if (t <= 0) return true;
      // record survives only if it was updated AFTER the tombstone
      return recordTimeOf(rec) > t;
    };

    // Seed map with remote records (so anything only in remote survives)
    (remoteRecords || []).forEach((record) => {
      if (record && record.id != null && passesTombstone(record)) {
        recordMap.set(String(record.id), record);
      }
    });

    (localRecords || []).forEach((localRecord) => {
      if (!localRecord || localRecord.id == null) return;
      if (!passesTombstone(localRecord)) {
        // local explicitly deleted (or older than tombstone) → drop
        recordMap.delete(String(localRecord.id));
        return;
      }
      const key = String(localRecord.id);
      const remoteRecord = recordMap.get(key);

      if (!remoteRecord) {
        // Only in local → keep
        recordMap.set(key, localRecord);
        return;
      }

      const localTime = localRecord.lastModified
        ? new Date(localRecord.lastModified).getTime()
        : localRecord.createdAt
          ? new Date(localRecord.createdAt).getTime()
          : 0;
      const remoteTime = remoteRecord.lastModified
        ? new Date(remoteRecord.lastModified).getTime()
        : remoteRecord.createdAt
          ? new Date(remoteRecord.createdAt).getTime()
          : 0;

      // Prefer the most recently modified version; on tie, prefer the one
      // with more keys (i.e. richer record) to avoid losing fields.
      if (localTime > remoteTime) {
        recordMap.set(key, localRecord);
      } else if (localTime === remoteTime) {
        const localSize = Object.keys(localRecord).length;
        const remoteSize = Object.keys(remoteRecord).length;
        if (localSize >= remoteSize) recordMap.set(key, localRecord);
      }
    });

    const mergedArray = Array.from(recordMap.values());
    return mergedArray;
  }

  /* =======================
     Public sync triggers
     ======================= */

  async onDataChange(): Promise<SyncResult> {
    if (isDevMode()) {
      this.setLastLocalSaveNow();
      return { success: true, synced: true, message: 'נשמר במצב מפתחים' };
    }

    this.dataVersion += 1;
    this.setLastLocalSaveNow();
    // Persist only changed buckets immediately. This keeps refresh-safe local
    // durability without blocking the UI with a full database stringify.
    this.persistLocalSnapshot();
    this.syncState.pendingChanges = Math.max(1, this.dataVersion - this.cloudVersion);
    this.emit();

    if (!this.syncState.isOnline) {
      logger.warn('📡 Offline - saved locally, will retry in 2 minutes');
      return {
        success: true,
        synced: false,
        message: 'נשמר מקומית, יסונכרן אוטומטית כשיחזור חיבור',
      };
    }

    this.scheduleCloudUpload(700);
    return {
      success: true,
      synced: false,
      message: 'נשמר מיידית ומסתנכרן ברקע',
    };
  }

  private scheduleCloudUpload(delayMs: number) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      logger.info('🔄 Background cloud upload scheduled');
      await this.directUpload();

      const successResult = this.syncState.lastError
        ? { success: true, synced: false, message: 'נשמר מקומית, ננסה שוב בעוד 2 דקות' }
        : { success: true, synced: true, message: 'נשמר בדרופבוקס בהצלחה' };
      const resolvers = [...this.debounceResolvers];
      this.debounceResolvers = [];
      resolvers.forEach((r) => r(successResult));
    }, delayMs);
  }

  async onDestructiveChange(): Promise<{ success: boolean; synced: boolean; message: string }> {
    if (isDevMode()) {
      this.setLastLocalSaveNow();
      return { success: true, synced: true, message: 'נשמר במצב מפתחים' };
    }

    this.dataVersion += 1;
    this.setLastLocalSaveNow();
    this.persistLocalSnapshot();
    this.syncState.pendingChanges = Math.max(1, this.dataVersion - this.cloudVersion);
    this.emit();

    if (!this.syncState.isOnline) {
      logger.warn('📡 Offline (delete) - saved locally, will retry in 2 minutes');
      return {
        success: true,
        synced: false,
        message: 'נמחק מקומית, יסונכרן כשיחזור חיבור',
      };
    }

    this.scheduleCloudUpload(120);
    return { success: true, synced: false, message: 'נשמר מקומית ומסתנכרן ברקע' };
  }

  /* =======================
     Sync implementations
     ======================= */

  private async directUpload(): Promise<boolean> {
    if (isDevMode()) {
      logger.info('🔧 DEV MODE: directUpload disabled');
      return true;
    }

    if (this.uploadInFlight) {
      this.pendingUploadAfterCurrent = true;
      return true;
    }

    this.uploadInFlight = true;
    const uploadVersion = this.dataVersion;
    this.setSyncing(true);

    try {
      const data = this.gatherAllData();
      this.persistLocalSnapshot();

      // Cheap structural sanity check (no full stringify just to measure size).
      if (!this.hasValidDataShape(data)) {
        logger.error('❌ PREVENTED UPLOAD - data shape invalid, refusing to overwrite cloud');
        this.setCloudError('DATA_SHAPE_INVALID');
        return false;
      }

      const result = await this.uploadVersionedOffMainThread(data);

      if (result.success) {
        this.setCloudSuccessNow(uploadVersion);
        logger.info('✅ Direct upload to worker completed');

        // Heavy recompute — push off the critical path and coalesce.
        this.scheduleAchievementsRecalc();

        return true;
      } else {
        logger.warn('⚠️ Direct upload failed:', result.error);
        this.setCloudError(result.error || 'DIRECT_UPLOAD_FAILED');
        return false;
      }
    } catch (error) {
      logger.error('❌ Direct upload error:', error);
      this.setCloudError(error);
      return false;
    } finally {
      this.uploadInFlight = false;
      this.setSyncing(false);

      if (this.pendingUploadAfterCurrent || this.cloudVersion < this.dataVersion) {
        this.pendingUploadAfterCurrent = false;
        this.scheduleCloudUpload(250);
      }
    }
  }

  private getUploadWorker(): Worker | null {
    if (typeof Worker === 'undefined') return null;
    if (this.uploadWorker) return this.uploadWorker;

    try {
      this.uploadWorker = new Worker(new URL('./syncUploadWorker.ts', import.meta.url), { type: 'module' });
      this.uploadWorker.onmessage = (event: MessageEvent<WorkerResponse & { id?: number }>) => {
        const id = event.data?.id;
        if (typeof id !== 'number') return;
        const callback = this.uploadWorkerCallbacks.get(id);
        if (!callback) return;
        this.uploadWorkerCallbacks.delete(id);
        callback(event.data);
      };
      this.uploadWorker.onerror = (event) => {
        logger.warn('⚠️ Upload worker failed, falling back to main-thread upload:', event.message);
        for (const callback of this.uploadWorkerCallbacks.values()) {
          callback({ success: false, error: 'UPLOAD_WORKER_FAILED' });
        }
        this.uploadWorkerCallbacks.clear();
        this.uploadWorker?.terminate();
        this.uploadWorker = null;
      };
      return this.uploadWorker;
    } catch (error) {
      logger.warn('⚠️ Could not start upload worker, falling back:', error);
      return null;
    }
  }

  private async uploadVersionedOffMainThread(data: any): Promise<WorkerResponse> {
    const uploadWorker = this.getUploadWorker();
    if (!uploadWorker) return workerApi.uploadVersioned(data);

    const id = ++this.uploadWorkerSeq;

    return new Promise<WorkerResponse>((resolve) => {
      const timeout = setTimeout(() => {
        this.uploadWorkerCallbacks.delete(id);
        resolve({ success: false, error: 'UPLOAD_TIMEOUT' });
      }, 25_000);

      this.uploadWorkerCallbacks.set(id, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });

      uploadWorker.postMessage({
        id,
        db: data,
        workerBaseUrl: WORKER_BASE_URL,
        managerCode: getManagerCode(),
      });
    });
  }

  private async syncToWorker(): Promise<boolean> {
    if (isDevMode()) {
      logger.info('🔧 DEV MODE: Worker sync disabled');
      return true;
    }

    if (this.isSyncingInternal) {
      // Don't drop — mark that we need a re-upload after current one finishes
      logger.info('⏳ Sync in progress — marking pending resync');
      this.pendingResync = true;
      return true; // optimistic: it will be synced
    }

    this.isSyncingInternal = true;
    this.setSyncing(true);

    try {
      logger.info('🔄 Starting Worker sync with conflict resolution...');

      const remoteResult = await workerApi.downloadLatest();
      logger.info('📥 Downloaded latest version from server');

      const localData = this.gatherAllData();

      const remoteData = remoteResult.success && this.hasValidDataShape(remoteResult.data)
        ? remoteResult.data
        : {};
      const mergedData = this.mergeDataWithConflictResolution(localData, remoteData);
      logger.info('🔀 Merged local and remote changes');

      if (!this.hasValidDataShape(mergedData)) {
        logger.error('❌ PREVENTED SYNC - merged data shape invalid');
        this.setCloudError('DATA_SHAPE_INVALID');
        return false;
      }

      const result = await workerApi.uploadVersioned(mergedData);

      if (result.success) {
        this.updateInMemoryStorage(mergedData);
        this.persistLocalSnapshot({ full: true });
        this.setCloudSuccessNow();
        logger.info('✅ Worker sync completed with conflict resolution');

        this.scheduleAchievementsRecalc();

        return true;
      } else {
        logger.warn('⚠️ Sync failed:', result.error);
        this.setCloudError(result.error || 'SYNC_FAILED');
        return false;
      }
    } catch (error) {
      logger.error('❌ Sync error:', error);
      this.setCloudError(error);
      return false;
    } finally {
      this.isSyncingInternal = false;
      this.setSyncing(false);

      // If another change came in while we were syncing, just upload the
      // current state — no need to repeat the full download+merge.
      if (this.pendingResync) {
        this.pendingResync = false;
        logger.info('🔄 Running pending re-upload (data changed during sync)...');
        await this.directUpload();
      }
    }
  }

  private gatherAllData(): any {
    return exportAllData();
  }

  private async processPendingQueue() {
    if (this.pendingQueue.length === 0) return;

    logger.info(`🔄 Processing ${this.pendingQueue.length} pending changes...`);

    while (this.pendingQueue.length > 0) {
      const task = this.pendingQueue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          logger.error('❌ Pending task error:', error);
        }
      }
    }

    await this.syncToWorker();
  }

  async manualSync(): Promise<boolean> {
    if (isDevMode()) {
      logger.info('🔧 DEV MODE: Manual sync disabled');
      return true;
    }
    return await this.syncToWorker();
  }

  async restoreData(data: any, options: { uploadImmediately?: boolean } = {}): Promise<SyncResult> {
    try {
      const hasValidData =
        data &&
        typeof data === 'object' &&
        Object.keys(data).some((k) => k.startsWith('musicSystem_') || k === 'oneTimePayments');

      if (!hasValidData) {
        return { success: false, synced: false, message: 'מבנה הגיבוי לא תקין' };
      }

      this.updateInMemoryStorage(data);
      this.setLastLocalSaveNow();
      this.dataVersion += 1;
      this.persistLocalSnapshot({ full: true });
      this.syncState.pendingChanges = Math.max(1, this.dataVersion - this.cloudVersion);
      this.emit();

      if (options.uploadImmediately === false || isDevMode()) {
        return { success: true, synced: false, message: 'שוחזר מקומית' };
      }

      if (!this.syncState.isOnline) {
        return { success: true, synced: false, message: 'שוחזר מקומית, יסונכרן כשיחזור חיבור' };
      }

      const uploaded = await this.directUpload();
      return uploaded
        ? { success: true, synced: true, message: 'השחזור נשמר בדרופבוקס בהצלחה' }
        : { success: true, synced: false, message: 'השחזור בוצע מקומית, אך הסנכרון לדרופבוקס נכשל' };
    } catch (error) {
      logger.error('❌ Restore data error:', error);
      this.setCloudError(error);
      return {
        success: false,
        synced: false,
        message: error instanceof Error ? error.message : 'שגיאה בשחזור',
      };
    }
  }

  /**
   * Download a backup file to the user's device
   */
  downloadBackup(): void {
    try {
      const data = this.gatherAllData();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `music-system-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      logger.info('✅ Backup downloaded successfully');
    } catch (error) {
      logger.error('❌ Error downloading backup:', error);
      throw error;
    }
  }

  /**
   * Import a backup file and sync to Worker
   */
  async importBackup(file: File): Promise<{ success: boolean; message: string }> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate the data has expected structure
      const hasValidData = Object.keys(data).some(k => 
        k.startsWith('musicSystem_') || k === 'oneTimePayments'
      );
      
      if (!hasValidData) {
        return { success: false, message: 'קובץ הגיבוי לא תקין - חסרים נתוני מערכת' };
      }
      
      // Initialize storage with imported data
      this.updateInMemoryStorage(data);
      
      // Sync to worker if online
      if (!isDevMode() && this.syncState.isOnline) {
        const syncResult = await this.directUpload();
        if (syncResult) {
          return { success: true, message: 'הגיבוי יובא וסונכרן בהצלחה' };
        } else {
          return { success: true, message: 'הגיבוי יובא, אך הסנכרון נכשל. יסונכרן בהמשך.' };
        }
      }
      
      return { success: true, message: 'הגיבוי יובא בהצלחה' };
    } catch (error) {
      logger.error('❌ Error importing backup:', error);
      return { success: false, message: 'שגיאה בייבוא הגיבוי' };
    }
  }

  destroy() {
    if (this.retryInterval) clearInterval(this.retryInterval);
    if (this.backgroundMergeInterval) clearInterval(this.backgroundMergeInterval);
    if (this.achievementsRecalcTimer) clearTimeout(this.achievementsRecalcTimer);
    this.uploadWorker?.terminate();
  }
}

export const hybridSync = new HybridSyncManager();
