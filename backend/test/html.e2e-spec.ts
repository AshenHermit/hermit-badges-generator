import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';

describe('HTML badge endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => request(app.getHttpServer()).get(url);

  it('returns the prepared HTML page for iframe embedding', async () => {
    const res = await get(
      '/api/v1/generate/html?template=garrison-cat-badge&left=Hello&right=World',
    ).expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain(
      '<base href="/api/v1/assets/templates/garrison-cat-badge/">',
    );
    expect(res.text).toContain('Hello');
    expect(res.text).toContain('World');
    expect(res.text).not.toContain('{{LEFT}}');
  });

  it('escapes user text in the HTML response', async () => {
    const res = await get(
      '/api/v1/generate/html?template=garrison-cat-badge&left=%3Cscript%3E&right=World',
    ).expect(200);

    expect(res.text).toContain('&lt;script&gt;');
  });

  it('rejects an unknown template', async () => {
    await get('/api/v1/generate/html?template=nope').expect(400);
  });

  it('serves template assets and rejects traversal', async () => {
    const font = await get('/api/v1/assets/fonts/Lipstick-Rage.ttf').expect(200);
    expect(font.headers['content-type']).toContain('font/ttf');

    const traversal = await get('/api/v1/assets/../package.json');
    expect(traversal.status).toBeGreaterThanOrEqual(400);
  });
});
