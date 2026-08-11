import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { registerNaiveTimestampParser } from './common/time/naive-timestamp';

async function bootstrap() {
  // Before anything can open a connection: naive timestamps must arrive as raw strings.
  registerNaiveTimestampParser();
  // bodyParser: false — configureApp() mounts json()/urlencoded() itself so its JSON
  // parse-error handler can sit right after them; see the comment there for why.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Wealth Vault API')
    .setDescription(
      'Ultimate personal finance management platform API (NestJS v2)',
    )
    .setVersion(config.get('APP_VERSION') ?? '0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  // Without this, RedisModule.onApplicationShutdown and TypeORM's own shutdown hook only run
  // when tests call app.close() explicitly — a real SIGTERM would leave connections dangling.
  app.enableShutdownHooks();

  await app.listen(config.get<number>('PORT') ?? 8001);
}
bootstrap();
