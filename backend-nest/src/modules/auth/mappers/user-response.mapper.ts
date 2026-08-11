import { User } from '../../users/entities/user.entity';

/** Mirrors backend/app/schemas/user.py::UserResponse — snake_case JSON keys. */
export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatar_url: string | null;
  tier: { id: string; name: string; display_name: string } | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  user: UserResponse;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar_url: user.avatarUrl,
    tier: user.tier
      ? {
          id: user.tier.id,
          name: user.tier.name,
          display_name: user.tier.displayName,
        }
      : null,
    created_at: user.createdAt.toISOString(),
  };
}
