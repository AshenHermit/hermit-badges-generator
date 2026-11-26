import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import { GenerationModule } from './generation/generation.module';
import { HealthModule } from './health/health.module';
import { RenderingModule } from './rendering/rendering.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RenderingModule,
    CacheModule,
    GenerationModule,
    TemplatesModule,
    HealthModule,
  ],
})
export class AppModule {}
