import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
    service.onModuleInit();
  });

  it('reports process default metrics alongside the custom HTTP metrics', async () => {
    const output = await service.getMetrics();

    expect(output).toContain('process_cpu_user_seconds_total');
    expect(output).toContain('http_requests_total');
    expect(output).toContain('http_request_duration_seconds');
  });

  it('reflects an observed HTTP request in the scraped output', async () => {
    service.httpRequestsTotal.inc({ method: 'GET', route: '/api/v1/articles', status: '200' });
    service.httpRequestDurationSeconds.observe(
      { method: 'GET', route: '/api/v1/articles', status: '200' },
      0.123,
    );

    const output = await service.getMetrics();

    expect(output).toMatch(/http_requests_total\{.*route="\/api\/v1\/articles".*\} 1/);
  });

  it('exposes the Prometheus text-format content type for the scrape response', () => {
    expect(service.contentType).toContain('text/plain');
  });
});
