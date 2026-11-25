import * as fs from 'fs';
import * as path from 'path';
import { StyleRegistry } from './style.registry';

const MANIFEST_PATH = path.resolve(process.cwd(), 'assets/templates/hermit-frame/manifest.json');

describe('StyleRegistry', () => {
  const registry = new StyleRegistry();

  it('returns the hermit-frame style with two half images', () => {
    const style = registry.get('hermit-frame');
    expect(style.id).toBe('hermit-frame');
    expect(Object.keys(style.halves)).toHaveLength(2);
    expect(style.halves.left.file).toBe('left-half.svg');
    expect(style.halves.right.file).toBe('right-half.svg');
    expect(style.halves.left).not.toHaveProperty('regions');
    expect(style.halves.right).not.toHaveProperty('regions');
  });

  it('lists known style ids', () => {
    expect(registry.list()).toContain('hermit-frame');
  });

  it('throws Unknown style for an unknown id', () => {
    expect(() => registry.get('unknown')).toThrow(/Unknown style/);
  });

  it('throws Unknown style for path traversal ids', () => {
    expect(() => registry.get('../etc')).toThrow(/Unknown style/);
  });

  it('exposes four-sided border and padding settings with no symmetric corner', () => {
    const style = registry.get('hermit-frame');
    expect(style.border.slice).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
    expect(style.border.width).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
    expect(style.padding).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    expect(style.halves.left).not.toHaveProperty('corner');
  });

  it('rejects invalid side values with the field name in the error', () => {
    const original = fs.readFileSync(MANIFEST_PATH, 'utf8');
    try {
      fs.writeFileSync(
        MANIFEST_PATH,
        original.replace('"top": 40', '"top": 0'),
      );
      expect(() => new StyleRegistry()).toThrow(/border\.slice\.top/);
    } finally {
      fs.writeFileSync(MANIFEST_PATH, original);
    }
  });

  it('re-reads the manifest on get when FRESH_MANIFEST is true', () => {
    const previous = process.env.FRESH_MANIFEST;
    const original = fs.readFileSync(MANIFEST_PATH, 'utf8');
    try {
      process.env.FRESH_MANIFEST = 'true';
      const freshRegistry = new StyleRegistry();
      fs.writeFileSync(MANIFEST_PATH, original.replace('"size": 50', '"size": 51'));
      expect(freshRegistry.get('hermit-frame').font.size).toBe(51);
    } finally {
      fs.writeFileSync(MANIFEST_PATH, original);
      if (previous === undefined) delete process.env.FRESH_MANIFEST;
      else process.env.FRESH_MANIFEST = previous;
    }
  });
});
