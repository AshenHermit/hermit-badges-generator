import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type FileResponse = {
  setHeader(name: string, value: string): unknown;
  send(body: Buffer): unknown;
};

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.js': 'text/javascript',
};

@Controller('v1/assets')
export class AssetsController {
  private readonly root = path.resolve(process.cwd(), 'assets');

  @Get('*path')
  get(
    @Param() params: { path?: string | string[] },
    @Res() res: FileResponse,
  ): void {
    const raw = params.path;
    const segments = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw.split(/[\\/]/)
        : [];
    const target = path.resolve(this.root, ...segments);
    const insideRoot =
      target !== this.root && target.startsWith(this.root + path.sep);
    if (
      !segments.length ||
      !insideRoot ||
      !fs.statSync(target, { throwIfNoEntry: false })?.isFile()
    ) {
      throw new NotFoundException();
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader(
      'Content-Type',
      CONTENT_TYPES[path.extname(target).toLowerCase()] ??
        'application/octet-stream',
    );
    res.send(fs.readFileSync(target));
  }
}
