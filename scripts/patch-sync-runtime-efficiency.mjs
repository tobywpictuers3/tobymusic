import fs from 'node:fs';

const path = 'src/lib/hybridSync.ts';
let source = fs.readFileSync(path, 'utf8');

source = source.replace(
  "  private readonly BACKGROUND_MERGE_MS = 3 * 60 * 1000; // 3 minutes",
  "  private readonly BACKGROUND_MERGE_MS = 10 * 60 * 1000; // 10-minute safety reconciliation",
);

if (!source.includes('BACKGROUND_MERGE_MS = 10 * 60 * 1000')) {
  throw new Error('background merge interval patch failed');
}

if (!source.includes('private lastVisibilityReconcileAt = 0;')) {
  source = source.replace(
    '  private backgroundMergeInterval: ReturnType<typeof setInterval> | null = null;\n',
    '  private backgroundMergeInterval: ReturnType<typeof setInterval> | null = null;\n  private lastVisibilityReconcileAt = 0;\n  private readonly VISIBILITY_RECONCILE_STALE_MS = 5 * 60 * 1000;\n',
  );
}

if (!source.includes('this.setupVisibilityReconcile();')) {
  source = source.replace(
    '    this.startOfflineRetry();\n    this.startBackgroundMergeSync();',
    '    this.startOfflineRetry();\n    this.setupVisibilityReconcile();\n    this.startBackgroundMergeSync();',
  );
}

if (!source.includes('private setupVisibilityReconcile()')) {
  const marker = '  private startBackgroundMergeSync() {';
  const method = `  private setupVisibilityReconcile() {\n    const maybeReconcile = () => {\n      if (isDevMode()) return;\n      if (document.visibilityState !== 'visible') return;\n      if (!this.syncState.isOnline || this.isSyncingInternal || this.uploadInFlight) return;\n      if (this.debounceTimer !== null || this.syncState.pendingChanges > 0) return;\n\n      const lastCloudMs = this.syncState.lastCloudSyncAt\n        ? new Date(this.syncState.lastCloudSyncAt).getTime()\n        : 0;\n      const now = Date.now();\n      if (Number.isFinite(lastCloudMs) && now - lastCloudMs < this.VISIBILITY_RECONCILE_STALE_MS) return;\n      if (now - this.lastVisibilityReconcileAt < 60_000) return;\n\n      this.lastVisibilityReconcileAt = now;\n      void this.syncToWorker();\n    };\n\n    document.addEventListener('visibilitychange', maybeReconcile);\n    window.addEventListener('focus', maybeReconcile);\n  }\n\n`;
  if (!source.includes(marker)) throw new Error('visibility reconcile insertion marker missing');
  source = source.replace(marker, method + marker);
}

if (!source.includes('private stableSyncFingerprint(')) {
  const marker = '  private async syncToWorker(): Promise<boolean> {';
  const helper = `  private stableSyncFingerprint(value: any): string {\n    const normalize = (input: any, topLevel = false): any => {\n      if (Array.isArray(input)) return input.map(item => normalize(item, false));\n      if (!input || typeof input !== 'object') return input;\n      const out: Record<string, any> = {};\n      for (const key of Object.keys(input).sort()) {\n        if (topLevel && key === 'timestamp') continue;\n        out[key] = normalize(input[key], false);\n      }\n      return out;\n    };\n    return JSON.stringify(normalize(value, true));\n  }\n\n`;
  if (!source.includes(marker)) throw new Error('sync helper insertion marker missing');
  source = source.replace(marker, helper + marker);
}

if (!source.includes('No remote delta detected; skipping redundant upload')) {
  const marker = `      const remoteData = remoteResult.success && this.hasValidDataShape(remoteResult.data)\n        ? remoteResult.data\n        : {};\n      const mergedData = this.mergeDataWithConflictResolution(localData, remoteData);`;
  const replacement = `      const remoteData = remoteResult.success && this.hasValidDataShape(remoteResult.data)\n        ? remoteResult.data\n        : {};\n\n      if (remoteResult.success && this.hasValidDataShape(remoteData) &&\n          this.stableSyncFingerprint(localData) === this.stableSyncFingerprint(remoteData)) {\n        this.setCloudSuccessNow();\n        logger.info('✅ No remote delta detected; skipping redundant upload');\n        return true;\n      }\n\n      const mergedData = this.mergeDataWithConflictResolution(localData, remoteData);`;
  if (!source.includes(marker)) throw new Error('redundant upload guard marker missing');
  source = source.replace(marker, replacement);
}

fs.writeFileSync(path, source);

const finalSource = fs.readFileSync(path, 'utf8');
if (!finalSource.includes('BACKGROUND_MERGE_MS = 10 * 60 * 1000')) throw new Error('10-minute safety reconcile missing');
if (!finalSource.includes('setupVisibilityReconcile')) throw new Error('visibility reconcile missing');
if (!finalSource.includes('skipping redundant upload')) throw new Error('redundant upload guard missing');

console.log('sync runtime efficiency patch ready');
