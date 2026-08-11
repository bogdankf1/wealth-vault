import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { DemoGuard } from './common/guards/demo.guard';
import { FeatureGuard } from './common/guards/feature.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { InstallmentsModule } from './modules/installments/installments.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { GoalsModule } from './modules/goals/goals.module';
import { IncomeModule } from './modules/income/income.module';
import { SavingsModule } from './modules/savings/savings.module';
import { TiersModule } from './modules/tiers/tiers.module';
import { UsersModule } from './modules/users/users.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Mirrors backend/app/core/limiter.py's slowapi defaults: 120/minute, in-memory storage.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    RedisModule,
    TiersModule,
    UsersModule,
    AuthModule,
    SavingsModule,
    GoalsModule,
    CurrencyModule,
    IncomeModule,
    ExpensesModule,
    SubscriptionsModule,
    InstallmentsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    {
      provide: APP_FILTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new GlobalExceptionFilter(config.get('DEBUG') === true),
    },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Order matters: ThrottlerGuard must run first so unauthenticated requests are rate-limited
    // too (matching slowapi, which limits everything). JwtAuthGuard populates request.user;
    // Roles/Feature/DemoGuard read it.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_GUARD, useClass: DemoGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
