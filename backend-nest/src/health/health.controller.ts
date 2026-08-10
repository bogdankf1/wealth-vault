import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { REDIS_CLIENT } from '../redis/redis.module';

interface HealthResponse {
  status: string;
  version: string;
  checks: Record<string, string>;
}

/** Mirrors GET /health in backend/app/main.py. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const health: HealthResponse = {
      status: 'healthy',
      version: this.config.get<string>('APP_VERSION') ?? '0.1.0',
      checks: {},
    };

    try {
      await this.dataSource.query('SELECT 1');
      health.checks.database = 'ok';
    } catch (err) {
      health.status = 'degraded';
      health.checks.database = `error: ${(err as Error).message}`;
    }

    try {
      await this.redis.ping();
      health.checks.redis = 'ok';
    } catch (err) {
      health.status = 'degraded';
      health.checks.redis = `error: ${(err as Error).message}`;
    }

    return health;
  }
}
