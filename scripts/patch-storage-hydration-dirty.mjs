import fs from 'node:fs';

const path = 'src/lib/storage.ts';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('let dirtyTrackingSuppressionDepth = 0;')) {
  source = source.replace(
    'const dirtyStorageKeys = new Set<string>();',
    'const dirtyStorageKeys = new Set<string>();\nlet dirtyTrackingSuppressionDepth = 0;',
  );
}

source = source.replace(
  "if (typeof prop === 'string') markStorageKeyDirty(prop);",
  "if (typeof prop === 'string' && dirtyTrackingSuppressionDepth === 0) markStorageKeyDirty(prop);",
);

if (!source.includes('dirtyTrackingSuppressionDepth += 1;\n  try {')) {
  const startMarker = `  let initialized = false;\n  let keysFound = 0;`;
  const startReplacement = `  dirtyTrackingSuppressionDepth += 1;\n  try {\n    let initialized = false;\n    let keysFound = 0;`;
  if (!source.includes(startMarker)) throw new Error('initializeStorage start marker not found');
  source = source.replace(startMarker, startReplacement);

  const endMarker = `  if (currentUser) {\n    sessionStorage.setItem('musicSystem_currentUser', currentUser);\n  }\n};`;
  const endReplacement = `  if (currentUser) {\n    sessionStorage.setItem('musicSystem_currentUser', currentUser);\n  }\n  } finally {\n    dirtyTrackingSuppressionDepth = Math.max(0, dirtyTrackingSuppressionDepth - 1);\n  }\n};`;
  if (!source.includes(endMarker)) throw new Error('initializeStorage end marker not found');
  source = source.replace(endMarker, endReplacement);
}

if (!source.includes("dirtyTrackingSuppressionDepth === 0") || !source.includes('finally {\n    dirtyTrackingSuppressionDepth')) {
  throw new Error('hydration dirty-tracking guard not applied');
}

fs.writeFileSync(path, source);
console.log('storage hydration no longer marks canonical load as dirty');
