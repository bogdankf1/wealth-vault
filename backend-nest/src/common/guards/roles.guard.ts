import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User, UserRole } from '../../modules/users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  DetailException,
  ForbiddenException,
} from '../exceptions/app.exception';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    // request.user is only absent here if a route conflicts @Public() with @Roles() — global
    // JwtAuthGuard runs first and either populates it or already threw a 401. Treat that as
    // unauthenticated (401), not a crash: we don't know who's asking, so there's no role to
    // check yet. Reuses JwtAuthGuard's own generic message for a consistent auth vocabulary.
    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (!user) throw new DetailException(401, 'Could not validate credentials');
    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        required.includes(UserRole.ADMIN)
          ? 'Admin access required'
          : `This action requires ${required[0]} role`,
      );
    }
    return true;
  }
}
