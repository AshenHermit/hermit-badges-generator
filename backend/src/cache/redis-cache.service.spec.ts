import { Logger } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';

describe('RedisCacheService', () => {
  const originalTtlMs = process.env.CACHE_TTL_MS;
  const originalDisabled = process.env.CACHE_DISABLED;

  let client: { get: jest.Mock; set: jest.Mock; quit: jest.Mock };
  let svc: RedisCacheService;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    process.env.CACHE_TTL_MS = '3600000';
    delete process.env.CACHE_DISABLED;
    client = {
      get: jest.fn(),
      set: jest.fn(),
      quit: jest.fn(),
    };
    svc = new RedisCacheService(client);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerError.mockRestore();
    if (originalTtlMs === undefined) {
      delete process.env.CACHE_TTL_MS;
    } else {
      process.env.CACHE_TTL_MS = originalTtlMs;
    }
    if (originalDisabled === undefined) {
      delete process.env.CACHE_DISABLED;
    } else {
      process.env.CACHE_DISABLED = originalDisabled;
    }
  });

  it('stores base64 with EX seconds and restores byte-identical Buffer', async () => {
    const raw = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);
    await svc.set('k', raw);
    expect(client.set).toHaveBeenCalledWith('badge:k', raw.toString('base64'), 'EX', 3600);
    client.get.mockResolvedValue(raw.toString('base64'));
    expect(await svc.get('k')).toEqual(raw);
  });

  it('returns undefined on miss', async () => {
    client.get.mockResolvedValue(null);
    expect(await svc.get('k')).toBeUndefined();
  });

  it('does not touch redis when CACHE_DISABLED is true', async () => {
    process.env.CACHE_DISABLED = 'true';
    await svc.set('k', Buffer.from('x'));
    expect(await svc.get('k')).toBeUndefined();
    expect(client.set).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
  });

  it('degrades to render-through when redis fails', async () => {
    client.get.mockRejectedValue(new Error('down'));
    client.set.mockRejectedValue(new Error('down'));
    await expect(svc.get('k')).resolves.toBeUndefined();
    await expect(svc.set('k', Buffer.from('x'))).resolves.toBeUndefined();
  });
});
