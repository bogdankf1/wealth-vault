/**
 * NextAuth configuration
 */
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
      if (account && user) {
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
