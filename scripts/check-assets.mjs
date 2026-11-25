#!/usr/bin/env node
// Standalone asset checker for the editable hermit-frame template.
// Run: npm run assets:build; node scripts/check-assets.mjs
// Exits non-zero on failure, zero when every assertion passes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = path.join(root, 'assets', 'templates', 'hermit-frame');
const templatePath = path.join(templateDir, 'template.html');

// The four verbatim CSS groups from the approved Global Constraints.
const REQUIRED_CSS = [
  {
    label: '.github-badge font family and panel face',
    snippets: ['.github-badge { font-family: "Lipstick Rage", sans-serif; --panel-face: #808080; }'],
  },
  {
    label: '.badge-left-part border image and padding',
    snippets: ['border-image: url("./left-half.svg") 66 10 48 53 fill / 66px 10px 48px 53px repeat; padding: 49px 20px 41px 53px;'],
  },
  {
    label: '.badge-right-part border image and padding',
    snippets: ['border-image: url("./right-half.svg") 66 53 48 25 fill / 66px 53px 48px 25px repeat; padding: 49px 68px 41px 35px;'],
  },
  {
    label: 'wrapper layout and body text',
    snippets: [
      'display:flex; width:fit-content; box-sizing:border-box',
      '#e8e6df',
      'line-height:1.625',
    ],
  },
];

const REQUIRED_ASSETS = [
  path.join(templateDir, 'left-half.svg'),
  path.join(templateDir, 'right-half.svg'),
  path.join(root, 'assets', 'fonts', 'Lipstick-Rage.ttf'),
];

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL: ${msg}`);
};
const rel = (p) => path.relative(root, p);

if (!fs.existsSync(templatePath)) {
  fail(`template missing: ${rel(templatePath)}`);
  process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf8');

for (const placeholder of ['{{LEFT}}', '{{RIGHT}}']) {
  const count = template.split(placeholder).length - 1;
  if (count !== 1) {
    fail(`placeholder ${placeholder} appears ${count} times, expected exactly once`);
  }
}

for (const group of REQUIRED_CSS) {
  for (const snippet of group.snippets) {
    if (!template.includes(snippet)) {
      fail(`CSS missing (${group.label}): ${snippet}`);
    }
  }
}

for (const asset of REQUIRED_ASSETS) {
  if (!fs.existsSync(asset)) {
    fail(`asset missing: ${rel(asset)}`);
    continue;
  }
  if (fs.statSync(asset).size === 0) {
    fail(`asset is empty: ${rel(asset)}`);
  }
}

if (failures === 0) {
  console.log('ok: hermit-frame template and assets check passed');
}
process.exit(failures === 0 ? 0 : 1);
