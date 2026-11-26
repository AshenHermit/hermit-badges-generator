import { BadgeCache } from '../cache/badge-cache';
import { CacheKeyFactory } from '../cache/cache-key.factory';
import { BrowserLike, BrowserRenderer, PageLike } from '../rendering/browser-renderer';
import { ImageTransformer } from '../rendering/image-transformer';
import { RendererRegistry } from '../rendering/renderer.registry';
import { TemplateService } from '../rendering/template.service';
import { DEFAULT_HEIGHT, GenerateQueryDto } from './dto/generate-query.dto';
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

  function queryWith(overrides?: Partial<GenerateQueryDto>): GenerateQueryDto {
    const query = new GenerateQueryDto();
    query.left = overrides?.left ?? 'Hello';
    query.right = overrides?.right ?? 'World';
    query.style = overrides?.style ?? 'hermit-frame';
    query.format = overrides?.format ?? 'png';
    query.height = overrides?.height ?? DEFAULT_HEIGHT;
    return query;
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
    service = new GenerationService(
      badgeCache as unknown as BadgeCache,
      rendererRegistry as unknown as RendererRegistry,
      transformer as unknown as ImageTransformer,
    );
    createKeySpy = jest
      .spyOn(CacheKeyFactory, 'create')
      .mockReturnValue('cache-key');
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

    expect(result).toBe(PNG);
    expect(CacheKeyFactory.create).toHaveBeenCalledWith(
      '/api/v1/generate',
      expect.objectContaining({ left: 'Hello', right: 'World', format: 'png', height: '60' }),
    );
    expect(badgeCache.get).toHaveBeenCalledWith('cache-key');
    expect(rendererRegistry.get).toHaveBeenCalledWith('png');
    expect(render).toHaveBeenCalledWith({ left: 'Hello', right: 'World' });
    expect(transformer.transform).toHaveBeenCalledWith(PNG, 'png', 60);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(badgeCache.set).toHaveBeenCalledWith('cache-key', PNG);
  });

  it('returns the cached buffer without rendering or transforming on a hit', async () => {
    badgeCache.get.mockResolvedValue(PNG);

    const result = await service.generate(queryWith());

    expect(result).toBe(PNG);
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
    expect(render).toHaveBeenCalledWith({ left: 'Hello', right: 'World' });
    expect(transformer.transform).toHaveBeenCalledWith(PNG, 'webp', 80);
    expect(result).toBe(WEBP);
    expect(badgeCache.set).toHaveBeenCalledWith('cache-key', WEBP);
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
    const query = queryWith();
    delete (query as Partial<GenerateQueryDto>).height;

    await service.generate(query);

    expect(transformer.transform).toHaveBeenCalledWith(PNG, 'png', 60);
  });

  it('bypasses the response cache when FRESH_TEMPLATE is set', async () => {
    process.env.FRESH_TEMPLATE = '1';
    badgeCache.get.mockResolvedValue(PNG);
    const freshService = new GenerationService(
      badgeCache as unknown as BadgeCache,
      rendererRegistry as unknown as RendererRegistry,
      transformer as unknown as ImageTransformer,
    );

    await freshService.generate(queryWith());
    await freshService.generate(queryWith({ right: 'There' }));

    expect(badgeCache.get).not.toHaveBeenCalled();
    expect(badgeCache.set).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenNthCalledWith(1, 'Hello', 'World');
    expect(prepare).toHaveBeenNthCalledWith(2, 'Hello', 'There');
  });

  it('accepts FRESH_MANIFEST as an alias for FRESH_TEMPLATE', async () => {
    process.env.FRESH_MANIFEST = 'yes';
    badgeCache.get.mockResolvedValue(PNG);
    const freshService = new GenerationService(
      badgeCache as unknown as BadgeCache,
      rendererRegistry as unknown as RendererRegistry,
      transformer as unknown as ImageTransformer,
    );

    await freshService.generate(queryWith());

    expect(badgeCache.get).not.toHaveBeenCalled();
    expect(badgeCache.set).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
