import * as fs from 'fs';
import * as path from 'path';
import { HalfDefinition, StyleDefinition } from '../styles/style-definition';
import { TextLayout, TextShaper } from './text-shaper';

const TEMPLATES_DIR = path.resolve(process.cwd(), 'assets/templates');
const fragmentCache = new Map<string, string>();

type RegionKey =
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'center';

const REGION_ORDER: RegionKey[] = [
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

interface Window {
  nativeX: number;
  nativeY: number;
  nativeWidth: number;
  nativeHeight: number;
  rectX: number;
  rectY: number;
  rectWidth: number;
  rectHeight: number;
}

function dataUri(styleId: string, file: string): string {
  const filePath = path.resolve(TEMPLATES_DIR, styleId, file);
  let raw = fragmentCache.get(filePath);
  if (raw === undefined) {
    raw = fs.readFileSync(filePath, 'utf8');
    fragmentCache.set(filePath, raw);
  }
  return `data:image/svg+xml;base64,${Buffer.from(raw).toString('base64')}`;
}

function halfWidthOf(half: HalfDefinition, style: StyleDefinition, textWidth: number): number {
  return Math.max(style.minHalfWidth, 2 * half.corner.width + textWidth + 2 * style.padding);
}

function windowsOf(
  half: HalfDefinition,
  style: StyleDefinition,
  halfWidthPx: number,
  halfOffsetX: number,
): Record<RegionKey, Window> {
  const cornerW = half.corner.width;
  const cornerH = half.corner.height;
  const nativeRightX = half.width - cornerW;
  const nativeBottomY = style.height - cornerH;
  const nativeSpanW = half.width - 2 * cornerW;
  const nativeSpanH = style.height - 2 * cornerH;
  const spanW = halfWidthPx - 2 * cornerW;
  const rightX = halfOffsetX + halfWidthPx - cornerW;
  const window = (
    nativeX: number,
    nativeY: number,
    nativeWidth: number,
    nativeHeight: number,
    rectX: number,
    rectY: number,
    rectWidth: number,
    rectHeight: number,
  ): Window => ({ nativeX, nativeY, nativeWidth, nativeHeight, rectX, rectY, rectWidth, rectHeight });

  return {
    topLeft: window(0, 0, cornerW, cornerH, halfOffsetX, 0, cornerW, cornerH),
    topRight: window(nativeRightX, 0, cornerW, cornerH, rightX, 0, cornerW, cornerH),
    bottomLeft: window(0, nativeBottomY, cornerW, cornerH, halfOffsetX, nativeBottomY, cornerW, cornerH),
    bottomRight: window(nativeRightX, nativeBottomY, cornerW, cornerH, rightX, nativeBottomY, cornerW, cornerH),
    top: window(cornerW, 0, nativeSpanW, cornerH, halfOffsetX + cornerW, 0, spanW, cornerH),
    bottom: window(
      cornerW,
      nativeBottomY,
      nativeSpanW,
      cornerH,
      halfOffsetX + cornerW,
      nativeBottomY,
      spanW,
      cornerH,
    ),
    left: window(0, cornerH, cornerW, nativeSpanH, halfOffsetX, cornerH, cornerW, nativeSpanH),
    right: window(nativeRightX, cornerH, cornerW, nativeSpanH, rightX, cornerH, cornerW, nativeSpanH),
    center: window(
      cornerW,
      cornerH,
      nativeSpanW,
      nativeSpanH,
      halfOffsetX + cornerW,
      cornerH,
      spanW,
      nativeSpanH,
    ),
  };
}

function renderHalf(
  half: HalfDefinition,
  style: StyleDefinition,
  halfWidthPx: number,
  halfOffsetX: number,
  uri: string,
  idOffset: number,
): { defs: string; rects: string } {
  const windows = windowsOf(half, style, halfWidthPx, halfOffsetX);
  const defs: string[] = [];
  const rects: string[] = [];
  for (const name of REGION_ORDER) {
    const region = windows[name];
    const id = `p${idOffset + rects.length}`;
    defs.push(
      `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${region.rectX}" y="${region.rectY}" width="${region.nativeWidth}" height="${region.nativeHeight}">` +
        `<image href="${uri}" x="${-region.nativeX}" y="${-region.nativeY}" width="${half.width}" height="${style.height}"/>` +
        `</pattern>`,
    );
    rects.push(
      `<rect x="${region.rectX}" y="${region.rectY}" width="${region.rectWidth}" height="${region.rectHeight}" fill="url(#${id})"/>`,
    );
  }
  return { defs: defs.join(''), rects: rects.join('') };
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
    const leftFrame = renderHalf(
      style.halves.left,
      style,
      leftHalfWidth,
      0,
      dataUri(style.id, style.halves.left.file),
      0,
    );
    const rightFrame = renderHalf(
      style.halves.right,
      style,
      rightHalfWidth,
      leftHalfWidth,
      dataUri(style.id, style.halves.right.file),
      9,
    );
    const texts =
      renderText(style.halves.left, style, leftLayout, leftHalfWidth, 0) +
      renderText(style.halves.right, style, rightLayout, rightHalfWidth, leftHalfWidth);
    const width = leftHalfWidth + rightHalfWidth;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${style.height}" viewBox="0 0 ${width} ${style.height}">` +
      `<defs>${leftFrame.defs}${rightFrame.defs}</defs>` +
      `${leftFrame.rects}${rightFrame.rects}${texts}</svg>`;
  }
}
