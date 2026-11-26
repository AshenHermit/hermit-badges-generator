import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from './helpers/create-app';
import { MemoryCacheService } from '../src/cache/memory-cache.service';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_RIFF = Buffer.from('RIFF', 'ascii');
const WEBP_MAGIC = Buffer.from('WEBP', 'ascii');

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

  it('accepts emoji in both left and right', async () => {
    const res = await generate('/api/v1/generate?left=%F0%9F%98%80&right=%F0%9F%98%8E').expect(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('rejects a left containing NUL', async () => {
    await generate('/api/v1/generate?left=a%00b&right=World').expect(400);
  });

  it('rejects an invalid style', async () => {
    await generate('/api/v1/generate?left=Hello&right=World&style=nope').expect(400);
  });

  it('returns a valid WebP image for format=webp', async () => {
    const res = await generate('/api/v1/generate?left=Hello&right=World&format=webp').expect(200);
    expect(res.headers['content-type']).toContain('image/webp');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    const body = res.body as Buffer;
    expect(body.subarray(0, 4)).toEqual(WEBP_RIFF);
    expect(body.subarray(8, 12)).toEqual(WEBP_MAGIC);
  });

  it('defaults WebP height to 60px when height is omitted', async () => {
    const res = await generate('/api/v1/generate?left=Hello&right=World&format=webp').expect(200);
    const metadata = await sharp(res.body as Buffer).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.height).toBe(60);
  });

  it('resizes WebP to height=80 with RIFF/WEBP magic', async () => {
    const res = await generate('/api/v1/generate?left=Hello&right=World&format=webp&height=80').expect(200);
    const body = res.body as Buffer;
    expect(body.subarray(0, 4)).toEqual(WEBP_RIFF);
    expect(body.subarray(8, 12)).toEqual(WEBP_MAGIC);
    expect((await sharp(body).metadata()).height).toBe(80);
  });

  it('rejects an invalid format', async () => {
    await generate('/api/v1/generate?left=Hello&right=World&format=gif').expect(400);
  });

  it('produces byte-equal PNG bodies for omitted height and height=60', async () => {
    const a = await generate('/api/v1/generate?left=Hello&right=World').expect(200);
    const b = await generate('/api/v1/generate?left=Hello&right=World&height=60').expect(200);
    expect(a.body.equals(b.body)).toBe(true);
  });

  it('resizes PNG to height=80 with PNG magic and different bytes', async () => {
    const a = await generate('/api/v1/generate?left=Hello&right=World').expect(200);
    const b = await generate('/api/v1/generate?left=Hello&right=World&height=80').expect(200);
    expect(b.headers['content-type']).toContain('image/png');
    expect((b.body as Buffer).subarray(0, 8)).toEqual(PNG_MAGIC);
    expect(b.body.equals(a.body)).toBe(false);
    expect((await sharp(b.body as Buffer).metadata()).height).toBe(80);
  });

  it('rejects height=0', async () => {
    await generate('/api/v1/generate?left=Hello&right=World&height=0').expect(400);
  });

  it('rejects height=1001', async () => {
    await generate('/api/v1/generate?left=Hello&right=World&height=1001').expect(400);
  });

  it('rejects height=abc', async () => {
    await generate('/api/v1/generate?left=Hello&right=World&height=abc').expect(400);
  });

  it('rejects height=60.5', async () => {
    await generate('/api/v1/generate?left=Hello&right=World&height=60.5').expect(400);
  });

  it('caches identical text at different heights separately', async () => {
    const before = app.get(MemoryCacheService).size;
    const base = '/api/v1/generate?left=Cache&right=Height';
    const a = await generate(`${base}&height=60`).expect(200);
    const b = await generate(`${base}&height=80`).expect(200);
    expect(a.body.equals(b.body)).toBe(false);
    expect(app.get(MemoryCacheService).size).toBe(before + 2);
  });

  it('caches identical text in different formats separately', async () => {
    const before = app.get(MemoryCacheService).size;
    const base = '/api/v1/generate?left=Cache&right=Format&height=60';
    const a = await generate(`${base}&format=png`).expect(200);
    const b = await generate(`${base}&format=webp`).expect(200);
    expect(a.body.equals(b.body)).toBe(false);
    expect(app.get(MemoryCacheService).size).toBe(before + 2);
  });
});
