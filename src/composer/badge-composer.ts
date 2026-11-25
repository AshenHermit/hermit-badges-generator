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

function halfWidthOf(style: StyleDefinition, textWidth: number): number {
  const { width } = style.border;
  return Math.max(
    style.minHalfWidth,
    width.left + width.right + textWidth + style.padding.left + style.padding.right,
  );
}

function windowsOf(
  half: HalfDefinition,
  style: StyleDefinition,
  halfWidthPx: number,
  halfOffsetX: number,
): Record<RegionKey, Window> {
  const { slice, width } = style.border;
  const nativeRightX = half.width - slice.right;
  const nativeBottomY = style.height - slice.bottom;
  const nativeSpanW = half.width - slice.left - slice.right;
  const nativeSpanH = style.height - slice.top - slice.bottom;
  const rightX = halfOffsetX + halfWidthPx - width.right;
  const bottomY = style.height - width.bottom;
  const spanW = halfWidthPx - width.left - width.right;
  const spanH = style.height - width.top - width.bottom;
  const bandX = halfOffsetX + width.left;
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
    topLeft: window(0, 0, slice.left, slice.top, halfOffsetX, 0, width.left, width.top),
    topRight: window(nativeRightX, 0, slice.right, slice.top, rightX, 0, width.right, width.top),
    bottomLeft: window(
      0,
      nativeBottomY,
      slice.left,
      slice.bottom,
      halfOffsetX,
      bottomY,
      width.left,
      width.bottom,
    ),
    bottomRight: window(
      nativeRightX,
      nativeBottomY,
      slice.right,
      slice.bottom,
      rightX,
      bottomY,
      width.right,
      width.bottom,
    ),
    top: window(slice.left, 0, nativeSpanW, slice.top, bandX, 0, spanW, width.top),
    bottom: window(
      slice.left,
      nativeBottomY,
      nativeSpanW,
      slice.bottom,
      bandX,
      bottomY,
      spanW,
      width.bottom,
    ),
    left: window(0, slice.top, slice.left, nativeSpanH, halfOffsetX, width.top, width.left, spanH),
    right: window(
      nativeRightX,
      slice.top,
      slice.right,
      nativeSpanH,
      rightX,
      width.top,
      width.right,
      spanH,
    ),
    center: window(slice.left, slice.top, nativeSpanW, nativeSpanH, bandX, width.top, spanW, spanH),
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
  style: StyleDefinition,
  layout: TextLayout,
  halfWidthPx: number,
  halfOffsetX: number,
): string {
  const { width } = style.border;
  const spanW = halfWidthPx - width.left - width.right;
  const spanH = style.height - width.top - width.bottom;
  const x =
    halfOffsetX +
    width.left +
    style.padding.left +
    (spanW - style.padding.left - style.padding.right - layout.width) / 2;
  const baselineY = width.top + spanH / 2 + (layout.ascenderPx + layout.descenderPx) / 2;
  return `<path d="${layout.path}" transform="translate(${x}, ${baselineY})" fill="${style.font.color}"/>`;
}

export class BadgeComposer {
  static compose(style: StyleDefinition, left: string, right: string): string {
    const leftLayout = TextShaper.layout(left, style.font);
    const rightLayout = TextShaper.layout(right, style.font);
    const leftHalfWidth = halfWidthOf(style, leftLayout.width);
    const rightHalfWidth = halfWidthOf(style, rightLayout.width);
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
      renderText(style, leftLayout, leftHalfWidth, 0) +
      renderText(style, rightLayout, rightHalfWidth, leftHalfWidth);
    const width = leftHalfWidth + rightHalfWidth;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${style.height}" viewBox="0 0 ${width} ${style.height}">` +
      `<defs>${leftFrame.defs}${rightFrame.defs}</defs>` +
      `${leftFrame.rects}${rightFrame.rects}${texts}</svg>`;
  }
}
