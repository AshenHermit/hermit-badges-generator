import { Injectable } from '@nestjs/common';
import { BrowserRenderer } from './browser-renderer';
import { Renderer } from './renderer';

@Injectable()
export class RendererRegistry {
  constructor(private readonly browserRenderer: BrowserRenderer) {}

  get(format: string): Renderer {
    if (format === 'png') {
      return this.browserRenderer;
    }
    throw new Error(`Unsupported format: ${format}`);
  }
}
