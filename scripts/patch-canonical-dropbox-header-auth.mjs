import fs from 'node:fs';

const workerApiPath = 'src/lib/workerApi.ts';
const uploadWorkerPath = 'src/lib/syncUploadWorker.ts';
let workerApi = fs.readFileSync(workerApiPath, 'utf8');
let uploadWorker = fs.readFileSync(uploadWorkerPath, 'utf8');

// The live Dropbox Worker preflight verified X-Sonata-Manager-Code header
// handling for the canonical download_latest and upload_versioned operations.
// Remove the credential from URL/query strings for those two operations only.
const canonicalUrlHelper = `const buildCanonicalWorkerUrl = (action: 'download_latest' | 'upload_versioned') => {
  const params = new URLSearchParams({ action });
  return \`${'${WORKER_BASE_URL}'}?${'${params.toString()}'}\`;
};

`;
const helperAnchor = 'const getWorkerError = (data: any, fallback = "Worker request failed") => {';
if (!workerApi.includes('const buildCanonicalWorkerUrl =')) {
  if (!workerApi.includes(helperAnchor)) throw new Error('workerApi helper anchor missing');
  workerApi = workerApi.replace(helperAnchor, canonicalUrlHelper + helperAnchor);
}

workerApi = workerApi.replace('fetch(buildWorkerUrl("download_latest"), {', 'fetch(buildCanonicalWorkerUrl("download_latest"), {');
workerApi = workerApi.replace('fetch(buildWorkerUrl("upload_versioned"), {', 'fetch(buildCanonicalWorkerUrl("upload_versioned"), {');

if (!workerApi.includes('fetch(buildCanonicalWorkerUrl("download_latest"), {')) throw new Error('download_latest canonical URL patch missing');
if (!workerApi.includes('fetch(buildCanonicalWorkerUrl("upload_versioned"), {')) throw new Error('upload_versioned canonical URL patch missing');

// Off-main-thread upload path must match the same live-verified contract.
uploadWorker = uploadWorker.replace(
  `    const params = new URLSearchParams({\n      action: 'upload_versioned',\n      managerCode: managerCode || '',\n    });`,
  `    const params = new URLSearchParams({\n      action: 'upload_versioned',\n    });`,
);
if (/new URLSearchParams\(\{[\s\S]{0,120}action: 'upload_versioned',[\s\S]{0,120}managerCode/.test(uploadWorker)) {
  throw new Error('upload worker still puts managerCode in canonical query');
}
if (!uploadWorker.includes("'X-Sonata-Manager-Code': managerCode || ''")) {
  throw new Error('upload worker canonical auth header missing');
}

fs.writeFileSync(workerApiPath, workerApi);
fs.writeFileSync(uploadWorkerPath, uploadWorker);

// Fail closed: the specific canonical call sites must use the credential-free
// query helper while retaining the authentication header.
const finalApi = fs.readFileSync(workerApiPath, 'utf8');
const canonicalHelper = finalApi.match(/const buildCanonicalWorkerUrl[\s\S]*?\n};/)?.[0] || '';
if (/managerCode/.test(canonicalHelper)) throw new Error('canonical helper leaks managerCode in query');
if (!finalApi.includes('"X-Sonata-Manager-Code": getManagerCode()')) throw new Error('canonical manager header unavailable');

console.log('canonical Dropbox header-only auth patch ready');
