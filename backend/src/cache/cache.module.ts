import { Module } from '@nestjs/common';
import { BADGE_CACHE, BadgeCache } from './badge-cache';
import { MemoryCacheService } from './memory-cache.service';
import { RedisCacheService } from './redis-cache.service';

@Module({
  providers: [
    MemoryCacheService,
    RedisCacheService,
    {
      provide: BADGE_CACHE,
      useFactory: (mem: MemoryCacheService, redis: RedisCacheService): BadgeCache =>
        process.env.CACHE_DRIVER === 'redis' ? redis : mem,
      inject: [MemoryCacheService, RedisCacheService],
    },
  ],
  exports: [MemoryCacheService, BADGE_CACHE],
})
export class CacheModule {}
