import { Inject, Injectable } from '@nestjs/common';
import { BADGE_CACHE, BadgeCache } from '../cache/badge-cache';
import { CacheKeyFactory } from '../cache/cache-key.factory';
import { ImageFormat, ImageTransformer } from '../rendering/image-transformer';
import { RendererRegistry } from '../rendering/renderer.registry';
import { isFreshTemplate, TemplateService } from '../rendering/template.service';
import { TemplateManifestService } from '../templates/template-manifest.service';
import { TemplateParamsService } from '../templates/template-params.service';
import { GenerateParams, parseGenerateParams } from './query-parser';

export interface GeneratedImage {
  image: Buffer;
  format: ImageFormat;
}

@Injectable()
export class GenerationService {
  private static readonly ENDPOINT = '/api/v1/generate';

  private readonly fresh: boolean;

  constructor(
    @Inject(BADGE_CACHE) private readonly badgeCache: BadgeCache,
    private readonly rendererRegistry: RendererRegistry,
    private readonly imageTransformer: ImageTransformer,
    private readonly manifests: TemplateManifestService,
    private readonly params: TemplateParamsService,
    private readonly templates: TemplateService,
  ) {
    this.fresh = isFreshTemplate();
  }

  async generate(rawQuery: Record<string, unknown>): Promise<GeneratedImage> {
    const query = this.parse(rawQuery);
    const key = CacheKeyFactory.create(GenerationService.ENDPOINT, {
      template: query.templateId,
      format: query.format,
      height: String(query.height),
      ...query.variables,
    });

    if (!this.fresh) {
      const cached = await this.badgeCache.get(key);
      if (cached) {
        return { image: cached, format: query.format };
      }
    }

    const definition = this.manifests.get(query.templateId);
    const png = await this.rendererRegistry.get('png').render({
      template: definition,
      values: query.variables,
    });
    const image = await this.imageTransformer.transform(png, query.format, query.height);
    if (!this.fresh) {
      await this.badgeCache.set(key, image);
    }
    return { image, format: query.format };
  }

  generateHtml(rawQuery: Record<string, unknown>): string {
    const query = this.parse(rawQuery);
    const definition = this.manifests.get(query.templateId);
    return this.templates.withBase(
      this.templates.renderHtml(definition, query.variables),
      definition.id,
    );
  }

  parse(rawQuery: Record<string, unknown>): GenerateParams {
    return parseGenerateParams(rawQuery, this.manifests, this.params);
  }
}
