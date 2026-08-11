import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/** Custom provider with an injection token — the Nest-idiomatic way to wrap a raw client. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379/0',
          {
            lazyConnect: false,
            maxRetriesPerRequest: 1,
          },
        ),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // quit() rejects if the connection never opened (e.g. already closed by a prior shutdown, or
  // never connected). e2e suites call app.close() repeatedly across test files sharing this
  // process, so swallow that rather than letting it blow up teardown.
  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      // already closed / never connected — nothing to clean up
    }
  }
}
