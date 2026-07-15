import { Controller, Get, Res, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

import { MetricsService } from './metrics.service';
import { MetricsGuard } from './metrics.guard';
import { Public } from '../../common/decorators/public.decorator';

// Deliberately version-neutral and outside the /api prefix (see
// main.ts's setGlobalPrefix exclude list) — Prometheus scrapers expect a
// plain GET /metrics, not /api/v1/metrics.
@Public()
@UseGuards(MetricsGuard)
@SkipThrottle()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.getMetrics());
  }
}
