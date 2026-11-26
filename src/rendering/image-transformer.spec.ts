import sharp from 'sharp';
import { ImageTransformer } from './image-transformer';

describe('ImageTransformer', () => {
  let source: Buffer;

  beforeAll(async () => {
    source = await sharp({
      create: {
        width: 302,
        height: 181,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
  });

  const transformer = new ImageTransformer();

  it('resizes PNG to the requested height, preserving aspect ratio and alpha', async () => {
    const output = await transformer.transform(source, 'png', 60);
    const metadata = await sharp(output).metadata();

    expect(metadata.height).toBe(60);
    expect(metadata.hasAlpha).toBe(true);
    expect(Math.abs(metadata.width! / metadata.height! - 302 / 181)).toBeLessThan(0.02);
  });

  it('emits PNG magic bytes for png output', async () => {
    const output = await transformer.transform(source, 'png', 60);

    expect(output.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('emits a RIFF/WEBP container for webp output', async () => {
    const output = await transformer.transform(source, 'webp', 60);
    const metadata = await sharp(output).metadata();

    expect(output.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(output.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(metadata.hasAlpha).toBe(true);
  });

  it('produces byte-identical output for identical requests', async () => {
    const first = await transformer.transform(source, 'png', 60);
    const second = await transformer.transform(source, 'png', 60);

    expect(first.equals(second)).toBe(true);
  });
});
