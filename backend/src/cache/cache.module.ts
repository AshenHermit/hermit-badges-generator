import { Module } from '@nestjs/common';
import { BADGE_CACHE } from './badge-cache';
import { MemoryCacheService } from './memory-cache.service';

@Module({
  providers: [
    MemoryCacheService,
    {
      provide: BADGE_CACHE,
      useFactory: (mem: MemoryCacheService) => mem,
      inject: [MemoryCacheService],
    },
  ],
  exports: [MemoryCacheService, BADGE_CACHE],
})
export class CacheModule {}
