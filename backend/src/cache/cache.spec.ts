import { Test } from '@nestjs/testing';
import { BADGE_CACHE } from './badge-cache';
import { CacheKeyFactory } from './cache-key.factory';
import { CacheModule } from './cache.module';
import { MemoryCacheService } from './memory-cache.service';

describe('CacheKeyFactory', () => {
  it('produces the same key for reordered query params', () => {
    expect(
      CacheKeyFactory.create('/api/v1/generate', { right: 'b', left: 'a' }),
    ).toBe(CacheKeyFactory.create('/api/v1/generate', { left: 'a', right: 'b' }));
  });

  it('returns a hex sha256 string', () => {
    expect(CacheKeyFactory.create('/api/v1/generate', { a: '1' })).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs for different endpoint', () => {
    const k1 = CacheKeyFactory.create('/api/v1/generate', { a: '1' });
    const k2 = CacheKeyFactory.create('/api/v2/generate', { a: '1' });
    expect(k1).not.toBe(k2);
  });

  it('differs for different value', () => {
    const k1 = CacheKeyFactory.create('/api/v1/generate', { a: '1' });
    const k2 = CacheKeyFactory.create('/api/v1/generate', { a: '2' });
    expect(k1).not.toBe(k2);
  });
});

describe('MemoryCacheService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('set/get returns the same Buffer', async () => {
    const svc = new MemoryCacheService(1000, 10);
    const buf = Buffer.from('hello');
    await svc.set('k', buf);
    expect(await svc.get('k')).toBe(buf);
  });

  it('expires entries after ttlMs', async () => {
    jest.useFakeTimers();
    const svc = new MemoryCacheService(1000, 10);
    await svc.set('k', Buffer.from('v'));
    expect(await svc.get('k')).toBeDefined();
    jest.advanceTimersByTime(1001);
    expect(await svc.get('k')).toBeUndefined();
  });

  it('evicts the least-recently-used entry beyond maxEntries', async () => {
    const svc = new MemoryCacheService(1000, 2);
    await svc.set('a', Buffer.from('a'));
    await svc.set('b', Buffer.from('b'));
    expect(svc.size).toBe(2);
    await svc.get('a'); // refresh a, making b the LRU
    await svc.set('c', Buffer.from('c'));
    expect(svc.size).toBe(2);
    expect(await svc.get('a')).toBeDefined();
    expect(await svc.get('b')).toBeUndefined();
    expect(await svc.get('c')).toBeDefined();
  });

  it('does not store entries when CACHE_DISABLED is true', async () => {
    const previous = process.env.CACHE_DISABLED;
    process.env.CACHE_DISABLED = 'true';
    try {
      const svc = new MemoryCacheService(1000, 10);
      await svc.set('k', Buffer.from('v'));
      expect(svc.size).toBe(0);
      expect(await svc.get('k')).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.CACHE_DISABLED;
      } else {
        process.env.CACHE_DISABLED = previous;
      }
    }
  });
});

describe('CacheModule', () => {
  it('exposes the BADGE_CACHE token from CacheModule', async () => {
    const { BADGE_CACHE } = await import('./badge-cache');
    expect(typeof BADGE_CACHE).toBe('symbol');
  });

  it('resolves to a MemoryCacheService when CACHE_DRIVER is not redis', async () => {
    delete process.env.CACHE_DRIVER;
    const moduleRef = await Test.createTestingModule({ imports: [CacheModule] }).compile();
    expect(moduleRef.get(BADGE_CACHE)).toBeInstanceOf(MemoryCacheService);
  });
});
