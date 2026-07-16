import { Global, Module } from '@nestjs/common';

import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from './api-key.guard';
import { JwtOrApiKeyAuthGuard } from './jwt-or-api-key-auth.guard';

// Global: JwtOrApiKeyAuthGuard needs JwtAuthGuard/ApiKeyGuard injected as
// constructor dependencies, which - unlike a bare `@UseGuards(SomeGuard)`
// class reference, which Nest can instantiate ad-hoc - requires them to be
// real registered providers reachable from wherever JwtOrApiKeyAuthGuard
// itself gets used.
@Global()
@Module({
  providers: [JwtAuthGuard, ApiKeyGuard, JwtOrApiKeyAuthGuard],
  exports: [JwtAuthGuard, ApiKeyGuard, JwtOrApiKeyAuthGuard],
})
export class GuardsModule {}
