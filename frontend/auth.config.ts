/**
 * NextAuth configuration
 */
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      id: 'demo',
      name: 'Demo',
      credentials: {},
      async authorize() {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/demo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          accessToken: data.access_token,
          backendUser: data.user,
          role: data.user.role,
          tier: data.user.tier?.name ?? 'wealth',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      const isOnAuth = nextUrl.pathname.startsWith('/login');

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated users to login page
      } else if (isLoggedIn && isOnAuth) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Initial sign in
      if (account?.provider === 'google' && user) {
        // Call backend to authenticate with Google
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/google`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              token: account.id_token,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            token.accessToken = data.access_token;
            token.user = data.user;
            token.role = data.user.role;
            token.tier = data.user.tier?.name || 'starter';
            token.error = undefined; // Clear any previous errors
          } else {
            // Backend authentication failed
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            token.error = {
              type: 'BackendAuthError',
              message: errorData.detail || `Backend authentication failed: ${response.status}`,
              status: response.status,
            };
          }
        } catch (error) {
          // Network or other error
          token.error = {
            type: 'NetworkError',
            message: 'Unable to connect to authentication server. Please check your connection and try again.',
            status: 0,
          };
        }
      }

      if (account?.provider === 'demo' && user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.accessToken = u.accessToken;
        token.user = u.backendUser;
        token.role = u.role;
        token.tier = u.tier ?? 'wealth';
        token.isDemo = true;
        token.error = undefined;
      }

      return token;
    },
    async session({ session, token }) {
      // Add custom fields to session
      if (token) {
        session.accessToken = token.accessToken as string;
        session.user = {
          ...session.user,
          id: (token.user as { id: string })?.id,
          role: token.role as string,
          tier: token.tier as string,
          isDemo: (token.isDemo as boolean | undefined) ?? false,
        };
        // Pass auth error to session if exists
        if (token.error) {
          session.error = token.error as { type: string; message: string; status: number };
        }
      }
      return session;
    },
  },
};
