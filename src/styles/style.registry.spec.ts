import * as fs from 'fs';
import * as path from 'path';
import { StyleRegistry } from './style.registry';

const MANIFEST_PATH = path.resolve(process.cwd(), 'assets/templates/hermit-frame/manifest.json');

type MutableManifest = {
  border: {
    slice: Record<string, number>;
    width: Record<string, number>;
  };
};

function withMutatedSides(edit: (manifest: MutableManifest) => void, check: () => void): void {
  const original = fs.readFileSync(MANIFEST_PATH, 'utf8');
  try {
    const manifest = JSON.parse(original) as MutableManifest;
    edit(manifest);
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    check();
  } finally {
    fs.writeFileSync(MANIFEST_PATH, original);
  }
}

function expectThrowNaming(action: () => unknown, ...paths: string[]): void {
  let error: unknown;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
  const message = error instanceof Error ? error.message : String(error);
  for (const fieldPath of paths) {
    expect(message).toContain(fieldPath);
  }
}

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

  it('rejects slice top/bottom whose sum exceeds the source height', () => {
    withMutatedSides(
      (manifest) => {
        manifest.border.slice.top = 100;
        manifest.border.slice.bottom = 100;
      },
      () => {
        expectThrowNaming(
          () => new StyleRegistry(),
          'border.slice.top',
          'border.slice.bottom',
        );
      },
    );
  });

  it('rejects slice left/right whose sum exceeds a half width', () => {
    withMutatedSides(
      (manifest) => {
        manifest.border.slice.left = 200;
        manifest.border.slice.right = 200;
      },
      () => {
        expectThrowNaming(
          () => new StyleRegistry(),
          'border.slice.left',
          'border.slice.right',
        );
      },
    );
  });

  it('rejects width top/bottom whose sum exceeds the source height', () => {
    withMutatedSides(
      (manifest) => {
        manifest.border.width.top = 100;
        manifest.border.width.bottom = 100;
      },
      () => {
        expectThrowNaming(
          () => new StyleRegistry(),
          'border.width.top',
          'border.width.bottom',
        );
      },
    );
  });
});
