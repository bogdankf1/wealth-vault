/**
 * Next.js middleware for route protection
 */
import { auth } from './auth';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Public routes
  const isPublicRoute = pathname === '/' || pathname === '/login' || pathname.startsWith('/api');

  // Protect dashboard routes
  if (!isLoggedIn && pathname.startsWith('/dashboard')) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }

  // Redirect logged-in users from login page to dashboard
  if (isLoggedIn && pathname === '/login') {
    return Response.redirect(new URL('/dashboard', req.url));
  }

  return undefined;
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
