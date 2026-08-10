import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { DetailException } from '../exceptions/app.exception';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    // e.g. DetailException from strategy.validate. err is unknown here (passport's callback
    // signature), so narrow before throwing to satisfy @typescript-eslint/only-throw-error.
    if (err)
      throw err instanceof Error
        ? err
        : new Error('Unknown authentication error');
    if (!user) {
      const message = info instanceof Error ? info.message : '';
      if (message === 'No auth token') {
        throw new DetailException(
          401,
          'Invalid authorization header format. Expected: Bearer <token>',
        );
      }
      throw new DetailException(401, 'Could not validate credentials');
    }
    return user;
  }
}
