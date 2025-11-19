/**
 * Type definitions for NextAuth
 */
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: {
      type: string;
      message: string;
      status: number;
    };
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
    error?: {
      type: string;
      message: string;
      status: number;
    };
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
