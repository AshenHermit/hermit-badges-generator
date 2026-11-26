import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type ImageFormat = 'png' | 'webp';

@Injectable()
export class ImageTransformer {
  async transform(png: Buffer, format: ImageFormat, height: number): Promise<Buffer> {
    const resized = sharp(png).resize({ height });
    return format === 'webp' ? resized.webp().toBuffer() : resized.png().toBuffer();
  }
}
