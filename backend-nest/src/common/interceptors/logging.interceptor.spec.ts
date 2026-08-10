import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

function mockContext(method: string, url: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

function mockCallHandler(): CallHandler {
  return { handle: () => of({}) };
}

describe('LoggingInterceptor', () => {
  it('logs method, url, status code and duration once the request completes', (done) => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const interceptor = new LoggingInterceptor();

    interceptor
      .intercept(mockContext('GET', '/x'), mockCallHandler())
      .subscribe({
        complete: () => {
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringMatching(/^GET \/x 200 \d+ms$/),
          );
          logSpy.mockRestore();
          done();
        },
      });
  });
});
