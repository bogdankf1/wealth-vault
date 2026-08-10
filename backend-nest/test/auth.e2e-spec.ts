import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { GoogleOAuthService } from '../src/modules/auth/google-oauth.service';

describe('Auth (e2e, against live dev DB)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const email = `nest-e2e-${randomUUID().slice(0, 8)}@example.com`;
  const googleSub = `nest-e2e-sub-${randomUUID()}`;
  let token: string;
  let firstUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleOAuthService)
      .useValue({
        verifyIdToken: jest.fn().mockResolvedValue({
          email,
          name: 'E2E User',
          picture: null,
          sub: googleSub,
        }),
      })
      .compile();
    // bodyParser: false — configureApp() mounts json()/urlencoded() itself; see app.setup.ts.
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  // try/finally so a DELETE failure (or dataSource/app never having been assigned because
  // beforeAll threw before reaching that line) can never skip app.close() — an unclosed Nest
  // app leaks its DB pool and can hang the Jest process. Tolerant of both being undefined.
  afterAll(async () => {
    try {
      if (dataSource) {
        await dataSource.query('DELETE FROM users WHERE email = $1', [email]);
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('POST /api/v1/auth/google creates a user and returns TokenResponse', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ token: 'mocked' })
      .expect(201);
    const body = res.body as {
      token_type: string;
      access_token: string;
      user: {
        id: string;
        email: string;
        tier: { name: string };
        avatar_url: unknown;
        created_at: unknown;
      };
    };
    expect(body.token_type).toBe('bearer');
    expect(body.user.email).toBe(email);
    expect(body.user.tier.name).toBe('wealth');
    expect(body.user).toHaveProperty('avatar_url');
    expect(body.user).toHaveProperty('created_at');
    token = body.access_token;
    firstUserId = body.user.id;
  });

  // Fix 1 (review): the test above only ever exercises the new-user creation branch of
  // AuthService.googleLogin (fresh googleSub every run). This logs in with the SAME mocked
  // Google identity a second time, which must hit the existing-user branch — findByGoogleId
  // returns non-null against the real DB — and must NOT create a second row. The row-count
  // assertion is the one that would actually catch a regression back to always-insert.
  it('POST /api/v1/auth/google again with the same Google identity logs in the existing user, not a duplicate', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ token: 'mocked' })
      .expect(201);
    const body = res.body as {
      user: { id: string; email: string; tier: { name: string } | null };
    };
    expect(body.user.id).toBe(firstUserId);
    expect(body.user.email).toBe(email);
    expect(body.user.tier?.name).toBe('wealth');

    const rows: Array<{ id: string }> = await dataSource.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(firstUserId);
  });

  it('GET /api/v1/auth/me returns the user with a valid token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as { email: string; role: string };
    expect(body.email).toBe(email);
    expect(body.role).toBe('USER');
  });

  it('GET /api/v1/auth/me without a header → FastAPI 401 shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);
    expect(res.body).toEqual({
      detail: 'Invalid authorization header format. Expected: Bearer <token>',
    });
  });

  it('GET /api/v1/auth/me with a garbage token → 401 credentials message', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    expect(res.body).toEqual({ detail: 'Could not validate credentials' });
  });

  it('POST /api/v1/auth/google with missing token → 422 validation shape', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({})
      .expect(422);
    const body = res.body as { detail: Array<{ loc: unknown; msg: unknown }> };
    expect(Array.isArray(body.detail)).toBe(true);
    expect(body.detail[0]).toHaveProperty('loc');
    expect(body.detail[0]).toHaveProperty('msg');
  });

  it('GET /api/v1/auth/me/features returns the features map', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me/features')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('features');
  });
});
