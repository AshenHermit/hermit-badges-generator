import { Resvg } from '@resvg/resvg-js';

export class PngRenderer {
  async render(svg: string): Promise<Buffer> {
    const resvg = new Resvg(svg, { font: { loadSystemFonts: false } });
    const png = resvg.render().asPng();
    return Buffer.from(png);
  }
}
