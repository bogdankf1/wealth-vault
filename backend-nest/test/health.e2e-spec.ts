import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Health (e2e)', () => {
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

  it('GET /health returns the FastAPI health shape with ok checks', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const body = res.body as {
      status: string;
      version: string;
      checks: Record<string, string>;
    };
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('0.1.0');
    expect(body.checks).toEqual({ database: 'ok', redis: 'ok' });
  });
});
