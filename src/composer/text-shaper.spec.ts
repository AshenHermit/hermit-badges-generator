import { TextShaper, FontSpec } from './text-shaper';

describe('TextShaper', () => {
  const font: FontSpec = {
    file: 'Mansalva-Regular.ttf',
    size: 30,
    color: '#ffffff',
  };

  it('returns a positive width for text', () => {
    expect(TextShaper.layout('badge', font).width).toBeGreaterThan(0);
  });

  it('path starts with M', () => {
    expect(TextShaper.layout('badge', font).path.startsWith('M')).toBe(true);
  });

  it('produces identical path for repeated calls with the same text', () => {
    expect(TextShaper.layout('badge', font).path).toBe(
      TextShaper.layout('badge', font).path,
    );
  });

  it('returns zero width for empty text', () => {
    expect(TextShaper.layout('', font).width).toBe(0);
  });

  it('does not throw on emoji', () => {
    const layout = TextShaper.layout('🎉', font);
    expect(typeof layout.path).toBe('string');
  });
});
