import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('App bootstrap (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the FastAPI root shape', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.body).toEqual({
      message: 'Wealth Vault API',
      version: '0.1.0',
      docs: '/docs',
    });
  });

  it('sets the security headers', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-xss-protection']).toBe('1; mode=block');
    expect(res.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(res.headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  });

  it('unknown route renders {detail} shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .expect(404);
    expect(res.body).toHaveProperty('detail');
  });

  // Parity gap routed from the Task 4 review: Starlette's default 404 has no detail text,
  // so FastAPI renders {"detail":"Not Found"}; Express/Nest default to "Cannot GET /path".
  it('unknown route matches FastAPI\'s exact {"detail":"Not Found"} body', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .expect(404);
    expect(res.body).toEqual({ detail: 'Not Found' });
  });

  // Parity gap routed from the Task 4 review: a raw body-parser SyntaxError is not an
  // HttpException, so unhandled it falls into the catch-all 500 branch; FastAPI returns 422.
  it('malformed JSON body returns 422 with a detail array', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/nope')
      .set('Content-Type', 'application/json')
      .send('{"broken": ')
      .expect(422);
    const body = res.body as { detail?: unknown };
    expect(Array.isArray(body.detail)).toBe(true);
  });
});
