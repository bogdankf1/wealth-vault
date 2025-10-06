/**
 * Type definitions for NextAuth
 */
import NextAuth, { DefaultSession } from 'next-auth';
import { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      id?: string;
      role?: string;
      tier?: string;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    role?: string;
    tier?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    user?: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      tier: {
        id: string;
        name: string;
        display_name: string;
      } | null;
    };
    role?: string;
    tier?: string;
  }
}
