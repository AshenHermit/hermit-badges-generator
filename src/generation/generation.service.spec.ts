import { BadgeComposer } from '../composer/badge-composer';
import { StyleRegistry } from '../styles/style.registry';
import { RendererRegistry } from '../rendering/renderer.registry';
import { Renderer } from '../rendering/renderer';
import { CacheKeyFactory } from '../cache/cache-key.factory';
import { BadgeCache } from '../cache/badge-cache';
import { StyleDefinition } from '../styles/style-definition';
import { GenerateQueryDto } from './dto/generate-query.dto';
import { GenerationService } from './generation.service';

describe('GenerationService', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const style = { id: 'hermit-frame' } as StyleDefinition;

  let styleRegistry: { get: jest.Mock };
  let badgeCache: { get: jest.Mock; set: jest.Mock };
  let rendererRegistry: { get: jest.Mock };
  let renderer: Renderer;
  let service: GenerationService;
  let composeSpy: jest.SpyInstance;
  let createKeySpy: jest.SpyInstance;

  function queryWith(overrides?: Partial<GenerateQueryDto>): GenerateQueryDto {
    const query = new GenerateQueryDto();
    query.left = overrides?.left ?? 'Hello';
    query.right = overrides?.right ?? 'World';
    query.style = overrides?.style ?? 'hermit-frame';
    query.format = overrides?.format ?? 'png';
    return query;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    styleRegistry = { get: jest.fn().mockReturnValue(style) };
    badgeCache = { get: jest.fn().mockReturnValue(undefined), set: jest.fn() };
    renderer = { render: jest.fn().mockResolvedValue(PNG) };
    rendererRegistry = { get: jest.fn().mockReturnValue(renderer) };
    service = new GenerationService(
      styleRegistry as unknown as StyleRegistry,
      badgeCache as unknown as BadgeCache,
      rendererRegistry as unknown as RendererRegistry,
    );
    composeSpy = jest.spyOn(BadgeComposer, 'compose').mockReturnValue(SVG);
    createKeySpy = jest
      .spyOn(CacheKeyFactory, 'create')
      .mockReturnValue('cache-key');
  });

  afterEach(() => {
    composeSpy.mockRestore();
    createKeySpy.mockRestore();
  });

  it('composes, renders and caches on a cache miss', async () => {
    const query = queryWith();

    const result = await service.generate(query);

    expect(result).toBe(PNG);
    expect(CacheKeyFactory.create).toHaveBeenCalledWith(
      '/api/v1/generate',
      expect.objectContaining({ left: 'Hello', right: 'World' }),
    );
    expect(badgeCache.get).toHaveBeenCalledWith('cache-key');
    expect(styleRegistry.get).toHaveBeenCalledWith('hermit-frame');
    expect(BadgeComposer.compose).toHaveBeenCalledWith(style, 'Hello', 'World');
    expect(rendererRegistry.get).toHaveBeenCalledWith('png');
    expect(renderer.render).toHaveBeenCalledWith(SVG);
    expect(badgeCache.set).toHaveBeenCalledTimes(1);
    expect(badgeCache.set).toHaveBeenCalledWith('cache-key', PNG);
  });

  it('returns the cached buffer without rendering on a hit', async () => {
    badgeCache.get.mockReturnValue(PNG);

    const result = await service.generate(queryWith());

    expect(result).toBe(PNG);
    expect(styleRegistry.get).not.toHaveBeenCalled();
    expect(BadgeComposer.compose).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
    expect(badgeCache.set).not.toHaveBeenCalled();
  });
});
