import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * /metrics exposes route names, latencies, and process memory/CPU — minor
 * information disclosure if left wide open on a public network. Real
 * deployments would typically restrict this via a NetworkPolicy limiting
 * access to the in-cluster Prometheus scraper; since that's not available
 * here, this is a lightweight fallback: if METRICS_TOKEN is configured,
 * require it as a bearer token. Left unset, this permits open access —
 * fine for local dev, but deployments should set it (or rely on network
 * policy) rather than leave it unset in production.
 */
@Injectable()
export class MetricsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.get<string>('METRICS_TOKEN', '');
    if (!token) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (provided !== token) {
      throw new UnauthorizedException('Invalid or missing metrics token');
    }

    return true;
  }
}
