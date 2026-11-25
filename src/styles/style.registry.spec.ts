import { StyleRegistry } from './style.registry';

describe('StyleRegistry', () => {
  const registry = new StyleRegistry();

  it('returns the hermit-frame style with two halves of nine regions', () => {
    const style = registry.get('hermit-frame');
    expect(style.id).toBe('hermit-frame');
    expect(Object.keys(style.halves)).toHaveLength(2);
    expect(Object.keys(style.halves.left.regions)).toHaveLength(9);
    expect(Object.keys(style.halves.right.regions)).toHaveLength(9);
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
