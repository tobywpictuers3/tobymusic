import fs from 'node:fs';

const path = 'src/lib/workerApi.ts';
let source = fs.readFileSync(path, 'utf8');

const replacements = [
  [
    `      logger.info("Uploading attachment:", {\n        name: file.name,\n        size: file.size,\n        type: file.type,\n      });\n\n`,
    `      logger.info("Uploading attachment");\n\n`,
  ],
  [
    `      logger.info("Attachment uploaded (raw):", result);\n\n`,
    ``,
  ],
  [
    `      logger.info("Attachment uploaded (normalized):", normalized);\n\n`,
    `      logger.info("Attachment uploaded successfully");\n\n`,
  ],
  [
    `      logger.info("Attachment deleted:", data);\n`,
    `      logger.info("Attachment deleted successfully");\n`,
  ],
  [
    `      logger.info("listVersions success:", unwrapped);\n`,
    `      logger.info("listVersions succeeded");\n`,
  ],
  [
    '              logger.info(`✅ Fallback succeeded with version ${version.path}`);\n',
    '              logger.info("✅ Historical fallback candidate loaded successfully");\n',
  ],
  [
    '          logger.warn(`⚠️ Fallback version ${version.path} failed:`, e);\n',
    '          logger.warn("⚠️ Historical fallback candidate failed");\n',
  ],
];

for (const [from, to] of replacements) {
  if (source.includes(from)) source = source.replace(from, to);
}

const forbidden = [
  'name: file.name',
  'Attachment uploaded (raw):',
  'Attachment uploaded (normalized):',
  'Attachment deleted:", data',
  'listVersions success:", unwrapped',
  'version ${version.path}',
];
for (const marker of forbidden) {
  if (source.includes(marker)) throw new Error(`PII-heavy Worker API log survived: ${marker}`);
}

fs.writeFileSync(path, source);
console.log('Worker API privacy logging patch ready');
