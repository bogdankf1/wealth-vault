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

  // Registered manually so our JSON parse-error handler can sit right after the parser in the
  // Express middleware stack — Nest only wires its own body parser up inside app.init(), which
  // runs after configureApp(), so a handler added here via app.use() would otherwise land before
  // the parser and never see its errors. This requires opting out of Nest's automatic parser
  // (NestFactory.create(AppModule, { bodyParser: false }) in main.ts, the equivalent option to
  // createNestApplication() in the e2e test) — without that opt-out, Nest's own
  // registerParserMiddleware() would silently skip re-adding these because it detects a parser
  // already present by function name, which is a coincidence of body-parser's internals we
  // shouldn't rely on. Opting out also matters for a currently-hypothetical but real future case:
  // NestFactory.create(AppModule, { rawBody: true }) only populates req.rawBody via a `verify`
  // callback on the parser Nest constructs itself, so with these manually-mounted parsers in
  // place `rawBody` would stay silently empty. A future raw-body route (Stripe/Paddle webhooks)
  // must mount its own express.raw() on that specific path ahead of these global parsers.
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
