import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DetailException } from '../../common/exceptions/app.exception';

export interface OAuthUserInfo {
  email: string;
  name: string | null;
  picture: string | null;
  sub: string;
}

/** Mirrors verify_google_token in backend/app/api/v1/auth.py. */
@Injectable()
export class GoogleOAuthService {
  constructor(private readonly config: ConfigService) {}

  async verifyIdToken(token: string): Promise<OAuthUserInfo> {
    let response: Response;
    try {
      response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
      );
    } catch (err) {
      throw new DetailException(
        503,
        `Failed to verify token: ${(err as Error).message}`,
      );
    }

    if (!response.ok) throw new DetailException(401, 'Invalid Google token');

    const data: unknown = await response.json();
    const info = data as Record<string, unknown>;
    if (info.aud !== this.config.get<string>('GOOGLE_CLIENT_ID')) {
      throw new DetailException(401, 'Token not issued for this application');
    }

    return {
      email: info.email as string,
      name: (info.name as string | undefined) ?? null,
      picture: (info.picture as string | undefined) ?? null,
      sub: info.sub as string,
    };
  }
}
