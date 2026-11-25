import { StyleRegistry } from '../styles/style.registry';
import { StyleDefinition } from '../styles/style-definition';
import { TextShaper } from './text-shaper';
import { BadgeComposer } from './badge-composer';

describe('BadgeComposer', () => {
  const style: StyleDefinition = new StyleRegistry().get('hermit-frame');
  const font = style.font;
  const cornerW = style.halves.left.corner.width;
  const cornerH = style.halves.left.corner.height;

  function halfWidth(text: string): number {
    return Math.max(
      style.minHalfWidth,
      2 * cornerW + TextShaper.layout(text, font).width + 2 * style.padding,
    );
  }

  function attr(tag: string, name: string): string {
    const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
    if (!match) {
      throw new Error(`Missing ${name} in ${tag.slice(0, 120)}`);
    }
    return match[1];
  }

  interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface Pattern extends Rect {
    id: string;
    imageX: number;
    imageY: number;
  }

  function rectsOf(output: string): Rect[] {
    return [...output.matchAll(/<rect\b[^>]*\/>/g)].map(([tag]) => ({
      x: Number(attr(tag, 'x')),
      y: Number(attr(tag, 'y')),
      width: Number(attr(tag, 'width')),
      height: Number(attr(tag, 'height')),
    }));
  }

  function patternsOf(output: string): Pattern[] {
    return [...output.matchAll(/<pattern\b[^>]*><image\b[^>]*\/><\/pattern>/g)].map(([block]) => {
      const [openTag, imageTag] = block.split('><');
      return {
        id: attr(openTag, 'id'),
        x: Number(attr(openTag, 'x')),
        y: Number(attr(openTag, 'y')),
        width: Number(attr(openTag, 'width')),
        height: Number(attr(openTag, 'height')),
        imageX: Number(attr(imageTag, 'x')),
        imageY: Number(attr(imageTag, 'y')),
      };
    });
  }

  it('starts with <svg and has width="618" height="181" at minimum width', () => {
    const output = BadgeComposer.compose(style, '', '');
    expect(output.startsWith('<svg')).toBe(true);
    expect(output).toContain('width="618" height="181"');
    expect(output).toContain('viewBox="0 0 618 181"');
  });

  it('emits exactly 18 patterns and 18 rects', () => {
    const output = BadgeComposer.compose(style, '', '');
    expect((output.match(/<pattern\b/g) || []).length).toBe(18);
    expect((output.match(/<rect\b/g) || []).length).toBe(18);
  });

  it('uses only native window dimensions for pattern width and height', () => {
    const patterns = patternsOf(BadgeComposer.compose(style, '', ''));
    expect(patterns).toHaveLength(18);
    for (const pattern of patterns) {
      expect([40, 229, 101]).toContain(pattern.width);
      expect([40, 101]).toContain(pattern.height);
    }
  });

  it('anchors every embedded image to a native offset', () => {
    const patterns = patternsOf(BadgeComposer.compose(style, '', ''));
    expect(patterns).toHaveLength(18);
    for (const pattern of patterns) {
      expect([0, -40, -269]).toContain(pattern.imageX);
      expect([0, -40, -141]).toContain(pattern.imageY);
    }
  });

  it('assigns pattern ids p0 through p17 exactly once each', () => {
    const ids = patternsOf(BadgeComposer.compose(style, '', '')).map((pattern) => pattern.id);
    expect(ids).toEqual(Array.from({ length: 18 }, (_, index) => `p${index}`));
  });

  it('pins all rect positions for empty text and keeps them within the badge width', () => {
    const rects = rectsOf(BadgeComposer.compose(style, '', ''));
    expect(rects.map((rect) => rect.x)).toEqual([
      0, 269, 0, 269, 40, 40, 0, 269, 40, 309, 578, 309, 578, 349, 349, 309, 578, 349,
    ]);
    expect(rects.map((rect) => rect.y)).toEqual([
      0, 0, 141, 141, 0, 141, 40, 40, 40, 0, 0, 141, 141, 0, 141, 40, 40, 40,
    ]);
    expect(rects[10].x).toBe(578);
    for (const rect of rects) {
      expect(rect.x + rect.width).toBeLessThanOrEqual(618);
    }
  });

  it('grows the left top-band rect but keeps its native pattern width', () => {
    const longText = 'This is a deliberately long left label for BadgeComposer';
    const spanW = halfWidth(longText) - 2 * cornerW;
    expect(spanW).toBeGreaterThan(229);
    const output = BadgeComposer.compose(style, longText, '');
    expect(rectsOf(output)[4]).toEqual({ x: 40, y: 0, width: spanW, height: cornerH });
    expect(patternsOf(output)[4].width).toBe(229);
    expect(output).not.toContain('scale(');
  });

  it('keeps native right-side pattern windows when the right half grows', () => {
    const longText = 'This is a deliberately long right label for BadgeComposer';
    const output = BadgeComposer.compose(style, '', longText);
    const patterns = patternsOf(output);
    const rects = rectsOf(output);
    expect(patterns[10].width).toBe(40);
    expect(patterns[10].imageX).toBe(-269);
    expect(rects[10].x).toBe(halfWidth('') + halfWidth(longText) - 40);
    for (const pattern of patterns) {
      expect(pattern.width).toBeLessThanOrEqual(309);
      expect(pattern.height).toBeLessThanOrEqual(181);
    }
  });

  it('offsets the right half by the measured left half width', () => {
    const leftHalfWidth = halfWidth('Hello');
    const rightHalfWidth = halfWidth('World');
    const rects = rectsOf(BadgeComposer.compose(style, 'Hello', 'World'));
    expect(rects[9].x).toBe(leftHalfWidth);
    expect(rects[16].x).toBe(leftHalfWidth + rightHalfWidth - 40);

    const longLeft = 'This is a deliberately long left label for BadgeComposer';
    const grownLeftHalfWidth = halfWidth(longLeft);
    expect(grownLeftHalfWidth).toBeGreaterThan(style.halves.left.width);
    const grownRects = rectsOf(BadgeComposer.compose(style, longLeft, 'World'));
    expect(grownRects[9].x).toBe(grownLeftHalfWidth);
    expect(grownRects[16].x).toBe(grownLeftHalfWidth + rightHalfWidth - 40);
  });

  it('emits a text path for both texts and is deterministic', () => {
    const first = BadgeComposer.compose(style, 'left', 'right');
    const second = BadgeComposer.compose(style, 'left', 'right');
    expect(first).toBe(second);
    expect((first.match(/<path\b/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
