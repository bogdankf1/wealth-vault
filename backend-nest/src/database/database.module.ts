import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { EnvironmentVariables } from '../config/env.validation';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        type: 'postgres' as const,
        url: config.get('DATABASE_URL', { infer: true }),
        autoLoadEntities: true,
        synchronize: false, // Alembic owns the schema — NEVER flip this
        namingStrategy: new SnakeNamingStrategy(),
        logging: config.get('DEBUG', { infer: true })
          ? ['query', 'error']
          : ['error'],
      }),
    }),
  ],
})
export class DatabaseModule {}
