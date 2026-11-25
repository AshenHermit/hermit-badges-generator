import { Module } from '@nestjs/common';
import { StyleRegistry } from './style.registry';

@Module({
  providers: [StyleRegistry],
  exports: [StyleRegistry],
})
export class StylesModule {}
