import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import { GenerationModule } from './generation/generation.module';
import { RenderingModule } from './rendering/rendering.module';
import { StylesModule } from './styles/styles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StylesModule,
    RenderingModule,
    CacheModule,
    GenerationModule,
  ],
})
export class AppModule {}
