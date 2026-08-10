import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Throttling (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    // bodyParser: false — configureApp() mounts json()/urlencoded() itself (see the comment
    // in app.setup.ts), so this must share the same opt-out as the other e2e suites.
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 with the slowapi-style body after 120 requests/minute', async () => {
    for (let i = 0; i < 120; i++) {
      await request(app.getHttpServer()).get('/').expect(200);
    }
    const res = await request(app.getHttpServer()).get('/').expect(429);
    expect(res.body).toEqual({
      error: 'Rate limit exceeded: 120 per 1 minute',
    });
  }, 30000);
});
