import { StyleRegistry } from '../styles/style.registry';
import { StyleDefinition } from '../styles/style-definition';
import { TextShaper } from './text-shaper';
import { tileSpan } from './nine-slice';
import { BadgeComposer } from './badge-composer';

describe('BadgeComposer', () => {
  const style: StyleDefinition = new StyleRegistry().get('hermit-frame');
  const font = style.font;

  function extractElementInner(output: string, openTagEnd: number): string {
    let depth = 1;
    let i = openTagEnd;
    while (depth > 0 && i < output.length) {
      const nextClose = output.indexOf('</svg>', i);
      if (nextClose === -1) break;
      const nextOpen = output.indexOf('<svg', i);
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 4;
      } else {
        depth -= 1;
        i = nextClose + 6;
      }
    }
    return output.slice(openTagEnd, i - 6);
  }

  it('starts with <svg and has width="240" height="181" for empty text at min width', () => {
    const output = BadgeComposer.compose(style, '', '');
    expect(output.startsWith('<svg')).toBe(true);
    expect(output).toContain('width="240"');
    expect(output).toContain('height="181"');
  });

  it('emits the top-left corner viewBox exactly once', () => {
    const output = BadgeComposer.compose(style, '', '');
    expect(output.split('viewBox="251 30 40 40"').length - 1).toBe(1);
  });

  it('tiles the top edge of the left half for long text and contains no scale()', () => {
    const longText = 'This is a deliberately long left label for BadgeComposer';
    const layout = TextShaper.layout(longText, font);
    const cornerW = style.halves.left.corner.width;
    const halfWidth = Math.max(style.minHalfWidth, 2 * cornerW + layout.width + 2 * style.padding);
    expect(halfWidth).toBeGreaterThan(style.minHalfWidth);
    const spanW = halfWidth - 2 * cornerW;
    const output = BadgeComposer.compose(style, longText, 'right');
    const parentMatch = output.match(
      /<svg x="[\d.-]+" y="[\d.-]+" width="[\d.-]+" height="[\d.-]+" viewBox="0 0 [\d.]+ [\d.]+">/,
    );
    expect(parentMatch).not.toBeNull();
    const inner = extractElementInner(output, (parentMatch?.index ?? -1) + (parentMatch?.[0].length ?? 0));
    const tiles = inner.match(/<svg /g);
    expect(tiles?.length).toBe(tileSpan(spanW, style.halves.left.regions.top.width));
    expect(output).not.toContain('scale(');
  });

  it('anchors corners at the half edges and keeps them within the badge width', () => {
    const output = BadgeComposer.compose(style, '', '');
    const left = style.halves.left;
    const right = style.halves.right;
    const leftHalfWidth = Math.max(style.minHalfWidth, 2 * left.corner.width + 0 + 2 * style.padding);
    const width =
      leftHalfWidth + Math.max(style.minHalfWidth, 2 * right.corner.width + 0 + 2 * style.padding);
    expect(width).toBe(240);
    const leftTR = left.regions.topRight;
    expect(output).toContain(
      `<svg x="${leftHalfWidth - left.corner.width}" y="0" width="${leftTR.width}" height="${leftTR.height}" viewBox="${leftTR.x} ${leftTR.y} ${leftTR.width} ${leftTR.height}">`,
    );
    const rightTL = right.regions.topLeft;
    expect(output).toContain(
      `<svg x="${leftHalfWidth}" y="0" width="${rightTL.width}" height="${rightTL.height}" viewBox="${rightTL.x} ${rightTL.y} ${rightTL.width} ${rightTL.height}">`,
    );
    const rightTR = right.regions.topRight;
    expect(output).toContain(
      `<svg x="${leftHalfWidth + leftHalfWidth - left.corner.width}" y="0" width="${rightTR.width}" height="${rightTR.height}" viewBox="${rightTR.x} ${rightTR.y} ${rightTR.width} ${rightTR.height}">`,
    );
    const cornerXs = [
      ...output.matchAll(
        /<svg x="([\d.]+)" y="[\d.]+" width="[\d.]+" height="[\d.]+" viewBox="(?!0 0)\d+ \d+ \d+ \d+">/g,
      ),
    ].map((m) => Number(m[1]));
    expect(cornerXs.length).toBeGreaterThan(0);
    expect(Math.max(...cornerXs)).toBeLessThanOrEqual(width);
  });

  interface Viewport {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  function elasticViewports(output: string): Viewport[] {
    return [
      ...output.matchAll(
        /<svg x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.-]+)" height="([\d.-]+)" viewBox="0 0 [\d.-]+ [\d.-]+">/g,
      ),
    ].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(match[3]),
      height: Number(match[4]),
    }));
  }

  it('pins all elastic band x positions for empty text, leaving no vertical band uncovered', () => {
    const output = BadgeComposer.compose(style, '', '');
    const viewports = elasticViewports(output);
    const cornerW = style.halves.left.corner.width;
    const cornerH = style.halves.left.corner.height;
    const halfWidth = style.minHalfWidth;
    const spanW = halfWidth - 2 * cornerW;
    const spanH = style.height - 2 * cornerH;
    const expected: Viewport[] = [
      { x: cornerW, y: 0, width: spanW, height: cornerH }, // left top
      { x: 0, y: cornerH, width: cornerW, height: spanH }, // left edge
      { x: cornerW, y: cornerH, width: spanW, height: spanH }, // left center
      { x: halfWidth - cornerW, y: cornerH, width: cornerW, height: spanH }, // left right edge
      { x: cornerW, y: style.height - cornerH, width: spanW, height: cornerH }, // left bottom
      { x: halfWidth + cornerW, y: 0, width: spanW, height: cornerH }, // right top
      { x: halfWidth, y: cornerH, width: cornerW, height: spanH }, // right edge
      { x: halfWidth + cornerW, y: cornerH, width: spanW, height: spanH }, // right center
      { x: 2 * halfWidth - cornerW, y: cornerH, width: cornerW, height: spanH }, // right right edge
      { x: halfWidth + cornerW, y: style.height - cornerH, width: spanW, height: cornerH }, // right bottom
    ];
    expect(viewports).toEqual(expected);
    expect(viewports[1].x).toBe(0);
    expect(viewports[8].x).toBe(200);
  });

  it('tracks each half width when placing the right vertical band', () => {
    const leftText = 'Hello';
    const rightText = 'World';
    const output = BadgeComposer.compose(style, leftText, rightText);
    const viewports = elasticViewports(output);
    const cornerW = style.halves.left.corner.width;
    const halfWidth = (text: string): number =>
      Math.max(style.minHalfWidth, 2 * cornerW + TextShaper.layout(text, font).width + 2 * style.padding);
    const leftHalfWidth = halfWidth(leftText);
    const rightHalfWidth = halfWidth(rightText);
    expect(viewports.length).toBe(10);
    expect(viewports[3].x).toBe(leftHalfWidth - cornerW);
    expect(viewports[6].x).toBe(leftHalfWidth);
    expect(viewports[8].x).toBe(leftHalfWidth + rightHalfWidth - cornerW);
  });

  it('emits a text path for both texts', () => {
    const output = BadgeComposer.compose(style, 'left text', 'right text');
    expect((output.match(/<path/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('produces identical strings for identical inputs', () => {
    const first = BadgeComposer.compose(style, 'left', 'right');
    const second = BadgeComposer.compose(style, 'left', 'right');
    expect(first).toBe(second);
  });
});
