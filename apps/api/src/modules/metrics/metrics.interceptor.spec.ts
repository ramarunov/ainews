import { of, throwError } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('MetricsInterceptor', () => {
  let interceptor: MetricsInterceptor;
  let metrics: MetricsService;

  const buildContext = (req: any, res: any): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    metrics = new MetricsService();
    metrics.onModuleInit();
    interceptor = new MetricsInterceptor(metrics);
  });

  it('records a request with its matched route, method, and status on success', (done) => {
    const req = { method: 'GET', route: { path: '/api/v1/articles' }, url: '/api/v1/articles?x=1' };
    const res = { statusCode: 200 };
    const handler: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(buildContext(req, res), handler).subscribe(async () => {
      const output = await metrics.getMetrics();
      expect(output).toMatch(/http_requests_total\{method="GET",route="\/api\/v1\/articles",status="200"\} 1/);
      done();
    });
  });

  it('falls back to the raw URL when no route was matched (e.g. a 404)', (done) => {
    const req = { method: 'GET', route: undefined, url: '/api/v1/does-not-exist' };
    const res = { statusCode: 404 };
    const handler: CallHandler = { handle: () => of('not found') };

    interceptor.intercept(buildContext(req, res), handler).subscribe(async () => {
      const output = await metrics.getMetrics();
      expect(output).toContain('route="/api/v1/does-not-exist"');
      done();
    });
  });

  it('still records metrics when the handler errors', (done) => {
    const req = { method: 'POST', route: { path: '/api/v1/articles' }, url: '/api/v1/articles' };
    const res = { statusCode: 500 };
    const handler: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    interceptor.intercept(buildContext(req, res), handler).subscribe({
      error: async () => {
        const output = await metrics.getMetrics();
        expect(output).toMatch(/http_requests_total\{method="POST",route="\/api\/v1\/articles",status="500"\} 1/);
        done();
      },
    });
  });

  it('skips non-HTTP execution contexts (e.g. a BullMQ job) without erroring', async () => {
    const context = { getType: () => 'rpc' } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of('job result') };

    const result = await new Promise((resolve) => {
      interceptor.intercept(context, handler).subscribe(resolve);
    });

    expect(result).toBe('job result');
  });
});
