import { StyleRegistry } from './style.registry';

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
});
