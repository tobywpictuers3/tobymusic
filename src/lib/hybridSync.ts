import { workerApi } from './workerApi';
import { logger } from './logger';
import { exportAllData, initializeStorage, isDevMode } from './storage';
import { recalculateAllMonthlyAchievements } from './recalculateAchievements';

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
const LS_HAS_UNSYNCED = 'musicSystem_hasUnsyncedChanges';

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

  constructor() {
    this.setupNetworkListeners();
    this.setupUnloadListener();
    this.startOfflineRetry();
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

  private setCloudSuccessNow() {
    const now = new Date().toISOString();
    this.syncState.lastSyncTime = now;
    this.syncState.lastCloudSyncAt = now;
    this.syncState.lastError = null;
    this.syncState.pendingChanges = 0;

    try {
      localStorage.setItem(LS_LAST_CLOUD, now);
      localStorage.setItem(LS_HAS_UNSYNCED, 'false');
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

  private persistLocalSnapshot(): void {
    try {
      const data = this.gatherAllData();
      if (this.hasValidDataShape(data)) {
        localStorage.setItem(LS_LOCAL_SNAPSHOT, JSON.stringify(data));
      }
    } catch (error) {
      logger.warn('⚠️ Could not persist local sync snapshot:', error);
    }
  }

  private readLocalSnapshot(): any | null {
    try {
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
    });

    window.addEventListener('offline', () => {
      logger.warn('📡 Network offline - using cache');
      this.syncState.isOnline = false;
      this.emit();
    });
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
          this.persistLocalSnapshot();
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

    conflictKeys.forEach((key) => {
      const localRecords = localData[key];
      const remoteRecords = remoteData[key];

      if (localRecords && remoteRecords) {
        try {
          const localArray =
            typeof localRecords === 'string' ? JSON.parse(localRecords) : localRecords;
          const remoteArray =
            typeof remoteRecords === 'string' ? JSON.parse(remoteRecords) : remoteRecords;
          merged[key] = this.mergeRecords(localArray, remoteArray);
        } catch (error) {
          logger.warn(`Failed to merge ${key}, using local:`, error);
          merged[key] = localRecords;
        }
      } else if (localRecords) {
        merged[key] = localRecords;
      }
    });

    Object.keys(localData).forEach((key) => {
      if (!conflictKeys.includes(key) && key !== 'timestamp') merged[key] = localData[key];
    });

    merged.timestamp = new Date().toISOString();
    return merged;
  }

  private mergeRecords(localRecords: any[], remoteRecords: any[]): any {
    const recordMap = new Map<string, any>();

    // Seed map with remote records (so anything only in remote survives)
    (remoteRecords || []).forEach((record) => {
      if (record && record.id != null) recordMap.set(String(record.id), record);
    });

    (localRecords || []).forEach((localRecord) => {
      if (!localRecord || localRecord.id == null) return;
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

    this.setLastLocalSaveNow();
    this.syncState.pendingChanges++;
    this.emit();

    if (!this.syncState.isOnline) {
      logger.warn('📡 Offline - saved locally, will retry in 2 minutes');
      return {
        success: true,
        synced: false,
        message: 'נשמר מקומית, יסונכרן אוטומטית כשיחזור חיבור',
      };
    }

    // Debounce: wait 500ms for rapid-fire changes to settle
    return new Promise((resolve) => {
      this.debounceResolvers.push(resolve);

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(async () => {
        this.debounceTimer = null;
        logger.info(`🔄 Debounce settled, syncing (${this.debounceResolvers.length} queued calls)...`);

        const success = await this.syncToWorker();
        const result = success
          ? { success: true, synced: true, message: 'נשמר בדרופבוקס בהצלחה' }
          : { success: true, synced: false, message: 'נשמר מקומית, ננסה שוב בעוד 2 דקות' };

        // Resolve all waiting callers
        const resolvers = [...this.debounceResolvers];
        this.debounceResolvers = [];
        resolvers.forEach((r) => r(result));
      }, 500);
    });
  }

  async onDestructiveChange(): Promise<{ success: boolean; synced: boolean; message: string }> {
    if (isDevMode()) {
      this.setLastLocalSaveNow();
      return { success: true, synced: true, message: 'נשמר במצב מפתחים' };
    }

    this.setLastLocalSaveNow();
    this.syncState.pendingChanges++;
    this.emit();

    if (!this.syncState.isOnline) {
      logger.warn('📡 Offline (delete) - saved locally, will retry in 2 minutes');
      return {
        success: true,
        synced: false,
        message: 'נמחק מקומית, יסונכרן כשיחזור חיבור',
      };
    }

    const success = await this.directUpload();

    if (success) {
      return { success: true, synced: true, message: 'נמחק בדרופבוקס בהצלחה' };
    } else {
      return {
        success: true,
        synced: false,
        message: 'נמחק מקומית, סנכרון לדרופבוקס נכשל – ננסה שוב',
      };
    }
  }

  /* =======================
     Sync implementations
     ======================= */

  private async directUpload(): Promise<boolean> {
    if (isDevMode()) {
      logger.info('🔧 DEV MODE: directUpload disabled');
      return true;
    }

    this.setSyncing(true);

    try {
      const data = this.gatherAllData();
      const result = await workerApi.uploadVersioned(data);

      if (result.success) {
        this.setCloudSuccessNow();
        logger.info('✅ Direct upload to worker completed');

        try {
          recalculateAllMonthlyAchievements();
        } catch (err) {
          logger.warn('⚠️ Failed to recalc achievements after direct upload:', err);
        }

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
      this.setSyncing(false);
    }
  }

  private async syncToWorker(): Promise<boolean> {
    if (isDevMode()) {
      logger.info('🔧 DEV MODE: Worker sync disabled');
      return true;
    }

    if (this.isSyncingInternal) {
      // Don't drop — mark that we need a resync after current one finishes
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

      const remoteData = remoteResult.data || remoteResult;
      const mergedData = this.mergeDataWithConflictResolution(localData, remoteData);
      logger.info('🔀 Merged local and remote changes');

      const dataSize = JSON.stringify(mergedData).length;
      logger.info(`📦 Data size: ${(dataSize / 1024).toFixed(2)} KB`);

      if (dataSize < 100) {
        logger.error('❌ PREVENTED SYNC - Data too small, likely corrupted');
        this.setCloudError('DATA_TOO_SMALL');
        return false;
      }

      const result = await workerApi.uploadVersioned(mergedData);

      if (result.success) {
        this.setCloudSuccessNow();
        logger.info('✅ Worker sync completed with conflict resolution');

        try {
          recalculateAllMonthlyAchievements();
          logger.info('✅ Achievements recalculated after sync');
        } catch (error) {
          logger.warn('⚠️ Failed to recalculate achievements after sync:', error);
        }

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

      // If another change came in while we were syncing, run one more sync
      if (this.pendingResync) {
        this.pendingResync = false;
        logger.info('🔄 Running pending resync (data changed during sync)...');
        await this.syncToWorker();
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
      this.syncState.pendingChanges++;
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
  }
}

export const hybridSync = new HybridSyncManager();
