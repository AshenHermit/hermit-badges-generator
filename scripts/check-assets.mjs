#!/usr/bin/env node
// Standalone asset checker for the hermit-frame template.
// Run: npm run assets:build; node scripts/check-assets.mjs
// Exits non-zero on failure, zero when every assertion passes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'assets', 'templates', 'hermit-frame', 'manifest.json');

const EXPECTED_LEFT_REGIONS = [
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight',
  'top',
  'bottom',
  'left',
  'right',
  'center',
];

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL: ${msg}`);
};

const rel = (p) => path.relative(root, p);

if (!fs.existsSync(manifestPath)) {
  fail(`manifest missing: ${rel(manifestPath)}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  fail(`manifest unreadable: ${rel(manifestPath)} (${err.message})`);
  process.exit(1);
}

if (manifest.id !== 'hermit-frame') {
  fail(`manifest id is ${JSON.stringify(manifest.id)}, expected "herit-frame"`);
}

const halves = manifest.halves || {};
const leftRegions = halves.left && halves.left.regions;
const leftKeys = leftRegions ? Object.keys(leftRegions) : [];
const sorted = (a) => [...a].sort();
if (JSON.stringify(sorted(leftKeys)) !== JSON.stringify(sorted(EXPECTED_LEFT_REGIONS))) {
  fail(
    `halves.left.regions has ${leftKeys.length} keys [${leftKeys.join(', ')}]; expected exactly ${EXPECTED_LEFT_REGIONS.length} [${EXPECTED_LEFT_REGIONS.join(', ')}]`
  );
}

// Every referenced slice file must exist, be non-empty, and contain no <svg tag.
for (const [half, halfObj] of Object.entries(halves)) {
  const regions = halfObj && halfObj.regions;
  for (const [regionName, region] of Object.entries(regions || {})) {
    const file = path.resolve(path.dirname(manifestPath), region.file);
    if (!fs.existsSync(file)) {
      fail(`${half}/${regionName}: file missing: ${rel(file)}`);
      continue;
    }
    const stat = fs.statSync(file);
    if (stat.size === 0) {
      fail(`${half}/${regionName}: file is empty: ${rel(file)}`);
    }
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('<svg')) {
      fail(`${half}/${regionName}: slice file contains "<svg": ${rel(file)}`);
    }
  }
}

if (failures === 0) {
  console.log(`ok: hermit-frame asset check passed (${leftKeys.length} regions in halves.left)`);
}
process.exit(failures === 0 ? 0 : 1);
