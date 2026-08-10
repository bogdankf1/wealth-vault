import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { AppException, DetailException } from '../exceptions/app.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly debug: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppException) {
      this.logger.error(`AppException: ${exception.message}`);
      res.status(exception.statusCode).json({
        error: exception.message,
        details: exception.details,
        status_code: exception.statusCode,
      });
      return;
    }

    if (exception instanceof DetailException) {
      res.status(exception.statusCode).json({ detail: exception.detail });
      return;
    }

    if (exception instanceof ThrottlerException) {
      res.status(429).json({ error: 'Rate limit exceeded: 120 per 1 minute' });
      return;
    }

    // Nest built-ins (404 on unknown route, etc.) → FastAPI HTTPException shape
    if (exception instanceof HttpException) {
      const body: unknown = exception.getResponse();
      let detail: unknown = body;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        detail = (body as Record<string, unknown>).message;
      }
      const status = exception.getStatus();
      // Parity gap: Nest's router converts an unmatched request into its own
      // NotFoundException("Cannot GET /x") before it ever reaches application code, while
      // FastAPI/Starlette's equivalent carries no detail text ({"detail":"Not Found"}). We
      // can't distinguish "the router's 404" from "an application-thrown 404" by `instanceof`
      // — importing NotFoundException from @nestjs/common to check for it is banned project-wide
      // (no-restricted-imports in eslint.config.mjs), precisely because intentional 404s in this
      // codebase must go through the app's own NotFoundException/DetailException instead, which
      // are handled by the branches above and never reach here. So in practice any HttpException
      // that both (a) is not one of those app types and (b) carries status 404 has no other
      // legitimate source in this codebase than the router's unmatched-route handler, making a
      // plain status check the narrowest rule available. Residual gap: a future `throw new
      // HttpException(msg, 404)` (the base class stays importable) would also get overwritten —
      // avoid that by always throwing the app's DetailException(404, msg) for intentional 404s.
      if (status === 404) {
        detail = 'Not Found';
      }
      res.status(status).json({ detail });
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(500).json({
      error: 'Internal server error',
      details:
        this.debug && exception instanceof Error
          ? { message: exception.message }
          : {},
      status_code: 500,
    });
  }
}
