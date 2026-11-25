import { CacheKeyFactory } from './cache-key.factory';
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

  it('set/get returns the same Buffer', () => {
    const svc = new MemoryCacheService(1000, 10);
    const buf = Buffer.from('hello');
    svc.set('k', buf);
    expect(svc.get('k')).toBe(buf);
  });

  it('expires entries after ttlMs', () => {
    jest.useFakeTimers();
    const svc = new MemoryCacheService(1000, 10);
    svc.set('k', Buffer.from('v'));
    expect(svc.get('k')).toBeDefined();
    jest.advanceTimersByTime(1001);
    expect(svc.get('k')).toBeUndefined();
  });

  it('evicts the least-recently-used entry beyond maxEntries', () => {
    const svc = new MemoryCacheService(1000, 2);
    svc.set('a', Buffer.from('a'));
    svc.set('b', Buffer.from('b'));
    expect(svc.size).toBe(2);
    svc.get('a'); // refresh a, making b the LRU
    svc.set('c', Buffer.from('c'));
    expect(svc.size).toBe(2);
    expect(svc.get('a')).toBeDefined();
    expect(svc.get('b')).toBeUndefined();
    expect(svc.get('c')).toBeDefined();
  });
});
