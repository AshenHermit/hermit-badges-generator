import { Module } from '@nestjs/common';
import { BrowserRenderer } from './browser-renderer';
import { RendererRegistry } from './renderer.registry';
import { TemplateService } from './template.service';

@Module({
  providers: [TemplateService, BrowserRenderer, RendererRegistry],
  exports: [RendererRegistry],
})
export class RenderingModule {}
