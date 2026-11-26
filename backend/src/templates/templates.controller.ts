import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { TemplateManifestService } from './template-manifest.service';

@Controller('v1/templates')
export class TemplatesController {
  constructor(private readonly manifests: TemplateManifestService) {}

  @Get()
  @ApiOperation({ summary: 'List available template ids' })
  @ApiResponse({ status: 200, schema: { type: 'array', items: { type: 'string' } } })
  list(): string[] {
    return this.manifests.list();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Query parameters accepted by a template in /api/v1/generate',
  })
  @ApiParam({ name: 'id', description: 'Template id', example: 'hermit-frame' })
  @ApiResponse({ status: 200, description: 'Template parameter definitions' })
  @ApiResponse({ status: 400, description: 'Unknown template id' })
  getParameters(@Param('id') id: string): Record<string, unknown> {
    const definition = this.manifests.get(id);
    return {
      id: definition.id,
      parameters: definition.variables.map((variable) => ({
        name: variable.name,
        placeholder: variable.placeholder,
        type: variable.type,
        required: variable.required,
        ...(variable.default !== undefined ? { default: variable.default } : {}),
        ...(variable.description !== undefined ? { description: variable.description } : {}),
        ...(variable.maxLength !== undefined ? { maxLength: variable.maxLength } : {}),
        ...(variable.pattern !== undefined ? { pattern: variable.pattern } : {}),
        ...(variable.min !== undefined ? { min: variable.min } : {}),
        ...(variable.max !== undefined ? { max: variable.max } : {}),
      })),
    };
  }
}
