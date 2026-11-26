import { Module } from '@nestjs/common';
import { TemplateManifestService } from './template-manifest.service';
import { TemplateParamsService } from './template-params.service';
import { TemplatesController } from './templates.controller';

@Module({
  controllers: [TemplatesController],
  providers: [TemplateManifestService, TemplateParamsService],
  exports: [TemplateManifestService, TemplateParamsService],
})
export class TemplatesModule {}
