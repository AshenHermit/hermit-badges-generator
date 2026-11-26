import { Module } from '@nestjs/common';
import { BrowserRenderer } from './browser-renderer';
import { ImageTransformer } from './image-transformer';
import { RendererRegistry } from './renderer.registry';
import { TemplateService } from './template.service';

@Module({
  providers: [TemplateService, BrowserRenderer, RendererRegistry, ImageTransformer],
  exports: [RendererRegistry, ImageTransformer],
})
export class RenderingModule {}
