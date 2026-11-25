import * as path from 'path';
import * as opentype from 'opentype.js';

export interface FontSpec {
  file: string;
  size: number;
  color: string;
}

export interface TextLayout {
  width: number;
  path: string;
  ascenderPx: number;
  descenderPx: number;
}

const fontCache = new Map<string, opentype.Font>();

export class TextShaper {
  static layout(text: string, font: FontSpec): TextLayout {
    const fontPath = path.resolve(process.cwd(), 'assets/fonts', font.file);
    let loaded = fontCache.get(fontPath);
    if (!loaded) {
      loaded = opentype.loadSync(fontPath);
      fontCache.set(fontPath, loaded);
    }
    return {
      width: loaded.getAdvanceWidth(text, font.size),
      path: loaded.getPath(text, 0, 0, font.size).toPathData(5),
      ascenderPx: (loaded.ascender / loaded.unitsPerEm) * font.size,
      descenderPx: (loaded.descender / loaded.unitsPerEm) * font.size,
    };
  }
}
