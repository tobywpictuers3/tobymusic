import fs from 'node:fs';

const syncPath = 'src/lib/hybridSync.ts';
let source = fs.readFileSync(syncPath, 'utf8');

const replaceBetween = (input, startMarker, endMarker, replacement, label) => {
  const start = input.indexOf(startMarker);
  const end = input.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`${label}: replacement markers missing`);
  }
  return input.slice(0, start) + replacement + input.slice(end);
};

// Canonical Dropbox latest is the only acceptable base/read-back for multi-device writes.
if (!source.includes("import { downloadCanonicalDropboxLatest } from './canonicalDropboxRead';")) {
  source = source.replace(
    "import { getManagerCode } from './devMode';",
    "import { getManagerCode } from './devMode';\nimport { downloadCanonicalDropboxLatest } from './canonicalDropboxRead';",
  );
}

if (!source.includes("const LS_PENDING_DIRTY_KEYS = 'musicSystem_pendingDirtyDataKeys';")) {
  source = source.replace(
    "const LS_HAS_UNSYNCED = 'musicSystem_hasUnsyncedChanges';",
    "const LS_HAS_UNSYNCED = 'musicSystem_hasUnsyncedChanges';\nconst LS_PENDING_DIRTY_KEYS = 'musicSystem_pendingDirtyDataKeys';",
  );
}

source = source.replace(
  "  private readonly BACKGROUND_MERGE_MS = 3 * 60 * 1000; // 3 minutes",
  "  private readonly BACKGROUND_MERGE_MS = 60 * 1000; // visible read-only cross-device reconciliation",
);
source = source.replace(
  "  private readonly BACKGROUND_MERGE_MS = 10 * 60 * 1000; // 10-minute safety reconciliation",
  "  private readonly BACKGROUND_MERGE_MS = 60 * 1000; // visible read-only cross-device reconciliation",
);

if (!source.includes('private lastVisibilityReconcileAt = 0;')) {
  source = source.replace(
    '  private backgroundMergeInterval: ReturnType<typeof setInterval> | null = null;\n',
    '  private backgroundMergeInterval: ReturnType<typeof setInterval> | null = null;\n  private lastVisibilityReconcileAt = 0;\n',
  );
}
if (!source.includes('private pendingDirtyDataKeys = new Set<string>();')) {
  source = source.replace(
    '  private lastVisibilityReconcileAt = 0;\n',
    '  private lastVisibilityReconcileAt = 0;\n  private pendingDirtyDataKeys = new Set<string>();\n',
  );
}

if (!source.includes('this.restorePendingDirtyDataKeys();')) {
  source = source.replace(
    '  constructor() {\n    this.setupNetworkListeners();',
    '  constructor() {\n    this.restorePendingDirtyDataKeys();\n    this.setupNetworkListeners();',
  );
}
if (!source.includes('this.setupVisibilityReconcile();')) {
  source = source.replace(
    '    this.startOfflineRetry();\n    this.startBackgroundMergeSync();',
    '    this.startOfflineRetry();\n    this.setupVisibilityReconcile();\n    this.startBackgroundMergeSync();',
  );
}

// Persist a per-device write journal. A stale device may only write buckets it actually changed.
if (!source.includes('private restorePendingDirtyDataKeys()')) {
  const marker = '  /* =======================\n     Network / unload';
  const helpers = `  private restorePendingDirtyDataKeys() {\n    try {\n      const raw = localStorage.getItem(LS_PENDING_DIRTY_KEYS);\n      const parsed = raw ? JSON.parse(raw) : [];\n      if (Array.isArray(parsed)) {\n        parsed.filter((key): key is string => typeof key === 'string' && key.length > 0)\n          .forEach((key) => this.pendingDirtyDataKeys.add(key));\n      }\n\n      // One-time compatibility for changes created before the dirty-key journal existed.\n      // Preserve them rather than silently discarding them on the first upgraded session.\n      if (this.pendingDirtyDataKeys.size === 0 && localStorage.getItem(LS_HAS_UNSYNCED) === 'true') {\n        const indexRaw = localStorage.getItem(LS_LOCAL_SNAPSHOT_INDEX);\n        const index = indexRaw ? JSON.parse(indexRaw) : [];\n        if (Array.isArray(index)) {\n          index.filter((key): key is string => typeof key === 'string' && key.length > 0)\n            .forEach((key) => this.pendingDirtyDataKeys.add(key));\n        }\n      }\n\n      if (this.pendingDirtyDataKeys.size > 0) {\n        this.syncState.pendingChanges = Math.max(1, this.syncState.pendingChanges);\n        this.persistPendingDirtyDataKeys();\n      }\n    } catch (error) {\n      logger.warn('⚠️ Could not restore pending dirty-key journal:', error);\n    }\n  }\n\n  private persistPendingDirtyDataKeys() {\n    try {\n      localStorage.setItem(LS_PENDING_DIRTY_KEYS, JSON.stringify(Array.from(this.pendingDirtyDataKeys)));\n    } catch {}\n  }\n\n  private rememberPendingDirtyDataKeys(keys: string[]) {\n    keys.forEach((key) => {\n      if (key && key !== 'timestamp') this.pendingDirtyDataKeys.add(key);\n    });\n    this.persistPendingDirtyDataKeys();\n  }\n\n  private clearVerifiedDirtyDataKeys(keys: string[]) {\n    keys.forEach((key) => this.pendingDirtyDataKeys.delete(key));\n    this.persistPendingDirtyDataKeys();\n  }\n\n  private buildLocalDelta(localData: Record<string, any>, dirtyKeys: string[]): Record<string, any> {\n    const delta: Record<string, any> = {};\n    dirtyKeys.forEach((key) => {\n      if (key in localData) delta[key] = localData[key];\n    });\n    delta.timestamp = localData.timestamp || new Date().toISOString();\n    return delta;\n  }\n\n  private emitCanonicalDataApplied() {\n    try {\n      window.dispatchEvent(new CustomEvent('toby:canonical-sync-applied'));\n    } catch {}\n  }\n\n`;
  if (!source.includes(marker)) throw new Error('dirty-key helper insertion marker missing');
  source = source.replace(marker, helpers + marker);
}

// Focus should reconcile immediately (throttled), not wait five or ten minutes.
if (!source.includes('private setupVisibilityReconcile()')) {
  const marker = '  private startBackgroundMergeSync() {';
  const method = `  private setupVisibilityReconcile() {\n    const maybeReconcile = () => {\n      if (isDevMode()) return;\n      if (document.visibilityState !== 'visible') return;\n      if (!this.syncState.isOnline || this.isSyncingInternal || this.uploadInFlight) return;\n      if (this.debounceTimer !== null) return;\n      const now = Date.now();\n      if (now - this.lastVisibilityReconcileAt < 5_000) return;\n      this.lastVisibilityReconcileAt = now;\n      void this.syncToWorker();\n    };\n\n    document.addEventListener('visibilitychange', maybeReconcile);\n    window.addEventListener('focus', maybeReconcile);\n  }\n\n`;
  if (!source.includes(marker)) throw new Error('visibility reconcile insertion marker missing');
  source = source.replace(marker, method + marker);
} else {
  source = replaceBetween(
    source,
    '  private setupVisibilityReconcile() {',
    '  private startBackgroundMergeSync() {',
    `  private setupVisibilityReconcile() {\n    const maybeReconcile = () => {\n      if (isDevMode()) return;\n      if (document.visibilityState !== 'visible') return;\n      if (!this.syncState.isOnline || this.isSyncingInternal || this.uploadInFlight) return;\n      if (this.debounceTimer !== null) return;\n      const now = Date.now();\n      if (now - this.lastVisibilityReconcileAt < 5_000) return;\n      this.lastVisibilityReconcileAt = now;\n      void this.syncToWorker();\n    };\n\n    document.addEventListener('visibilitychange', maybeReconcile);\n    window.addEventListener('focus', maybeReconcile);\n  }\n\n`,
    'visibility reconcile',
  );
}

// While hidden, do not spend Dropbox reads. Visible admin sessions reconcile once per minute.
source = source.replace(
  "      if (!this.syncState.isOnline) return;\n      if (this.isSyncingInternal) return;",
  "      if (!this.syncState.isOnline) return;\n      if (document.visibilityState !== 'visible') return;\n      if (this.isSyncingInternal) return;",
);

// Initial hydration must use canonical latest, never an older historical fallback.
source = source.replace(
  '        workerApi.downloadLatest(),\n        timeout,',
  '        downloadCanonicalDropboxLatest(),\n        timeout,',
);

// Capture dirty buckets before persistLocalSnapshot clears the transient Proxy dirty set.
const localSaveMarker = `    this.dataVersion += 1;\n    this.setLastLocalSaveNow();\n    // Persist only changed buckets immediately.`;
const localSaveReplacement = `    this.dataVersion += 1;\n    this.setLastLocalSaveNow();\n    this.rememberPendingDirtyDataKeys(peekDirtyDataKeys());\n    // Persist only changed buckets immediately.`;
source = source.replace(localSaveMarker, localSaveReplacement);

const destructiveMarker = `    this.dataVersion += 1;\n    this.setLastLocalSaveNow();\n    this.persistLocalSnapshot();`;
const destructiveReplacement = `    this.dataVersion += 1;\n    this.setLastLocalSaveNow();\n    this.rememberPendingDirtyDataKeys(peekDirtyDataKeys());\n    this.persistLocalSnapshot();`;
source = source.replace(destructiveMarker, destructiveReplacement);

if (!source.includes('private stableSyncFingerprint(')) {
  const marker = '  private async directUpload(): Promise<boolean> {';
  const helper = `  private stableSyncFingerprint(value: any): string {\n    const normalize = (input: any, topLevel = false): any => {\n      if (Array.isArray(input)) return input.map(item => normalize(item, false));\n      if (!input || typeof input !== 'object') return input;\n      const out: Record<string, any> = {};\n      for (const key of Object.keys(input).sort()) {\n        if (topLevel && key === 'timestamp') continue;\n        out[key] = normalize(input[key], false);\n      }\n      return out;\n    };\n    return JSON.stringify(normalize(value, true));\n  }\n\n  private localDeltaSatisfied(localDelta: Record<string, any>, canonicalData: Record<string, any>): boolean {\n    const reconciled = this.mergeDataWithConflictResolution(localDelta, canonicalData);\n    return this.stableSyncFingerprint(reconciled) === this.stableSyncFingerprint(canonicalData);\n  }\n\n`;
  if (!source.includes(marker)) throw new Error('fingerprint helper insertion marker missing');
  source = source.replace(marker, helper + marker);
} else if (!source.includes('private localDeltaSatisfied(')) {
  const marker = '  private async directUpload(): Promise<boolean> {';
  const helper = `  private localDeltaSatisfied(localDelta: Record<string, any>, canonicalData: Record<string, any>): boolean {\n    const reconciled = this.mergeDataWithConflictResolution(localDelta, canonicalData);\n    return this.stableSyncFingerprint(reconciled) === this.stableSyncFingerprint(canonicalData);\n  }\n\n`;
  source = source.replace(marker, helper + marker);
}

// Replace the unsafe blind full-snapshot writer with canonical read → dirty-bucket merge → upload → read-back verification.
const directUpload = `  private async directUpload(): Promise<boolean> {\n    if (isDevMode()) {\n      logger.info('🔧 DEV MODE: directUpload disabled');\n      return true;\n    }\n\n    if (this.uploadInFlight) {\n      this.pendingUploadAfterCurrent = true;\n      return true;\n    }\n    if (this.isSyncingInternal) {\n      this.pendingResync = true;\n      return true;\n    }\n\n    this.uploadInFlight = true;\n    const uploadVersion = this.dataVersion;\n    const dirtyKeys = Array.from(this.pendingDirtyDataKeys);\n    this.setSyncing(true);\n\n    try {\n      const localData = this.gatherAllData();\n      this.persistLocalSnapshot();\n\n      if (!this.hasValidDataShape(localData)) {\n        this.setCloudError('DATA_SHAPE_INVALID');\n        return false;\n      }\n\n      const canonicalRead = await downloadCanonicalDropboxLatest();\n      if (!canonicalRead.success || !canonicalRead.data || !this.hasValidDataShape(canonicalRead.data)) {\n        this.setCloudError(canonicalRead.error || 'CANONICAL_READ_FAILED');\n        return false;\n      }\n\n      // Nothing local to write: this is a safe read-only reconciliation.\n      if (dirtyKeys.length === 0) {\n        const changed = this.stableSyncFingerprint(localData) !== this.stableSyncFingerprint(canonicalRead.data);\n        if (changed) {\n          this.updateInMemoryStorage(canonicalRead.data);\n          this.persistLocalSnapshot({ full: true });\n          this.emitCanonicalDataApplied();\n        }\n        this.setCloudSuccessNow(uploadVersion);\n        return true;\n      }\n\n      const localDelta = this.buildLocalDelta(localData, dirtyKeys);\n      let candidate = this.mergeDataWithConflictResolution(localDelta, canonicalRead.data);\n      if (!this.hasValidDataShape(candidate)) {\n        this.setCloudError('MERGED_DATA_SHAPE_INVALID');\n        return false;\n      }\n\n      for (let attempt = 1; attempt <= 3; attempt += 1) {\n        const uploadResult = await this.uploadVersionedOffMainThread(candidate);\n        if (!uploadResult.success) {\n          this.setCloudError(uploadResult.error || 'DIRECT_UPLOAD_FAILED');\n          return false;\n        }\n\n        const readBack = await downloadCanonicalDropboxLatest();\n        if (!readBack.success || !readBack.data || !this.hasValidDataShape(readBack.data)) {\n          this.setCloudError(readBack.error || 'CANONICAL_READBACK_FAILED');\n          return false;\n        }\n\n        if (this.localDeltaSatisfied(localDelta, readBack.data)) {\n          const cloudContainsOtherChanges =\n            this.stableSyncFingerprint(localData) !== this.stableSyncFingerprint(readBack.data);\n\n          // Never overwrite a newer local edit that happened while this upload was in flight.\n          if (this.dataVersion === uploadVersion) {\n            this.clearVerifiedDirtyDataKeys(dirtyKeys);\n            this.updateInMemoryStorage(readBack.data);\n            this.persistLocalSnapshot({ full: true });\n            if (cloudContainsOtherChanges) this.emitCanonicalDataApplied();\n          }\n\n          this.setCloudSuccessNow(uploadVersion);\n          logger.info('✅ Canonical Dropbox write verified by read-back');\n          this.scheduleAchievementsRecalc();\n          return true;\n        }\n\n        // Another device wrote between our upload and read-back. Merge again against\n        // the new canonical latest; never replay unrelated stale buckets from this device.\n        candidate = this.mergeDataWithConflictResolution(localDelta, readBack.data);\n        logger.warn(\`⚠️ Canonical read-back changed during write; retrying merge (\${attempt}/3)\`);\n      }\n\n      this.setCloudError('CANONICAL_WRITE_NOT_VERIFIED');\n      return false;\n    } catch (error) {\n      logger.error('❌ Canonical direct upload error:', error);\n      this.setCloudError(error);\n      return false;\n    } finally {\n      this.uploadInFlight = false;\n      this.setSyncing(false);\n\n      if (this.pendingUploadAfterCurrent || this.cloudVersion < this.dataVersion || this.pendingDirtyDataKeys.size > 0) {\n        this.pendingUploadAfterCurrent = false;\n        this.scheduleCloudUpload(250);\n      }\n    }\n  }\n\n`;
source = replaceBetween(
  source,
  '  private async directUpload(): Promise<boolean> {',
  '  private getUploadWorker(): Worker | null {',
  directUpload,
  'directUpload hardening',
);

// Background/focus sync is read-only unless this device has an explicit dirty-key journal.
const syncToWorker = `  private async syncToWorker(): Promise<boolean> {\n    if (isDevMode()) {\n      logger.info('🔧 DEV MODE: Worker sync disabled');\n      return true;\n    }\n\n    if (this.isSyncingInternal) {\n      this.pendingResync = true;\n      return true;\n    }\n\n    if (this.pendingDirtyDataKeys.size > 0) {\n      return await this.directUpload();\n    }\n\n    this.isSyncingInternal = true;\n    this.setSyncing(true);\n\n    try {\n      const remoteResult = await downloadCanonicalDropboxLatest();\n      if (!remoteResult.success || !remoteResult.data || !this.hasValidDataShape(remoteResult.data)) {\n        this.setCloudError(remoteResult.error || 'CANONICAL_READ_FAILED');\n        return false;\n      }\n\n      // A user edit may have arrived while the network read was in flight. Do not\n      // hydrate over it; hand control back to the verified writer in finally.\n      if (this.pendingDirtyDataKeys.size > 0 || this.debounceTimer !== null) {\n        this.pendingResync = true;\n        return true;\n      }\n\n      const localData = this.gatherAllData();\n      const changed = this.stableSyncFingerprint(localData) !== this.stableSyncFingerprint(remoteResult.data);\n      if (changed) {\n        this.updateInMemoryStorage(remoteResult.data);\n        this.persistLocalSnapshot({ full: true });\n        this.emitCanonicalDataApplied();\n        logger.info('✅ Canonical remote delta applied without upload');\n      }\n\n      this.setCloudSuccessNow();\n      return true;\n    } catch (error) {\n      logger.error('❌ Canonical reconciliation error:', error);\n      this.setCloudError(error);\n      return false;\n    } finally {\n      this.isSyncingInternal = false;\n      this.setSyncing(false);\n\n      if (this.pendingResync) {\n        this.pendingResync = false;\n        if (this.pendingDirtyDataKeys.size > 0) await this.directUpload();\n      }\n    }\n  }\n\n`;
source = replaceBetween(
  source,
  '  private async syncToWorker(): Promise<boolean> {',
  '  private gatherAllData(): any {',
  syncToWorker,
  'syncToWorker hardening',
);

// Dedicated strict manual pull for the admin "download from Dropbox" control.
if (!source.includes('async pullCanonicalLatest(): Promise<SyncResult>')) {
  const marker = '  async manualSync(): Promise<boolean> {';
  const method = `  async pullCanonicalLatest(): Promise<SyncResult> {\n    if (isDevMode()) return { success: false, synced: false, message: 'מצב בדיקה מבודד' };\n\n    if (this.pendingDirtyDataKeys.size > 0 || this.syncState.pendingChanges > 0) {\n      const uploaded = await this.directUpload();\n      if (!uploaded) {\n        return { success: false, synced: false, message: 'יש שינויים מקומיים שלא אומתו עדיין בדרופבוקס' };\n      }\n    }\n\n    const result = await downloadCanonicalDropboxLatest();\n    if (!result.success || !result.data || !this.hasValidDataShape(result.data)) {\n      const message = result.error || 'הורדת canonical latest נכשלה';\n      this.setCloudError(message);\n      return { success: false, synced: false, message };\n    }\n\n    const localData = this.gatherAllData();\n    const changed = this.stableSyncFingerprint(localData) !== this.stableSyncFingerprint(result.data);\n    this.updateInMemoryStorage(result.data);\n    this.persistLocalSnapshot({ full: true });\n    this.setCloudSuccessNow();\n    if (changed) this.emitCanonicalDataApplied();\n    return { success: true, synced: true, message: 'הנתונים האחרונים אומתו ונטענו מדרופבוקס' };\n  }\n\n`;
  if (!source.includes(marker)) throw new Error('manual pull insertion marker missing');
  source = source.replace(marker, method + marker);
}

fs.writeFileSync(syncPath, source);

// The manual Dropbox button must not call bootstrap logic that merges a local snapshot and then always shows success.
const backupPath = 'src/components/admin/BackupImport.tsx';
let backup = fs.readFileSync(backupPath, 'utf8');
backup = backup.replace(
  `      await hybridSync.loadDataOnInit();\n\n      toast({\n        title: '✅ הורדה הושלמה',\n        description: 'הנתונים עודכנו מהדרופבוקס',\n      });`,
  `      const result = await hybridSync.pullCanonicalLatest();\n      if (!result.success || !result.synced) {\n        throw new Error(result.message);\n      }\n\n      toast({\n        title: '✅ הורדה אומתה',\n        description: 'הנתונים האחרונים נטענו מה־canonical latest בדרופבוקס',\n      });`,
);
if (!backup.includes('hybridSync.pullCanonicalLatest()')) {
  throw new Error('BackupImport canonical pull patch failed');
}
fs.writeFileSync(backupPath, backup);

// When a true remote delta is applied, remount admin data views so the second device visibly updates.
const routePath = 'src/pages/AdminModeRoutes.tsx';
let routes = fs.readFileSync(routePath, 'utf8');
routes = routes.replace(
  "import { useLayoutEffect, useState } from 'react';",
  "import { useEffect, useLayoutEffect, useState } from 'react';",
);
if (!routes.includes('const [syncGeneration, setSyncGeneration]')) {
  routes = routes.replace(
    '  const [ready, setReady] = useState(false);',
    `  const [ready, setReady] = useState(false);\n  const [syncGeneration, setSyncGeneration] = useState(0);\n\n  useEffect(() => {\n    const handleCanonicalDataApplied = () => setSyncGeneration((value) => value + 1);\n    window.addEventListener('toby:canonical-sync-applied', handleCanonicalDataApplied);\n    return () => window.removeEventListener('toby:canonical-sync-applied', handleCanonicalDataApplied);\n  }, []);`,
  );
}
routes = routes.replace(
  '  const dashboard = <AdminDashboard />;',
  '  const dashboard = <AdminDashboard key={syncGeneration} />;',
);
if (!routes.includes('AdminDashboard key={syncGeneration}')) {
  throw new Error('admin canonical refresh patch failed');
}
fs.writeFileSync(routePath, routes);

// Green status now explicitly means a canonical read-back / canonical reconciliation succeeded.
const badgePath = 'src/components/ui/SyncStatusBadge.tsx';
let badge = fs.readFileSync(badgePath, 'utf8');
badge = badge.replace(
  'text: `סונכרן ${formatRelative(state.lastCloudSyncAt)} (${formatTime(state.lastCloudSyncAt)})`,',
  'text: `אומת בדרופבוקס ${formatRelative(state.lastCloudSyncAt)} (${formatTime(state.lastCloudSyncAt)})`,',
);
fs.writeFileSync(badgePath, badge);

const finalSource = fs.readFileSync(syncPath, 'utf8');
const required = [
  "downloadCanonicalDropboxLatest",
  "LS_PENDING_DIRTY_KEYS",
  "pendingDirtyDataKeys",
  "rememberPendingDirtyDataKeys(peekDirtyDataKeys())",
  "Canonical Dropbox write verified by read-back",
  "localDeltaSatisfied",
  "pullCanonicalLatest",
  "BACKGROUND_MERGE_MS = 60 * 1000",
  "toby:canonical-sync-applied",
];
for (const token of required) {
  if (!finalSource.includes(token)) throw new Error(`multi-device hardening missing: ${token}`);
}
if (finalSource.includes("navigator.sendBeacon(\n                'https://lovable-dropbox-api.w0504124161.workers.dev/?action=upload_versioned'")) {
  throw new Error('legacy full-snapshot unload writer still present after cutover patch');
}

console.log('multi-device sync hardening patch ready');
