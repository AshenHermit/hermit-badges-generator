import * as fs from 'fs';
import * as path from 'path';
import {
  HalfDefinition,
  RegionName,
  SliceRegion,
  StyleDefinition,
} from '../styles/style-definition';
import { TextLayout, TextShaper } from './text-shaper';
import { tileSpan } from './nine-slice';

const TEMPLATES_DIR = path.resolve(process.cwd(), 'assets/templates');

const REGION_ORDER: RegionName[] = [
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight',
  'top',
  'left',
  'center',
  'right',
  'bottom',
];

const CORNER_REGIONS = new Set<RegionName>(['topLeft', 'topRight', 'bottomLeft', 'bottomRight']);

function isCorner(name: RegionName): boolean {
  return CORNER_REGIONS.has(name);
}

function halfWidthOf(half: HalfDefinition, style: StyleDefinition, textWidth: number): number {
  return Math.max(style.minHalfWidth, 2 * half.corner.width + textWidth + 2 * style.padding);
}

function sliceFragment(styleId: string, file: string): string {
  return fs.readFileSync(path.resolve(TEMPLATES_DIR, styleId, file), 'utf8');
}

function renderCorner(style: StyleDefinition, region: SliceRegion, x: number, y: number): string {
  return `<svg x="${x}" y="${y}" width="${region.width}" height="${region.height}" viewBox="${region.x} ${region.y} ${region.width} ${region.height}">${sliceFragment(
    style.id,
    region.file,
  )}</svg>`;
}

function renderElastic(
  style: StyleDefinition,
  half: HalfDefinition,
  name: RegionName,
  region: SliceRegion,
  cornerW: number,
  spanW: number,
  spanH: number,
  halfOffsetX: number,
): string {
  const cornerH = half.corner.height;
  let vpX: number;
  let vpY: number;
  let vpW: number;
  let vpH: number;
  if (name === 'top' || name === 'bottom') {
    vpX = halfOffsetX + cornerW;
    vpY = region.y - style.viewBox.y;
    vpW = spanW;
    vpH = cornerH;
  } else if (name === 'left' || name === 'right') {
    vpX = halfOffsetX;
    vpY = cornerH;
    vpW = cornerW;
    vpH = spanH;
  } else {
    vpX = halfOffsetX + cornerW;
    vpY = cornerH;
    vpW = spanW;
    vpH = spanH;
  }
  const tileW = region.width;
  const tileH = region.height;
  const tiles: string[] = [];
  const xCount = tileSpan(vpW, tileW);
  const yCount = tileSpan(vpH, tileH);
  for (let j = 0; j < yCount; j++) {
    for (let i = 0; i < xCount; i++) {
      tiles.push(
        `<svg x="${i * tileW}" y="${j * tileH}" width="${tileW}" height="${tileH}" viewBox="${region.x} ${region.y} ${tileW} ${tileH}">${sliceFragment(
          style.id,
          region.file,
        )}</svg>`,
      );
    }
  }
  return `<svg x="${vpX}" y="${vpY}" width="${vpW}" height="${vpH}" viewBox="0 0 ${vpW} ${vpH}">${tiles.join('')}</svg>`;
}

function renderHalf(
  half: HalfDefinition,
  style: StyleDefinition,
  halfWidthPx: number,
  halfOffsetX: number,
): string {
  const cornerW = half.corner.width;
  const cornerH = half.corner.height;
  const spanW = halfWidthPx - 2 * cornerW;
  const spanH = style.height - 2 * cornerH;
  const parts: string[] = [];
  for (const name of REGION_ORDER) {
    const region = half.regions[name];
    if (isCorner(name)) {
      const x =
        name === 'topLeft' || name === 'bottomLeft'
          ? halfOffsetX
          : halfOffsetX + halfWidthPx - cornerW;
      const y =
        name === 'bottomLeft' || name === 'bottomRight'
          ? style.height - cornerH
          : region.y - style.viewBox.y;
      parts.push(renderCorner(style, region, x, y));
    } else {
      parts.push(
        renderElastic(style, half, name, region, cornerW, spanW, spanH, halfOffsetX),
      );
    }
  }
  return parts.join('');
}

function renderText(
  half: HalfDefinition,
  style: StyleDefinition,
  layout: TextLayout,
  halfWidthPx: number,
  halfOffsetX: number,
): string {
  const cornerW = half.corner.width;
  const cornerH = half.corner.height;
  const spanW = halfWidthPx - 2 * cornerW;
  const spanH = style.height - 2 * cornerH;
  const x = cornerW + style.padding + (spanW - 2 * style.padding - layout.width) / 2 + halfOffsetX;
  const baselineY = cornerH + spanH / 2 + (layout.ascenderPx + layout.descenderPx) / 2;
  return `<path d="${layout.path}" transform="translate(${x}, ${baselineY})" fill="${style.font.color}"/>`;
}

export class BadgeComposer {
  static compose(style: StyleDefinition, left: string, right: string): string {
    const leftLayout = TextShaper.layout(left, style.font);
    const rightLayout = TextShaper.layout(right, style.font);
    const leftHalfWidth = halfWidthOf(style.halves.left, style, leftLayout.width);
    const rightHalfWidth = halfWidthOf(style.halves.right, style, rightLayout.width);
    const backgrounds =
      renderHalf(style.halves.left, style, leftHalfWidth, 0) +
      renderHalf(style.halves.right, style, rightHalfWidth, leftHalfWidth);
    const texts =
      renderText(style.halves.left, style, leftLayout, leftHalfWidth, 0) +
      renderText(style.halves.right, style, rightLayout, rightHalfWidth, leftHalfWidth);
    const width = leftHalfWidth + rightHalfWidth;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${style.height}" viewBox="0 0 ${width} ${style.height}">${backgrounds}${texts}</svg>`;
  }
}
