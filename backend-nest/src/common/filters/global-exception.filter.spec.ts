import { ArgumentsHost } from '@nestjs/common';
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
});
