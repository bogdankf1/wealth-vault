import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User, UserRole } from '../../modules/users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ForbiddenException } from '../exceptions/app.exception';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: User }>();
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
