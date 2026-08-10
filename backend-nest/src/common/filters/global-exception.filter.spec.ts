import { ArgumentsHost, HttpException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  DetailException,
  NotFoundException,
  TierLimitException,
} from '../exceptions/app.exception';
import { GlobalExceptionFilter } from './global-exception.filter';

function mockHost() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'GET', url: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter(false); // debug=false

  it('renders AppException as {error, details, status_code}', () => {
    const { host, res } = mockHost();
    filter.catch(
      new NotFoundException('Income source not found', { id: '1' }),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Income source not found',
      details: { id: '1' },
      status_code: 404,
    });
  });

  it('renders TierLimitException with tier details', () => {
    const { host, res } = mockHost();
    filter.catch(
      new TierLimitException('Higher tier required', 'starter', 'growth'),
      host,
    );
    expect(res.json).toHaveBeenCalledWith({
      error: 'Higher tier required',
      details: { current_tier: 'starter', required_tier: 'growth' },
      status_code: 403,
    });
  });

  it('renders DetailException as {detail}', () => {
    const { host, res } = mockHost();
    filter.catch(
      new DetailException(401, 'Could not validate credentials'),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      detail: 'Could not validate credentials',
    });
  });

  it('renders ThrottlerException like slowapi', () => {
    const { host, res } = mockHost();
    filter.catch(new ThrottlerException(), host);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Rate limit exceeded: 120 per 1 minute',
    });
  });

  it('renders unknown errors as FastAPI-style 500 (details hidden when not debug)', () => {
    const { host, res } = mockHost();
    filter.catch(new Error('boom'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      details: {},
      status_code: 500,
    });
  });

  it('includes error message in 500 details when debug', () => {
    const { host, res } = mockHost();
    new GlobalExceptionFilter(true).catch(new Error('boom'), host);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      details: { message: 'boom' },
      status_code: 500,
    });
  });

  // Constructed via the base HttpException (not @nestjs/common's NotFoundException,
  // which the no-restricted-imports rule blocks) with the exact object shape Nest's
  // own convenience exceptions produce via HttpException.createBody() — this is what
  // an unmatched route actually throws. FastAPI/Starlette's default 404 carries no
  // detail text, so the filter rewrites the message to match rather than leaking
  // Nest's "Cannot GET /x" wording.
  it('rewrites an unmatched-route 404 to FastAPI\'s exact {"detail":"Not Found"}', () => {
    const { host, res } = mockHost();
    filter.catch(
      new HttpException(
        { statusCode: 404, message: 'Cannot GET /x', error: 'Not Found' },
        404,
      ),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ detail: 'Not Found' });
  });

  it('renders a Nest HttpException with an array message body sensibly', () => {
    const { host, res } = mockHost();
    filter.catch(
      new HttpException(
        {
          statusCode: 400,
          message: ['name should not be empty', 'email must be an email'],
          error: 'Bad Request',
        },
        400,
      ),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      detail: ['name should not be empty', 'email must be an email'],
    });
  });

  it('renders DetailException with an array detail as a real array (422 validation shape)', () => {
    const { host, res } = mockHost();
    filter.catch(
      new DetailException(422, [
        {
          loc: ['body', 'token'],
          msg: 'field required',
          type: 'value_error.missing',
        },
      ]),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      detail: [
        {
          loc: ['body', 'token'],
          msg: 'field required',
          type: 'value_error.missing',
        },
      ],
    });
  });
});
