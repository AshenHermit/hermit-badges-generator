import { Inject, Injectable } from '@nestjs/common';
import { BadgeCache } from '../cache/badge-cache';
import { CacheKeyFactory } from '../cache/cache-key.factory';
import { MemoryCacheService } from '../cache/memory-cache.service';
import { ImageFormat, ImageTransformer } from '../rendering/image-transformer';
import { RendererRegistry } from '../rendering/renderer.registry';
import { isFreshTemplate } from '../rendering/template.service';
import { DEFAULT_HEIGHT, GenerateQueryDto } from './dto/generate-query.dto';

@Injectable()
export class GenerationService {
  private static readonly ENDPOINT = '/api/v1/generate';

  private readonly fresh: boolean;

  constructor(
    @Inject(MemoryCacheService) private readonly badgeCache: BadgeCache,
    private readonly rendererRegistry: RendererRegistry,
    private readonly imageTransformer: ImageTransformer,
  ) {
    this.fresh = isFreshTemplate();
  }

  async generate(query: GenerateQueryDto): Promise<Buffer> {
    const key = CacheKeyFactory.create(GenerationService.ENDPOINT, {
      left: query.left,
      right: query.right,
      style: query.style,
      format: query.format,
      height: String(query.height ?? DEFAULT_HEIGHT),
    });

    if (!this.fresh) {
      const cached = this.badgeCache.get(key);
      if (cached) {
        return cached;
      }
    }

    const png = await this.rendererRegistry.get('png').render({
      left: query.left,
      right: query.right,
    });
    const image = await this.imageTransformer.transform(
      png,
      query.format as ImageFormat,
      query.height ?? DEFAULT_HEIGHT,
    );
    if (!this.fresh) {
      this.badgeCache.set(key, image);
    }
    return image;
  }
}
