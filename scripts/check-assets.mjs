#!/usr/bin/env node
// Standalone asset checker for the hermit-frame template.
// Run: npm run assets:build; node scripts/check-assets.mjs
// Exits non-zero on failure, zero when every assertion passes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = path.join(root, 'assets', 'templates', 'hermit-frame');
const manifestPath = path.join(templateDir, 'manifest.json');

const EXPECTED_HALVES = {
  left: { file: 'left-half.svg', viewBox: '251 30 309 181' },
  right: { file: 'right-half.svg', viewBox: '560 30 309 181' },
};

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
  fail(`manifest id is ${JSON.stringify(manifest.id)}, expected "hermit-frame"`);
}
if (manifest.height !== 181) {
  fail(`manifest height is ${JSON.stringify(manifest.height)}, expected 181`);
}
if (manifest.padding !== 12) {
  fail(`manifest padding is ${JSON.stringify(manifest.padding)}, expected 12`);
}
if (manifest.minHalfWidth !== 309) {
  fail(`manifest minHalfWidth is ${JSON.stringify(manifest.minHalfWidth)}, expected 309`);
}
if (manifest.font?.size !== 50) {
  fail(`manifest font.size is ${JSON.stringify(manifest.font?.size)}, expected 50`);
}

const halves = manifest.halves || {};
for (const [side, expected] of Object.entries(EXPECTED_HALVES)) {
  const half = halves[side];
  if (!half) {
    fail(`halves.${side} missing`);
    continue;
  }
  if (half.file !== expected.file) {
    fail(`halves.${side}.file is ${JSON.stringify(half.file)}, expected "${expected.file}"`);
  }
  if ('regions' in half) {
    fail(`halves.${side}.regions is stale; manifest must describe geometry only`);
  }

  const file = path.resolve(templateDir, String(half.file));
  if (!fs.existsSync(file)) {
    fail(`${side}: file missing: ${rel(file)}`);
    continue;
  }
  const stat = fs.statSync(file);
  if (stat.size === 0) {
    fail(`${side}: file is empty: ${rel(file)}`);
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  const svgTags = content.match(/<svg\b/g) || [];
  if (svgTags.length !== 1) {
    fail(`${side}: expected exactly one <svg> tag, found ${svgTags.length}: ${rel(file)}`);
  }
  if (!content.startsWith('<svg')) {
    fail(`${side}: file is not a single-root <svg> document: ${rel(file)}`);
  }
  if (!content.trimEnd().endsWith('</svg>')) {
    fail(`${side}: file has no closing </svg>: ${rel(file)}`);
  }
  const viewBox = content.match(/<svg\b[^>]*\bviewBox="([^"]*)"/)?.[1];
  if (viewBox !== expected.viewBox) {
    fail(`${side}: viewBox is ${JSON.stringify(viewBox)}, expected "${expected.viewBox}"`);
  }
}

for (const dirName of ['left', 'right']) {
  const dir = path.join(templateDir, dirName);
  if (fs.existsSync(dir)) {
    fail(`obsolete slice directory still exists: ${rel(dir)}`);
  }
}

if (failures === 0) {
  console.log('ok: hermit-frame asset check passed');
}
process.exit(failures === 0 ? 0 : 1);
