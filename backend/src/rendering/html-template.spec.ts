import fs = require('node:fs');
import { TemplateDefinition } from '../templates/template-definition';
import { TemplateManifestService } from '../templates/template-manifest.service';
import {
  ResolvedValues,
  TemplateParamsService,
} from '../templates/template-params.service';
import { TemplateService } from './template.service';

describe('TemplateService HTML rendering', () => {
  const manifests = new TemplateManifestService();
  const params = new TemplateParamsService();
  const definition: TemplateDefinition = manifests.get('garrison-cat-badge');

  function service(): TemplateService {
    return new TemplateService();
  }

  function values(overrides: Record<string, string> = {}): ResolvedValues {
    return params.resolve(definition, { left: 'Hello', right: 'World', ...overrides });
  }

  it('returns substituted HTML without a temporary file path', () => {
    const html = service().renderHtml(definition, values());

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Hello');
    expect(html).toContain('World');
    expect(html).not.toContain('{{LEFT}}');
    expect(html).not.toMatch(/template-[0-9a-f-]+\.html/);
  });

  it('escapes user text before injecting it into the HTML', () => {
    const html = service().renderHtml(
      definition,
      values({ left: '<script>alert(1)</script>' }),
    );

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('injects the asset base tag before the original style tag', () => {
    const html = service().renderHtml(definition, values());
    const withBase = service().withBase(html, 'garrison-cat-badge');

    expect(withBase).toContain(
      '<base href="/api/v1/assets/templates/garrison-cat-badge/">',
    );
    expect(withBase.indexOf('<base')).toBeLessThan(withBase.indexOf('<style>'));
  });

  it('prepends the base tag when the HTML has no head element', () => {
    const withBase = service().withBase('<html></html>', 'x');

    expect(withBase).toContain('<base href="/api/v1/assets/templates/x/">');
    expect(withBase.startsWith('<base')).toBe(true);
  });

  it('never writes HTML to disk', () => {
    const write = jest.spyOn(fs, 'writeFileSync');
    try {
      const html = service().renderHtml(definition, values());
      service().withBase(html, definition.id);
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });
});
