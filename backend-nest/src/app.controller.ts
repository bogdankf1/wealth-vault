import { All, Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DetailException } from './common/exceptions/app.exception';

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

  // Parity gap routed from the Task 4 review: Starlette's default 404 has no detail text, so
  // FastAPI renders {"detail":"Not Found"}; Nest/Express default to {"detail":"Cannot GET /x"}.
  // Declared last in this controller (Nest registers routes in declaration order and Express
  // matches first-registered-wins) so it can never shadow the root route above, and this
  // controller must stay the last one registered in app.module.ts as new controllers are added
  // in later tasks, so this can't shadow their routes either. Once guards exist (Task 6) this
  // should be marked @Public().
  @All('*path')
  notFound(): never {
    throw new DetailException(404, 'Not Found');
  }
}
