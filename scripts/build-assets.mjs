#!/usr/bin/env node
// Builds the hermit-frame manifest and the two whole-half SVG images
// from source.svg.
// Run via: npm run assets:build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = path.join(root, 'assets', 'templates', 'hermit-frame');
const sourcePath = path.join(templateDir, 'source.svg');
const manifestPath = path.join(templateDir, 'manifest.json');

// Constants per the frame spec.
const HEIGHT = 181;
const BORDER_SIDES = { top: 40, right: 40, bottom: 40, left: 40 };
const PADDING_SIDES = { top: 12, right: 12, bottom: 12, left: 12 };
const MIN_HALF_WIDTH = 309;
const FONT = { file: 'Mansalva-Regular.ttf', size: 50, color: '#ffffff' };
const HALF_ORIGINS = { left: { x: 251, y: 30 }, right: { x: 560, y: 30 } };
const HALF_WIDTH = 309;

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
  for (const [side, origin] of Object.entries(HALF_ORIGINS)) {
    halves[side] = {
      origin: { ...origin },
      width: HALF_WIDTH,
      file: `${side}-half.svg`,
    };
  }

  const manifest = {
    id: 'hermit-frame',
    height: HEIGHT,
    border: {
      slice: { ...BORDER_SIDES },
      width: { ...BORDER_SIDES },
    },
    padding: { ...PADDING_SIDES },
    minHalfWidth: MIN_HALF_WIDTH,
    font: { ...FONT },
    halves,
  };

  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const [side, half] of Object.entries(halves)) {
    const { x, y } = half.origin;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${HALF_WIDTH}" height="${HEIGHT}" viewBox="${x} ${y} ${HALF_WIDTH} ${HEIGHT}">${fragment}</svg>\n`;
    fs.writeFileSync(path.join(templateDir, half.file), svg);
  }

  // Slices from the old build are no longer consumed; drop them entirely.
  for (const dirName of Object.keys(HALF_ORIGINS)) {
    fs.rmSync(path.join(templateDir, dirName), { recursive: true, force: true });
  }

  console.log(`ok: wrote ${path.relative(root, manifestPath)} and ${Object.keys(halves).length} whole halves`);
}

main();
