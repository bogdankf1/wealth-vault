import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

function mockConfig(debug: boolean): ConfigService {
  return { get: jest.fn().mockReturnValue(debug) } as unknown as ConfigService;
}

// Kept as an untyped literal (not cast to Response) so `res.setHeader` stays a plain jest.fn()
// rather than a torn-off Response method, which would trip @typescript-eslint/unbound-method.
function mockRes() {
  return { setHeader: jest.fn() };
}

describe('SecurityHeadersMiddleware', () => {
  it('sets the baseline security headers and calls next()', () => {
    const middleware = new SecurityHeadersMiddleware(mockConfig(true));
    const res = mockRes();
    const next: NextFunction = jest.fn();

    middleware.use({} as Request, res as unknown as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-XSS-Protection',
      '1; mode=block',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Referrer-Policy',
      'strict-origin-when-cross-origin',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('omits Strict-Transport-Security when DEBUG is true', () => {
    const middleware = new SecurityHeadersMiddleware(mockConfig(true));
    const res = mockRes();

    middleware.use({} as Request, res as unknown as Response, jest.fn());

    expect(res.setHeader).not.toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.anything(),
    );
  });

  // Previously untested branch: HSTS is only sent in non-debug (production-like) mode.
  it('sets Strict-Transport-Security when DEBUG is false', () => {
    const middleware = new SecurityHeadersMiddleware(mockConfig(false));
    const res = mockRes();

    middleware.use({} as Request, res as unknown as Response, jest.fn());

    expect(res.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  });
});
