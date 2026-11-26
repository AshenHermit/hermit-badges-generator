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
  }, 30000);

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

  it('accepts an explicit template id', async () => {
    const res = await generate(
      '/api/v1/generate?template=hermit-frame&left=Hello&right=World',
    ).expect(200);
    expect((res.body as Buffer).subarray(0, 8)).toEqual(PNG_MAGIC);
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

  it('requires left and right', async () => {
    await generate('/api/v1/generate?right=World').expect(400);
    await generate('/api/v1/generate?left=Hello').expect(400);
  });

  it('rejects an unknown template', async () => {
    await generate('/api/v1/generate?template=nope&left=Hello&right=World').expect(400);
  });

  it('rejects an unknown template parameter', async () => {
    await generate('/api/v1/generate?left=Hello&right=World&mystery=x').expect(400);
  });

  it('accepts hex and rgb colors and produces different bytes', async () => {
    const base = '/api/v1/generate?left=Colors&right=Test';
    const a = await generate(base).expect(200);
    const b = await generate(`${base}&borderColor=%23ff0000`).expect(200);
    const c = await generate(`${base}&leftBgColor=rgb(1%2C2%2C3)&rightBgColor=%230f0`).expect(200);
    const d = await generate(`${base}&textColor=%23ffffff`).expect(200);

    expect(a.body.equals(b.body)).toBe(false);
    expect(b.body.equals(c.body)).toBe(false);
    expect(c.body.equals(d.body)).toBe(false);
    expect((a.body as Buffer).subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('caches identical colors together and different colors separately', async () => {
    const base = '/api/v1/generate?left=Cache&right=Colors';
    const before = app.get(MemoryCacheService).size;
    await generate(`${base}&borderColor=%23f00`).expect(200);
    await generate(`${base}&borderColor=rgb(255%2C0%2C0)`).expect(200);
    expect(app.get(MemoryCacheService).size).toBe(before + 1);
    await generate(`${base}&borderColor=%2300f`).expect(200);
    expect(app.get(MemoryCacheService).size).toBe(before + 2);
  });

  it('rejects invalid colors', async () => {
    const base = '/api/v1/generate?left=Hello&right=World';
    await generate(`${base}&borderColor=red`).expect(400);
    await generate(`${base}&textColor=%2312345`).expect(400);
    await generate(`${base}&leftBgColor=rgb(300%2C0%2C0)`).expect(400);
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

describe('template parameters endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists template ids', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/templates').expect(200);
    expect(res.body).toContain('hermit-frame');
  });

  it('returns query parameter definitions for a template', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/templates/hermit-frame')
      .expect(200);

    expect(res.body.id).toBe('hermit-frame');
    const byName = Object.fromEntries(
      (res.body.parameters as Array<{ name: string }>).map((param) => [param.name, param]),
    );
    expect(byName.left).toEqual(
      expect.objectContaining({ type: 'string', required: true, maxLength: 32 }),
    );
    expect(byName.borderColor).toEqual(
      expect.objectContaining({ type: 'color', required: false, default: 'rgb(41, 39, 45)' }),
    );
    expect(byName.textColor).toEqual(
      expect.objectContaining({ type: 'color', required: false, default: '#e8e6df' }),
    );
    expect(res.body.parameters).toHaveLength(6);
  });

  it('rejects an unknown template', async () => {
    await request(app.getHttpServer()).get('/api/v1/templates/nope').expect(400);
  });
});
