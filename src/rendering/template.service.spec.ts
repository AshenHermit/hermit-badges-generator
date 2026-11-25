import * as fs from 'fs';
import { TEMPLATE_PATH, TemplateService } from './template.service';

describe('TemplateService', () => {
  const originalTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
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

  afterEach(() => {
    fs.writeFileSync(TEMPLATE_PATH, originalTemplate, 'utf8');
    restoreFreshFlags();
  });

  it('escapes user text before injecting it into the template', () => {
    clearFreshFlags();
    const service = new TemplateService();

    const tempPath = service.prepare('<b>&"', "x'y");

    try {
      const html = fs.readFileSync(tempPath, 'utf8');
      expect(html).toContain('&lt;b&gt;&amp;&quot;');
      expect(html).not.toContain('<b>');
      expect(html).toContain('x&#39;y');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });

  it('caches the template at startup when fresh mode is off', () => {
    clearFreshFlags();
    const service = new TemplateService();
    fs.writeFileSync(TEMPLATE_PATH, `${originalTemplate}\n<!-- cached marker -->`, 'utf8');

    const tempPath = service.prepare('L', 'R');
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

    fs.writeFileSync(TEMPLATE_PATH, `${originalTemplate}\n<!-- first marker -->`, 'utf8');
    const first = service.prepare('L', 'R');
    fs.writeFileSync(TEMPLATE_PATH, `${originalTemplate}\n<!-- second marker -->`, 'utf8');
    const second = service.prepare('L', 'R');
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

    fs.writeFileSync(TEMPLATE_PATH, `${originalTemplate}\n<!-- alias marker -->`, 'utf8');
    const tempPath = service.prepare('L', 'R');
    try {
      expect(fs.readFileSync(tempPath, 'utf8')).toContain('<!-- alias marker -->');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });
});
