import fs from 'node:fs';

const hybridPath = 'src/lib/hybridSync.ts';
const workerApiPath = 'src/lib/workerApi.ts';
const financialPath = 'src/lib/financialDurability.ts';

let hybrid = fs.readFileSync(hybridPath, 'utf8');
let workerApi = fs.readFileSync(workerApiPath, 'utf8');
let financial = fs.readFileSync(financialPath, 'utf8');

// 1) beforeunload must never create a parallel full-snapshot writer.
const unloadLegacy = `        // Best-effort last sync (no UI guarantee)\n        if (this.syncState.isOnline) {\n          try {\n            const data = this.gatherAllData();\n            const dataSize = JSON.stringify(data).length;\n            if (dataSize >= 100) {\n              const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });\n              navigator.sendBeacon(\n                'https://lovable-dropbox-api.w0504124161.workers.dev/?action=upload_versioned',\n                blob\n              );\n            }\n          } catch (error) {\n            logger.error('❌ beforeunload sync prevented:', error);\n          }\n        }\n\n`;
const unloadSafe = `        // Cutover safety: never start an unauthenticated/unverified full-snapshot\n        // write from beforeunload. Local durable state is already persisted; the\n        // normal authenticated retry path will resume on the next session/online event.\n        logger.warn('⚠️ Exit blocked while cloud sync is pending; no unload snapshot upload is attempted');\n\n`;
if (hybrid.includes(unloadLegacy)) hybrid = hybrid.replace(unloadLegacy, unloadSafe);
else if (hybrid.includes('navigator.sendBeacon(')) throw new Error('unexpected beforeunload beacon shape');

// 2) Never expire tombstones from a client clock. Keep them until a future
// revision/generation-aware GC can prove every supported client is past them.
hybrid = hybrid.replace("    const TOMB_TTL_MS = 30 * 24 * 60 * 60 * 1000;\n    const nowMs = Date.now();\n", '');
hybrid = hybrid.replace("        // Drop tombstones older than TTL — safe cleanup\n        if (nowMs - latest > TOMB_TTL_MS) return;\n", "        // Cutover safety: client wall-clock age is not proof that every offline\n        // client has observed this deletion. Keep the tombstone until server/revision-aware GC exists.\n");
if (hybrid.includes('TOMB_TTL_MS') || hybrid.includes('nowMs - latest')) {
  throw new Error('legacy tombstone TTL still present');
}

// 3) Mark historical fallback explicitly so callers cannot treat it as canonical latest.
workerApi = workerApi.replace(
  'export interface WorkerResponse<T = any> {\n  success: boolean;\n  data?: T;\n  error?: string;\n}',
  'export interface WorkerResponse<T = any> {\n  success: boolean;\n  data?: T;\n  error?: string;\n  source?: \'canonical_latest\' | \'historical_fallback\';\n}',
);
workerApi = workerApi.replace(
  '          return fallback;\n        }\n        return { success: false, error: err, data };',
  "          return { ...fallback, source: 'historical_fallback' };\n        }\n        return { success: false, error: err, data };",
);
workerApi = workerApi.replace(
  '      return { success: true, data: unwrapDataEnvelope(data) };',
  "      return { success: true, data: unwrapDataEnvelope(data), source: 'canonical_latest' };",
);
workerApi = workerApi.replace(
  '      if (fallback.success) return fallback;\n      return { success: false, error: message };',
  "      if (fallback.success) return { ...fallback, source: 'historical_fallback' };\n      return { success: false, error: message };",
);
if (!workerApi.includes("source?: 'canonical_latest' | 'historical_fallback'")) throw new Error('WorkerResponse source marker missing');
if (!workerApi.includes("source: 'historical_fallback'")) throw new Error('historical fallback source marker missing');

// 4) Bootstrap may display a historical fallback for recovery, but must never
// merge it into an automatic canonical upload.
const initMarker = `      if (result && result.success && result.data) {\n        const dataKeys = Object.keys(result.data);`;
const initReplacement = `      if (result && result.success && result.data) {\n        const historicalFallback = result.source === 'historical_fallback';\n        const dataKeys = Object.keys(result.data);`;
if (hybrid.includes(initMarker)) hybrid = hybrid.replace(initMarker, initReplacement);
else if (!hybrid.includes("const historicalFallback = result.source === 'historical_fallback'")) throw new Error('init fallback marker not found');

const initUploadMarker = `          this.syncState.lastSyncTime = new Date().toISOString();\n          this.emit();\n          if (snapshot) void this.directUpload();`;
const initUploadReplacement = `          if (historicalFallback) {\n            // Historical data is recovery/read-only. Never auto-upload a merge based\n            // on it, because that could overwrite a newer canonical Dropbox object.\n            this.syncState.lastSyncTime = null;\n            this.setCloudError('HISTORICAL_FALLBACK_READ_ONLY');\n          } else {\n            this.syncState.lastSyncTime = new Date().toISOString();\n            this.emit();\n            if (snapshot) void this.directUpload();\n          }`;
if (hybrid.includes(initUploadMarker)) hybrid = hybrid.replace(initUploadMarker, initUploadReplacement);
else if (!hybrid.includes("HISTORICAL_FALLBACK_READ_ONLY")) throw new Error('init upload fallback guard marker not found');

const syncMarker = `      const remoteResult = await workerApi.downloadLatest();\n      logger.info('📥 Downloaded latest version from server');\n\n      const localData = this.gatherAllData();`;
const syncReplacement = `      const remoteResult = await workerApi.downloadLatest();\n      logger.info('📥 Downloaded latest version from server');\n\n      if (remoteResult.source === 'historical_fallback') {\n        logger.warn('⚠️ Historical Dropbox fallback is read-only; automatic merge/upload is blocked');\n        this.setCloudError('HISTORICAL_FALLBACK_READ_ONLY');\n        return false;\n      }\n\n      const localData = this.gatherAllData();`;
if (hybrid.includes(syncMarker)) hybrid = hybrid.replace(syncMarker, syncReplacement);
else if ((hybrid.match(/HISTORICAL_FALLBACK_READ_ONLY/g) || []).length < 2) throw new Error('sync fallback guard marker not found');

// 5) Financial durability remains a verifier only until the authenticated write
// gateway exists. It must not become a second full-snapshot writer.
const repairStart = financial.indexOf('      // Legacy repair remains a full-snapshot upload for now.');
const repairEndMarker = `      if (!(await remoteMatchesFinancialProjection(snapshot))) {\n        pendingFingerprint = snapshotFingerprint;\n        emitWarning('שינוי כספי הועלה אך לא הצלחנו לאמת שהעותק האחרון ב-Dropbox תואם. המערכת תנסה שוב אוטומטית.');\n        return;\n      }`;
const repairEnd = financial.indexOf(repairEndMarker, repairStart);
if (repairStart >= 0 && repairEnd >= 0) {
  const end = repairEnd + repairEndMarker.length;
  const replacement = `      // Cutover safety: this layer verifies only. A failed verification must not\n      // bypass the canonical sync gateway by uploading a full database snapshot.\n      pendingFingerprint = snapshotFingerprint;\n      emitWarning('שינוי כספי נשמר מקומית אך העותק האחרון ב-Dropbox עדיין לא אומת. לא בוצעה העלאת תיקון עוקפת; יש להשאיר את המערכת פתוחה עד שהסנכרון הרגיל יושלם.');\n      return;`;
  financial = financial.slice(0, repairStart) + replacement + financial.slice(end);
} else if (financial.includes('restoreData(snapshot, { uploadImmediately: true })')) {
  throw new Error('legacy financial repair shape changed');
}
if (financial.includes('restoreData(snapshot, { uploadImmediately: true })')) throw new Error('financial full-snapshot repair still present');

fs.writeFileSync(hybridPath, hybrid);
fs.writeFileSync(workerApiPath, workerApi);
fs.writeFileSync(financialPath, financial);

// Fail closed if any legacy writer/fallback hazard survives the patch.
const finalHybrid = fs.readFileSync(hybridPath, 'utf8');
const finalFinancial = fs.readFileSync(financialPath, 'utf8');
if (finalHybrid.includes('navigator.sendBeacon(')) throw new Error('beforeunload beacon survived');
if (finalHybrid.includes('TOMB_TTL_MS')) throw new Error('tombstone TTL survived');
if (!finalHybrid.includes("remoteResult.source === 'historical_fallback'")) throw new Error('sync fallback guard missing');
if (finalFinancial.includes('restoreData(snapshot, { uploadImmediately: true })')) throw new Error('financial bypass survived');

console.log('sync cutover legacy-writer safety patch ready');
