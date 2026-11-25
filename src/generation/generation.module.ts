import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { RenderingModule } from '../rendering/rendering.module';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

@Module({
  imports: [RenderingModule, CacheModule],
  controllers: [GenerationController],
  providers: [GenerationService],
  exports: [GenerationService],
})
export class GenerationModule {}
