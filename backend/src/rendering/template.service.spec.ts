import * as fs from 'fs';
import { TemplateDefinition } from '../templates/template-definition';
import { TemplateManifestService } from '../templates/template-manifest.service';
import { TemplateParamsService } from '../templates/template-params.service';
import { TemplateService } from './template.service';

describe('TemplateService', () => {
  const manifests = new TemplateManifestService();
  const params = new TemplateParamsService();
  const definition: TemplateDefinition = manifests.get('hermit-frame');
  const originalTemplate = fs.readFileSync(definition.file, 'utf8');
  const originalFreshTemplate = process.env.FRESH_TEMPLATE;
  const originalFreshManifest = process.env.FRESH_MANIFEST;

  function clearFreshFlags(): void {
    delete process.env.FRESH_TEMPLATE;
    delete process.env.FRESH_MANIFEST;
  }

  function restoreFreshFlags(): void {
    if (originalFreshTemplate === undefined) delete process.env.FRESH_TEMPLATE;
    else process.env.FRESH_TEMPLATE = originalFreshTemplate;
    if (originalFreshManifest === undefined) delete process.env.FRESH_MANIFEST;
    else process.env.FRESH_MANIFEST = originalFreshManifest;
  }

  function values(overrides: Record<string, string> = {}) {
    return params.resolve(definition, { left: 'L', right: 'R', ...overrides });
  }

  afterEach(() => {
    fs.writeFileSync(definition.file, originalTemplate, 'utf8');
    restoreFreshFlags();
  });

  it('escapes user text before injecting it into the template', () => {
    clearFreshFlags();
    const service = new TemplateService();

    const tempPath = service.prepare(definition, values({ left: '<b>&"', right: "x'y" }));

    try {
      const html = fs.readFileSync(tempPath, 'utf8');
      expect(html).toContain('&lt;b&gt;&amp;&quot;');
      expect(html).not.toContain('<b>');
      expect(html).toContain('x&#39;y');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });

  it('substitutes color variables and the text color placeholder', () => {
    clearFreshFlags();
    const service = new TemplateService();

    const tempPath = service.prepare(
      definition,
      values({
        borderColor: '#ff0000',
        leftBgColor: 'rgb(1,2,3)',
        rightBgColor: '#0f0',
        textColor: '#ffffff',
      }),
    );

    try {
      const html = fs.readFileSync(tempPath, 'utf8');
      expect(html).toContain('"rgb(41,39,45)": "rgb(255, 0, 0)"');
      expect(html).toContain('"rgb(53,52,62)": "rgb(1, 2, 3)"');
      expect(html).toContain('"rgb(140,48,101)": "rgb(0, 255, 0)"');
      expect(html).toContain('color: rgb(255, 255, 255);');
      expect(html).not.toContain('{{TEXT_COLOR}}');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });

  it('caches the template after the first read when fresh mode is off', () => {
    clearFreshFlags();
    const service = new TemplateService();

    // Prime the cache before changing the file.
    const primed = service.prepare(definition, values());
    fs.unlinkSync(primed);
    fs.writeFileSync(definition.file, `${originalTemplate}\n<!-- cached marker -->`, 'utf8');

    const tempPath = service.prepare(definition, values());
    try {
      expect(fs.readFileSync(tempPath, 'utf8')).not.toContain('<!-- cached marker -->');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });

  it('re-reads the template on every prepare in fresh mode', () => {
    clearFreshFlags();
    process.env.FRESH_TEMPLATE = '1';
    const service = new TemplateService();

    fs.writeFileSync(definition.file, `${originalTemplate}\n<!-- first marker -->`, 'utf8');
    const first = service.prepare(definition, values());
    fs.writeFileSync(definition.file, `${originalTemplate}\n<!-- second marker -->`, 'utf8');
    const second = service.prepare(definition, values());
    try {
      expect(fs.readFileSync(first, 'utf8')).toContain('<!-- first marker -->');
      expect(fs.readFileSync(second, 'utf8')).toContain('<!-- second marker -->');
    } finally {
      fs.unlinkSync(first);
      fs.unlinkSync(second);
    }
  });

  it('accepts FRESH_MANIFEST as an alias for FRESH_TEMPLATE', () => {
    clearFreshFlags();
    process.env.FRESH_MANIFEST = 'YeS';
    const service = new TemplateService();

    fs.writeFileSync(definition.file, `${originalTemplate}\n<!-- alias marker -->`, 'utf8');
    const tempPath = service.prepare(definition, values());
    try {
      expect(fs.readFileSync(tempPath, 'utf8')).toContain('<!-- alias marker -->');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });

  it('keeps a placeholder inside left text literal and does not inject it into the right half', () => {
    clearFreshFlags();
    const service = new TemplateService();

    const tempPath = service.prepare(definition, values({ left: '{{RIGHT}}' }));
    try {
      const html = fs.readFileSync(tempPath, 'utf8');
      const left = html.match(/<div[^>]*class="badge-left-part"[^>]*>\s*([^<]*?)\s*<\/div>/);
      const right = html.match(/<div[^>]*class="badge-right-part"[^>]*>\s*([^<]*?)\s*<\/div>/);
      expect(left?.[1].trim()).toBe('{{RIGHT}}');
      expect(right?.[1].trim()).toBe('R');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });

  it('treats an empty FRESH_TEMPLATE as unset and honours FRESH_MANIFEST', () => {
    clearFreshFlags();
    process.env.FRESH_TEMPLATE = '';
    process.env.FRESH_MANIFEST = 'yes';
    const service = new TemplateService();

    fs.writeFileSync(definition.file, `${originalTemplate}\n<!-- empty-primary marker -->`, 'utf8');
    const tempPath = service.prepare(definition, values());
    try {
      expect(fs.readFileSync(tempPath, 'utf8')).toContain('<!-- empty-primary marker -->');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });
});
