import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorRequestHandler, json, urlencoded } from 'express';
import { DetailException } from './common/exceptions/app.exception';
import { parseCorsOrigins } from './config/env.validation';

// Express's body-parser throws a raw SyntaxError before Nest routing when a JSON request body
// is malformed. It is not an HttpException, so unhandled it falls into GlobalExceptionFilter's
// catch-all 500 branch, while FastAPI returns 422. Mirror FastAPI's {"detail": [...]} shape here.
const handleJsonParseError: ErrorRequestHandler = (
  rawError,
  _req,
  res,
  next,
) => {
  const error: unknown = rawError;
  const isJsonParseError =
    error instanceof SyntaxError &&
    'type' in error &&
    error.type === 'entity.parse.failed';
  if (isJsonParseError) {
    res.status(422).json({
      detail: [
        {
          loc: ['body'],
          msg: 'Invalid JSON body',
          type: 'value_error.jsondecode',
        },
      ],
    });
    return;
  }
  next(error);
};

/** Applied identically in main.ts and e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Registered manually (instead of relying on Nest's automatic body parser) so our JSON
  // parse-error handler can sit right after it in the Express middleware stack — Nest only
  // wires its own body parser up inside app.init(), which runs after configureApp(), so a
  // handler added here via app.use() would otherwise land before the parser and never see its
  // errors. Nest's registerParserMiddleware() (called later, inside app.init()) detects these
  // by function name (body-parser's parsers are literally named jsonParser/urlencodedParser)
  // and skips re-adding them, so this stays a single parser, not a duplicate.
  app.use(json());
  app.use(urlencoded({ extended: true }));
  app.use(handleJsonParseError);

  app.setGlobalPrefix('api/v1', { exclude: ['/', 'health'] });

  app.enableCors({
    origin: parseCorsOrigins(config.get('CORS_ORIGINS') ?? '[]'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Accept-Language',
    ],
  });

  // FastAPI returns 422 for body validation errors; mimic the {detail: [...]} shape.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new DetailException(
          422,
          errors.map((e) => ({
            loc: ['body', e.property],
            msg: Object.values(e.constraints ?? { error: 'Invalid value' })[0],
            type: 'value_error',
          })),
        ),
    }),
  );
}
