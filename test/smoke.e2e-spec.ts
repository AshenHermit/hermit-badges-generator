import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';

describe('smoke', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/docs returns 200', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  it('GET /nope returns 404', async () => {
    await request(app.getHttpServer()).get('/nope').expect(404);
  });
});
