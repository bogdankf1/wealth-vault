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
      res.status(exception.getStatus()).json({ detail });
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
