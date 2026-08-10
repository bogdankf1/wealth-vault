import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  await app.listen(config.get<number>('PORT') ?? 8001);
}
bootstrap();
