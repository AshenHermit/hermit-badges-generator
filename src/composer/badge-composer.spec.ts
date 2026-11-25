import { StyleRegistry } from '../styles/style.registry';
import { StyleDefinition } from '../styles/style-definition';
import { TextShaper } from './text-shaper';
import { BadgeComposer } from './badge-composer';

describe('BadgeComposer', () => {
  const style: StyleDefinition = new StyleRegistry().get('hermit-frame');
  const font = style.font;
  const slice = style.border.slice;
  const width = style.border.width;
  const padding = style.padding;

  const asymmetric: StyleDefinition = {
    ...style,
    border: {
      slice: { top: 10, right: 20, bottom: 30, left: 40 },
      width: { top: 5, right: 6, bottom: 7, left: 8 },
    },
    padding: { top: 1, right: 2, bottom: 3, left: 4 },
  };

  function halfWidth(text: string): number {
    return Math.max(
      style.minHalfWidth,
      slice.left + slice.right + TextShaper.layout(text, font).width + padding.left + padding.right,
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

  function parseRects(output: string): [number, number, number, number][] {
    return [...output.matchAll(/<rect\b[^>]*\/>/g)].map(
      ([tag]) =>
        [
          Number(attr(tag, 'x')),
          Number(attr(tag, 'y')),
          Number(attr(tag, 'width')),
          Number(attr(tag, 'height')),
        ] as [number, number, number, number],
    );
  }

  function parsePatterns(output: string): string[] {
    return [...output.matchAll(/<pattern\b[^>]*><image\b[^>]*\/><\/pattern>/g)].map(([block]) => block);
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
    const spanW = halfWidth(longText) - slice.left - slice.right;
    expect(spanW).toBeGreaterThan(229);
    const output = BadgeComposer.compose(style, longText, '');
    expect(rectsOf(output)[4]).toEqual({ x: width.left, y: 0, width: spanW, height: width.top });
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
    expect(rects[10].x).toBe(halfWidth('') + halfWidth(longText) - width.right);
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
    expect(rects[16].x).toBe(leftHalfWidth + rightHalfWidth - width.right);

    const longLeft = 'This is a deliberately long left label for BadgeComposer';
    const grownLeftHalfWidth = halfWidth(longLeft);
    expect(grownLeftHalfWidth).toBeGreaterThan(style.halves.left.width);
    const grownRects = rectsOf(BadgeComposer.compose(style, longLeft, 'World'));
    expect(grownRects[9].x).toBe(grownLeftHalfWidth);
    expect(grownRects[16].x).toBe(grownLeftHalfWidth + rightHalfWidth - width.right);
  });

  it('emits a text path for both texts and is deterministic', () => {
    const first = BadgeComposer.compose(style, 'left', 'right');
    const second = BadgeComposer.compose(style, 'left', 'right');
    expect(first).toBe(second);
    expect((first.match(/<path\b/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('anchors asymmetric right rects with width.right', () => {
    const rects = parseRects(BadgeComposer.compose(asymmetric, '', ''));
    expect(rects[1]).toEqual([303, 0, 6, 5]); // left half top-right
    // REGION_ORDER emits center last, so the right half right band is index 16 (not 17).
    expect(rects[16]).toEqual([612, 5, 6, 169]); // right half right band
  });

  it('sizes the text span from rendered border widths, not source slice', () => {
    const text = 'This is a deliberately long left label for BadgeComposer';
    const wideBorders: StyleDefinition = {
      ...style,
      border: {
        slice: { top: 40, right: 40, bottom: 40, left: 40 },
        width: { top: 60, right: 60, bottom: 60, left: 60 },
      },
    };
    const textWidth = TextShaper.layout(text, font).width;
    const rects = rectsOf(BadgeComposer.compose(wideBorders, text, ''));
    expect(rects[9].x).toBeGreaterThan(style.minHalfWidth);
    expect(rects[4].width).toBeGreaterThanOrEqual(
      style.padding.left + style.padding.right + textWidth,
    );
  });

  it('places text using asymmetric width and padding', () => {
    const svg = BadgeComposer.compose(asymmetric, 'A', 'B');
    const paths = [...svg.matchAll(/transform="translate\(([^,]+),/g)].map((m) => Number(m[1]));
    expect(paths[0]).toBeGreaterThan(8 + 4);
    expect(paths[1]).toBeGreaterThan(309 + 6 + 2);
  });

  it('derives native windows from slice sides', () => {
    const svg = BadgeComposer.compose(asymmetric, '', '');
    const patterns = parsePatterns(svg);
    expect(patterns[0]).toContain('width="40" height="10"');
    expect(patterns[1]).toContain('width="20" height="10"');
    // The composer stringifies -0 as "0"; native top-right x = half.width - slice.right = 289.
    expect(patterns[0]).toContain('x="0" y="0"');
    expect(patterns[1]).toContain('x="-289" y="0"');
  });
});
