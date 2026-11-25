import { Inject, Injectable } from '@nestjs/common';
import { BadgeComposer } from '../composer/badge-composer';
import { BadgeCache } from '../cache/badge-cache';
import { CacheKeyFactory } from '../cache/cache-key.factory';
import { MemoryCacheService } from '../cache/memory-cache.service';
import { RendererRegistry } from '../rendering/renderer.registry';
import { StyleRegistry } from '../styles/style.registry';
import { GenerateQueryDto } from './dto/generate-query.dto';

@Injectable()
export class GenerationService {
  private static readonly ENDPOINT = '/api/v1/generate';

  constructor(
    private readonly styleRegistry: StyleRegistry,
    @Inject(MemoryCacheService) private readonly badgeCache: BadgeCache,
    private readonly rendererRegistry: RendererRegistry,
  ) {}

  async generate(query: GenerateQueryDto): Promise<Buffer> {
    const key = CacheKeyFactory.create(GenerationService.ENDPOINT, {
      left: query.left,
      right: query.right,
      style: query.style,
      format: query.format,
    });

    const cached = this.badgeCache.get(key);
    if (cached) {
      return cached;
    }

    const style = this.styleRegistry.get(query.style);
    const svg = BadgeComposer.compose(style, query.left, query.right);
    const png = await this.rendererRegistry.get(query.format).render(svg);
    this.badgeCache.set(key, png);
    return png;
  }
}
