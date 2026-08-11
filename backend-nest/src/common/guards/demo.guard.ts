import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '../../modules/users/entities/user.entity';
import { FORBID_DEMO_KEY } from '../decorators/forbid-demo.decorator';
import { DetailException } from '../exceptions/app.exception';

@Injectable()
export class DemoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const forbidden = this.reflector.getAllAndOverride<boolean>(
      FORBID_DEMO_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!forbidden) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (user?.isDemo) {
      throw new DetailException(
        403,
        'Demo accounts cannot make real purchases.',
      );
    }
    return true;
  }
}
