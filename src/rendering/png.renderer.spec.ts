import { PngRenderer } from './png.renderer';
import { RendererRegistry } from './renderer.registry';

const RED_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>';

describe('PngRenderer', () => {
  const renderer = new PngRenderer();

  it('returns bytes that start with the PNG magic for a 2x2 red svg', async () => {
    const png = await renderer.render(RED_SVG);
    expect(png).toBeInstanceOf(Buffer);
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('returns byte-identical results for repeated renders', async () => {
    const a = await renderer.render(RED_SVG);
    const b = await renderer.render(RED_SVG);
    expect(a.equals(b)).toBe(true);
  });
});

describe('RendererRegistry', () => {
  const registry = new RendererRegistry();

  it('returns a PngRenderer for png', () => {
    expect(registry.get('png')).toBeInstanceOf(PngRenderer);
  });

  it('throws Unsupported format for other formats', () => {
    expect(() => registry.get('webp')).toThrow(/Unsupported format/);
  });
});
