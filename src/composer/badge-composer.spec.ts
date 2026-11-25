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
      /<svg x="[\d.-]+" y="[\d.-]+" width="[\d.-]+" viewBox="0 0 [\d.]+ [\d.]+">/,
    );
    expect(parentMatch).not.toBeNull();
    const inner = extractElementInner(output, (parentMatch?.index ?? -1) + (parentMatch?.[0].length ?? 0));
    const tiles = inner.match(/<svg /g);
    expect(tiles?.length).toBe(tileSpan(spanW, style.halves.left.regions.top.width));
    expect(output).not.toContain('scale(');
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
