import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Tier } from '../tiers/entities/tier.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';

const googleInfo = {
  email: 'new@x.com',
  name: 'New',
  picture: null,
  sub: 'g-123',
};

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'u-1',
    email: 'new@x.com',
    name: 'New',
    avatarUrl: null,
    role: UserRole.USER,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    tier: { id: 't-1', name: 'wealth', displayName: 'Wealth' },
    ...overrides,
  });
}

describe('AuthService.googleLogin', () => {
  let service: AuthService;
  const usersService = {
    findByGoogleId: jest.fn(),
    createFromGoogle: jest.fn(),
    findByIdWithTier: jest.fn(),
  };
  const tiersRepo = { findOne: jest.fn() };
  const googleService = {
    verifyIdToken: jest.fn().mockResolvedValue(googleInfo),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt') };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: GoogleOAuthService, useValue: googleService },
        { provide: JwtService, useValue: jwtService },
        { provide: getRepositoryToken(Tier), useValue: tiersRepo },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('returns token + snake_case user for an existing user', async () => {
    const user = makeUser();
    usersService.findByGoogleId.mockResolvedValue(user);
    usersService.findByIdWithTier.mockResolvedValue(user);

    const result = await service.googleLogin('google-token');

    expect(result.access_token).toBe('signed.jwt');
    expect(result.token_type).toBe('bearer');
    expect(result.user).toEqual({
      id: 'u-1',
      email: 'new@x.com',
      name: 'New',
      role: 'USER',
      avatar_url: null,
      tier: { id: 't-1', name: 'wealth', display_name: 'Wealth' },
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'u-1',
      email: 'new@x.com',
      role: 'USER',
      tier: 'wealth',
    });
  });

  it('creates a new user on the wealth tier when none exists', async () => {
    const user = makeUser();
    usersService.findByGoogleId.mockResolvedValue(null);
    tiersRepo.findOne.mockResolvedValue({
      id: 't-1',
      name: 'wealth',
      displayName: 'Wealth',
    });
    usersService.createFromGoogle.mockResolvedValue(user);
    usersService.findByIdWithTier.mockResolvedValue(user);

    await service.googleLogin('google-token');

    expect(usersService.createFromGoogle).toHaveBeenCalledWith({
      email: 'new@x.com',
      name: 'New',
      avatarUrl: null,
      googleId: 'g-123',
      tier: { id: 't-1', name: 'wealth', displayName: 'Wealth' },
    });
  });

  it('throws 500 detail when the wealth tier is missing', async () => {
    usersService.findByGoogleId.mockResolvedValue(null);
    tiersRepo.findOne.mockResolvedValue(null);
    await expect(service.googleLogin('google-token')).rejects.toThrow(
      'Wealth tier not found. Please run database migrations.',
    );
  });
});
