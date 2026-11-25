import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import { GenerationModule } from './generation/generation.module';
import { RenderingModule } from './rendering/rendering.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RenderingModule,
    CacheModule,
    GenerationModule,
  ],
})
export class AppModule {}
