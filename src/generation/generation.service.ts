import { Inject, Injectable } from '@nestjs/common';
import { BadgeCache } from '../cache/badge-cache';
import { CacheKeyFactory } from '../cache/cache-key.factory';
import { MemoryCacheService } from '../cache/memory-cache.service';
import { RendererRegistry } from '../rendering/renderer.registry';
import { isFreshTemplate } from '../rendering/template.service';
import { GenerateQueryDto } from './dto/generate-query.dto';

@Injectable()
export class GenerationService {
  private static readonly ENDPOINT = '/api/v1/generate';

  private readonly fresh: boolean;

  constructor(
    @Inject(MemoryCacheService) private readonly badgeCache: BadgeCache,
    private readonly rendererRegistry: RendererRegistry,
  ) {
    this.fresh = isFreshTemplate();
  }

  async generate(query: GenerateQueryDto): Promise<Buffer> {
    const key = CacheKeyFactory.create(GenerationService.ENDPOINT, {
      left: query.left,
      right: query.right,
      style: query.style,
      format: query.format,
    });

    if (!this.fresh) {
      const cached = this.badgeCache.get(key);
      if (cached) {
        return cached;
      }
    }

    const png = await this.rendererRegistry.get(query.format).render({
      left: query.left,
      right: query.right,
    });
    if (!this.fresh) {
      this.badgeCache.set(key, png);
    }
    return png;
  }
}
