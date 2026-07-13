import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const start = process.hrtime.bigint();

    const record = () => {
      const res = context.switchToHttp().getResponse();
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      // req.route is only populated once Express has matched a route — a
      // 404 for a nonexistent path has none, so fall back to the raw URL
      // rather than crash on undefined.
      const route: string = req.route?.path ?? req.url ?? 'unknown';
      const labels = { method: req.method, route, status: String(res.statusCode) };

      this.metrics.httpRequestsTotal.inc(labels);
      this.metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
