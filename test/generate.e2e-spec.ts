import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';
import { MemoryCacheService } from '../src/cache/memory-cache.service';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('generate', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const generate = (url: string) => request(app.getHttpServer()).get(url);

  it('serves 20 parallel identical requests from the cache', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => generate('/api/v1/generate?left=Parallel&right=Test').expect(200)),
    );
    const bodies = responses.map((res) => res.body as Buffer);
    for (const body of bodies) {
      expect(body.equals(bodies[0])).toBe(true);
    }
    expect(app.get(MemoryCacheService).size).toBe(1);
  });

  it('returns 200 with PNG magic for left=Hello&right=World', async () => {
    const res = await generate('/api/v1/generate?left=Hello&right=World').expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('is byte-equal when query params are reversed', async () => {
    const a = await generate('/api/v1/generate?left=Hello&right=World').expect(200);
    const b = await generate('/api/v1/generate?right=World&left=Hello').expect(200);
    expect(a.body.equals(b.body)).toBe(true);
  });

  it('produces different bytes for different right text', async () => {
    const a = await generate('/api/v1/generate?left=Hello&right=World').expect(200);
    const b = await generate('/api/v1/generate?left=Hello&right=There').expect(200);
    expect(a.body.equals(b.body)).toBe(false);
  });

  it('accepts a 32-char left and rejects a 33-char left', async () => {
    const ok = await generate(`/api/v1/generate?left=${'a'.repeat(32)}&right=World`).expect(200);
    expect(ok.body.subarray(0, 8)).toEqual(PNG_MAGIC);
    await generate(`/api/v1/generate?left=${'a'.repeat(33)}&right=World`).expect(400);
  });

  it('accepts an emoji left', async () => {
    const res = await generate('/api/v1/generate?left=%F0%9F%98%80&right=World').expect(200);
    expect(res.body.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('rejects a left containing NUL', async () => {
    await generate('/api/v1/generate?left=a%00b&right=World').expect(400);
  });

  it('rejects an invalid style', async () => {
    await generate('/api/v1/generate?left=Hello&right=World&style=nope').expect(400);
  });

  it('rejects an invalid format', async () => {
    await generate('/api/v1/generate?left=Hello&right=World&format=webp').expect(400);
  });
});
