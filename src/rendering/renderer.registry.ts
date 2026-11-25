import { Injectable } from '@nestjs/common';
import { PngRenderer } from './png.renderer';
import { Renderer } from './renderer';

@Injectable()
export class RendererRegistry {
  get(format: string): Renderer {
    if (format === 'png') {
      return new PngRenderer();
    }
    throw new Error(`Unsupported format: ${format}`);
  }
}
