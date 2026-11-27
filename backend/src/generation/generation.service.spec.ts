import { BadgeCache } from '../cache/badge-cache';
import { CacheKeyFactory } from '../cache/cache-key.factory';
import { BrowserLike, BrowserRenderer, PageLike } from '../rendering/browser-renderer';
import { ImageTransformer } from '../rendering/image-transformer';
import { RendererRegistry } from '../rendering/renderer.registry';
import { TemplateService } from '../rendering/template.service';
import { TemplateManifestService } from '../templates/template-manifest.service';
import { TemplateParamsService } from '../templates/template-params.service';
import { GenerationService } from './generation.service';

describe('GenerationService', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const TEMP_HTML = 'C:\\badges\\template-generation.html';
  const originalFreshTemplate = process.env.FRESH_TEMPLATE;
  const originalFreshManifest = process.env.FRESH_MANIFEST;

  let badgeCache: { get: jest.Mock; set: jest.Mock };
  let rendererRegistry: { get: jest.Mock };
  let transformer: { transform: jest.Mock };
  let renderer: BrowserRenderer;
  let render: jest.SpyInstance;
  let templateService: TemplateService;
  let prepare: jest.SpyInstance;
  let createKeySpy: jest.SpyInstance;
  let service: GenerationService;
  const manifests = new TemplateManifestService();
  const definition = manifests.get('hermit-frame');

  function queryWith(overrides: Record<string, unknown> = {}): Record<string, string> {
    // HTTP query strings are always strings; keep unit inputs realistic.
    const stringified = Object.fromEntries(
      Object.entries(overrides).map(([key, value]) => [key, String(value)]),
    );
    return { left: 'Hello', right: 'World', ...stringified };
  }

  function expectedValues(overrides: Record<string, string> = {}) {
    return new TemplateParamsService().resolve(definition, {
      left: 'Hello',
      right: 'World',
      ...overrides,
    });
  }

  function fakeBrowser(): BrowserLike {
    const page = {
      goto: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue(true),
      locator: jest.fn().mockReturnValue({ screenshot: jest.fn().mockResolvedValue(PNG) }),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as PageLike;
    return {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserLike;
  }

  function makeService(): GenerationService {
    return new GenerationService(
      badgeCache as unknown as BadgeCache,
      rendererRegistry as unknown as RendererRegistry,
      transformer as unknown as ImageTransformer,
      manifests,
      new TemplateParamsService(),
      templateService,
    );
  }

  beforeEach(() => {
    delete process.env.FRESH_TEMPLATE;
    delete process.env.FRESH_MANIFEST;
    badgeCache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    templateService = new TemplateService();
    prepare = jest.spyOn(templateService, 'prepare').mockReturnValue(TEMP_HTML);
    renderer = new BrowserRenderer(templateService, fakeBrowser());
    render = jest.spyOn(renderer, 'render');
    rendererRegistry = { get: jest.fn().mockReturnValue(renderer) };
    transformer = {
      transform: jest.fn().mockImplementation((png: Buffer) => Promise.resolve(png)),
    };
    service = makeService();
    createKeySpy = jest.spyOn(CacheKeyFactory, 'create').mockReturnValue('cache-key');
  });

  afterEach(() => {
    createKeySpy.mockRestore();
    if (originalFreshTemplate === undefined) delete process.env.FRESH_TEMPLATE;
    else process.env.FRESH_TEMPLATE = originalFreshTemplate;
    if (originalFreshManifest === undefined) delete process.env.FRESH_MANIFEST;
    else process.env.FRESH_MANIFEST = originalFreshManifest;
  });

  it('renders, transforms and caches on a cache miss', async () => {
    const result = await service.generate(queryWith());

    expect(result).toEqual({ image: PNG, format: 'png' });
    expect(CacheKeyFactory.create).toHaveBeenCalledWith(
      '/api/v1/generate',
      expect.objectContaining({
        template: 'hermit-frame',
        format: 'png',
        height: '60',
        left: 'Hello',
        right: 'World',
      }),
    );
    expect(badgeCache.get).toHaveBeenCalledWith('cache-key');
    expect(rendererRegistry.get).toHaveBeenCalledWith('png');
    expect(render).toHaveBeenCalledWith({
      template: definition,
      values: expectedValues(),
    });
    expect(transformer.transform).toHaveBeenCalledWith(PNG, 'png', 60);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(badgeCache.set).toHaveBeenCalledWith('cache-key', PNG);
  });

  it('returns the cached buffer without rendering or transforming on a hit', async () => {
    badgeCache.get.mockResolvedValue(PNG);

    const result = await service.generate(queryWith());

    expect(result.image).toBe(PNG);
    expect(render).not.toHaveBeenCalled();
    expect(transformer.transform).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(badgeCache.set).not.toHaveBeenCalled();
  });

  it('renders PNG, transforms to WebP and caches the transformed bytes', async () => {
    const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    transformer.transform.mockResolvedValue(WEBP);

    const result = await service.generate(queryWith({ format: 'webp', height: 80 }));

    expect(rendererRegistry.get).toHaveBeenCalledWith('png');
    expect(transformer.transform).toHaveBeenCalledWith(PNG, 'webp', 80);
    expect(result).toEqual({ image: WEBP, format: 'webp' });
    expect(badgeCache.set).toHaveBeenCalledWith('cache-key', WEBP);
  });

  it('includes colors and template id in the cache key', async () => {
    await service.generate(queryWith({ borderColor: '#f00', textColor: '#fff' }));

    expect(createKeySpy).toHaveBeenCalledWith(
      '/api/v1/generate',
      expect.objectContaining({
        template: 'hermit-frame',
        borderColor: 'rgb(255, 0, 0)',
        textColor: 'rgb(255, 255, 255)',
      }),
    );
  });

  it('passes distinct format and height values to the cache key factory', async () => {
    await service.generate(queryWith());
    await service.generate(queryWith({ format: 'webp', height: 80 }));

    expect(createKeySpy).toHaveBeenNthCalledWith(
      1,
      '/api/v1/generate',
      expect.objectContaining({ format: 'png', height: '60' }),
    );
    expect(createKeySpy).toHaveBeenNthCalledWith(
      2,
      '/api/v1/generate',
      expect.objectContaining({ format: 'webp', height: '80' }),
    );
  });

  it('uses height 60 when the field is absent from the query', async () => {
    await service.generate(queryWith());

    expect(transformer.transform).toHaveBeenCalledWith(PNG, 'png', 60);
  });

  it('rejects an unknown template, an invalid color and an unknown template parameter', async () => {
    await expect(
      service.generate(queryWith({ template: 'nope' })),
    ).rejects.toThrow();
    await expect(
      service.generate(queryWith({ borderColor: 'red' })),
    ).rejects.toThrow();
    await expect(
      service.generate(queryWith({ mystery: 'x' })),
    ).rejects.toThrow();
    expect(render).not.toHaveBeenCalled();
  });

  it('bypasses the response cache when FRESH_TEMPLATE is set', async () => {
    process.env.FRESH_TEMPLATE = '1';
    badgeCache.get.mockResolvedValue(PNG);
    const freshService = makeService();

    await freshService.generate(queryWith());
    await freshService.generate(queryWith({ right: 'There' }));

    expect(badgeCache.get).not.toHaveBeenCalled();
    expect(badgeCache.set).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenNthCalledWith(1, definition, expectedValues());
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      definition,
      expectedValues({ right: 'There' }),
    );
  });

  it('accepts FRESH_MANIFEST as an alias for FRESH_TEMPLATE', async () => {
    process.env.FRESH_MANIFEST = 'yes';
    badgeCache.get.mockResolvedValue(PNG);
    const freshService = makeService();

    await freshService.generate(queryWith());

    expect(badgeCache.get).not.toHaveBeenCalled();
    expect(badgeCache.set).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
