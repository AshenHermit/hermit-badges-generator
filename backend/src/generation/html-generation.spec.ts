import { BadgeCache } from '../cache/badge-cache';
import { ImageTransformer } from '../rendering/image-transformer';
import { RendererRegistry } from '../rendering/renderer.registry';
import { TemplateService } from '../rendering/template.service';
import { TemplateManifestService } from '../templates/template-manifest.service';
import { TemplateParamsService } from '../templates/template-params.service';
import { GenerationService } from './generation.service';

describe('GenerationService.generateHtml', () => {
  const manifests = new TemplateManifestService();
  const params = new TemplateParamsService();
  const templates = new TemplateService();
  let badgeCache: { get: jest.Mock; set: jest.Mock };
  let rendererRegistry: { get: jest.Mock };
  let imageTransformer: { transform: jest.Mock };
  let service: GenerationService;

  const query = {
    template: 'garrison-cat-badge',
    left: 'Hello',
    right: 'World',
  };

  beforeEach(() => {
    badgeCache = { get: jest.fn(), set: jest.fn() };
    rendererRegistry = { get: jest.fn() };
    imageTransformer = { transform: jest.fn() };
    service = new GenerationService(
      badgeCache as unknown as BadgeCache,
      rendererRegistry as unknown as RendererRegistry,
      imageTransformer as unknown as ImageTransformer,
      manifests,
      params,
      templates,
    );
  });

  it('returns substituted HTML with the asset base tag', () => {
    const html = service.generateHtml(query);

    expect(html).toContain('Hello');
    expect(html).toContain('World');
    expect(html).toContain(
      '<base href="/api/v1/assets/templates/garrison-cat-badge/">',
    );
  });

  it('does not render, transform, or cache the HTML', () => {
    service.generateHtml(query);

    expect(rendererRegistry.get).not.toHaveBeenCalled();
    expect(badgeCache.get).not.toHaveBeenCalled();
    expect(badgeCache.set).not.toHaveBeenCalled();
    expect(imageTransformer.transform).not.toHaveBeenCalled();
  });

  it('rejects invalid queries', () => {
    expect(() =>
      service.generateHtml({ ...query, template: 'nope' }),
    ).toThrow();
    expect(() => service.generateHtml({ ...query, color: 'red' })).toThrow();
    expect(() =>
      service.generateHtml({ ...query, mystery: 'x' }),
    ).toThrow();
  });
});
