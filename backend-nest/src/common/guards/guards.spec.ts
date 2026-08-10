import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { DetailException } from '../exceptions/app.exception';
import { UserRole } from '../../modules/users/entities/user.entity';
import { RolesGuard } from './roles.guard';
import { DemoGuard } from './demo.guard';
import { FeatureGuard } from './feature.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctxWithUser(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('passes when no @Roles metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    expect(
      new RolesGuard(reflector).canActivate(ctxWithUser({ role: 'USER' })),
    ).toBe(true);
  });

  it('passes an ADMIN when ADMIN required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    expect(
      new RolesGuard(reflector).canActivate(ctxWithUser({ role: 'ADMIN' })),
    ).toBe(true);
  });

  it('rejects a USER when ADMIN required with the FastAPI message', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    expect(() =>
      new RolesGuard(reflector).canActivate(ctxWithUser({ role: 'USER' })),
    ).toThrow('Admin access required');
  });
});

describe('DemoGuard', () => {
  it('passes non-demo users on @ForbidDemo routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    expect(
      new DemoGuard(reflector).canActivate(ctxWithUser({ isDemo: false })),
    ).toBe(true);
  });

  it('rejects demo users on @ForbidDemo routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    expect(() =>
      new DemoGuard(reflector).canActivate(ctxWithUser({ isDemo: true })),
    ).toThrow('Demo accounts cannot make real purchases.');
  });
});

// Encouraged (not required) by the task brief: pins down which passport-jwt `info` value maps
// to which 401 message. Verified against passport-jwt's source directly: strategy.js calls
// `self.fail(new Error("No auth token"))` when jwtFromRequest extracts nothing, and
// `self.fail(jwt_err)` (a different Error) when the token fails verification.
describe('JwtAuthGuard.handleRequest', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  it('maps passport-jwt\'s "No auth token" info to the header-format 401 message', () => {
    const guard = new JwtAuthGuard(reflector);
    expect(() =>
      guard.handleRequest(null, false, new Error('No auth token')),
    ).toThrow('Invalid authorization header format. Expected: Bearer <token>');
  });

  it('maps any other passport-jwt failure info to the generic 401 message', () => {
    const guard = new JwtAuthGuard(reflector);
    expect(() =>
      guard.handleRequest(null, false, new Error('jwt malformed')),
    ).toThrow('Could not validate credentials');
  });

  it('also falls back to the generic 401 message when info is absent', () => {
    const guard = new JwtAuthGuard(reflector);
    expect(() => guard.handleRequest(null, false, undefined)).toThrow(
      'Could not validate credentials',
    );
  });

  it('rethrows strategy errors as-is (e.g. DetailException("User not found") from validate())', () => {
    const guard = new JwtAuthGuard(reflector);
    const strategyError = new DetailException(401, 'User not found');
    expect(() => guard.handleRequest(strategyError, false, undefined)).toThrow(
      'User not found',
    );
  });

  it('returns the authenticated user on success', () => {
    const guard = new JwtAuthGuard(reflector);
    const user = { id: 'u1' };
    expect(guard.handleRequest(null, user, undefined)).toBe(user);
  });
});

describe('FeatureGuard', () => {
  it('passes when no @RequireFeature metadata', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const dataSource = {} as DataSource;
    await expect(
      new FeatureGuard(reflector, dataSource).canActivate(
        ctxWithUser({ isAdmin: () => false }),
      ),
    ).resolves.toBe(true);
  });

  it('passes an admin regardless of tier', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('ai_insights'),
    } as unknown as Reflector;
    const dataSource = { getRepository: jest.fn() } as unknown as DataSource;
    await expect(
      new FeatureGuard(reflector, dataSource).canActivate(
        ctxWithUser({ isAdmin: () => true }),
      ),
    ).resolves.toBe(true);
  });

  it('throws TierLimitException with required_tier "growth" when the feature is missing', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('ai_insights'),
    } as unknown as Reflector;
    const findOne = jest.fn().mockResolvedValue(null);
    const dataSource = {
      getRepository: () => ({ findOne }),
    } as unknown as DataSource;
    const user = {
      isAdmin: () => false,
      tierId: 'tier-1',
      tier: { name: 'starter' },
    };
    await expect(
      new FeatureGuard(reflector, dataSource).canActivate(ctxWithUser(user)),
    ).rejects.toMatchObject({
      details: { required_tier: 'growth', current_tier: 'starter' },
    });
  });

  it('passes when the tier has the feature enabled', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('ai_insights'),
    } as unknown as Reflector;
    const findOne = jest.fn().mockResolvedValue({ id: 'tf1' });
    const dataSource = {
      getRepository: () => ({ findOne }),
    } as unknown as DataSource;
    const user = {
      isAdmin: () => false,
      tierId: 'tier-1',
      tier: { name: 'growth' },
    };
    await expect(
      new FeatureGuard(reflector, dataSource).canActivate(ctxWithUser(user)),
    ).resolves.toBe(true);
  });
});
