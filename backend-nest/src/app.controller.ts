import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  @Get('/')
  root(): Record<string, string> {
    return {
      message: 'Wealth Vault API',
      version: this.config.get('APP_VERSION') ?? '0.1.0',
      docs: '/docs',
    };
  }
}
