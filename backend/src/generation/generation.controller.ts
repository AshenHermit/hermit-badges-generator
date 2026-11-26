import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { GenerateQueryDto } from './dto/generate-query.dto';
import { GenerationService } from './generation.service';

// Nest 11's ExpressAdapter serializes objects returned from handlers with
// res.json(), which turns a Buffer into {"type":"Buffer","data":[...]}.
// Send the image bytes directly so the response body is the image itself.
type ImageResponse = { setHeader(name: string, value: string): unknown; send(body: Buffer): unknown };

@Controller('v1/generate')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'Generate a badge image' })
  @ApiProduces('image/png', 'image/webp')
  @ApiResponse({
    status: 200,
    content: {
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'image/webp': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiQuery({ name: 'left', required: true, description: 'Text for the left half' })
  @ApiQuery({ name: 'right', required: true, description: 'Text for the right half' })
  @ApiQuery({ name: 'style', required: false, description: 'Badge style', enum: ['hermit-frame'] })
  @ApiQuery({ name: 'format', required: false, description: 'Image format', enum: ['png', 'webp'] })
  @ApiQuery({
    name: 'height',
    required: false,
    description: 'Output height in pixels (1-1000)',
    schema: { type: 'integer', default: 60 },
  })
  async generate(
    @Query() query: GenerateQueryDto,
    @Res() res: ImageResponse,
  ): Promise<Buffer> {
    const image = await this.generationService.generate(query);
    res.setHeader('Content-Type', query.format === 'webp' ? 'image/webp' : 'image/png');
    res.send(image);
    return image;
  }
}
