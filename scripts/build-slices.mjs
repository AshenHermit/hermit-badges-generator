#!/usr/bin/env node
// Builds the hermit-frame manifest and the per-region slice fragments
// from the root badge_frame.svg.
// Run via: npm run assets:build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = path.join(root, 'assets', 'templates', 'hermit-frame');
const sourcePath = path.join(templateDir, 'source.svg');
const manifestPath = path.join(templateDir, 'manifest.json');

// Constants per the frame spec.
const VIEW_BOX = { x: 251, y: 30, width: 618, height: 181 };
const HEIGHT = 181;
const PADDING = 12;
const MIN_HALF_WIDTH = 309;
const FONT = { file: 'Mansalva-Regular.ttf', size: 50, color: '#ffffff' };
const HALF_ORIGINS = { left: { x: 251, y: 30 }, right: { x: 560, y: 30 } };
const HALF_WIDTH = 309;
const CORNER = { width: 40, height: 40 };

// Region names per the manifest contract (check-assets.mjs expects 9 in halves.left).
const REGION_ORDER = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'top', 'bottom', 'left', 'right', 'center'];

function kebabName(name) {
  return name.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

function buildHalfRegions(origin, dirName) {
  const o = origin.x;
  // Region rects per half: [x, y, width, height].
  const rects = {
    topLeft: [o, 30, 40, 40],
    topRight: [o + 269, 30, 40, 40],
    bottomLeft: [o, 171, 40, 40],
    bottomRight: [o + 269, 171, 40, 40],
    top: [o + 40, 30, 229, 40],
    bottom: [o + 40, 171, 229, 40],
    left: [o, 70, 40, 101],
    right: [o + 269, 70, 40, 101],
    center: [o + 40, 70, 229, 101],
  };
  const regions = {};
  for (const name of REGION_ORDER) {
    const [x, y, width, height] = rects[name];
    regions[name] = { x, y, width, height, file: `${dirName}/${kebabName(name)}.svg` };
  }
  return regions;
}

function stripToFragment(source) {
  // Strip the XML declaration, DOCTYPE, outer <svg> and </svg>; keep the inner content.
  return source
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>/, '')
    .trim();
}

function main() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const fragment = stripToFragment(source);
  if (!fragment || fragment.includes('<svg')) {
    throw new Error('stripped fragment is empty or still contains an <svg> tag');
  }

  const halves = {};
  for (const [dirName, origin] of Object.entries(HALF_ORIGINS)) {
    halves[dirName] = {
      origin: { ...origin },
      width: HALF_WIDTH,
      corner: { ...CORNER },
      regions: buildHalfRegions(origin, dirName),
    };
  }

  const manifest = {
    id: 'hermit-frame',
    viewBox: { ...VIEW_BOX },
    height: HEIGHT,
    padding: PADDING,
    minHalfWidth: MIN_HALF_WIDTH,
    font: { ...FONT },
    halves,
  };

  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const [dirName, half] of Object.entries(halves)) {
    const halfDir = path.join(templateDir, dirName);
    fs.mkdirSync(halfDir, { recursive: true });
    for (const [name, region] of Object.entries(half.regions)) {
      fs.writeFileSync(path.join(templateDir, region.file), fragment);
    }
  }

  console.log(
    `ok: wrote ${path.relative(root, manifestPath)} and ${Object.keys(halves).length} halves x ${REGION_ORDER.length} slices`
  );
}

main();
