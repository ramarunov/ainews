import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { createRlsExtendedClient } from './rls-extension';

// The actual connectable PrismaClient instance — Nest constructs and manages
// its lifecycle (onModuleInit/onModuleDestroy) directly under this token.
export const RAW_PRISMA_CLIENT = Symbol('RAW_PRISMA_CLIENT');

@Global()
@Module({
  providers: [
    { provide: RAW_PRISMA_CLIENT, useClass: PrismaService },
    {
      // Every existing `constructor(private readonly prisma: PrismaService)`
      // across the app now receives this RLS-extended wrapper instead of a
      // raw client — no per-service changes needed for tenant isolation to
      // apply. It shares the raw client's connection pool; it doesn't open
      // its own connection, so it needs no lifecycle hooks of its own.
      provide: PrismaService,
      useFactory: (raw: PrismaService) =>
        createRlsExtendedClient(raw) as unknown as PrismaService,
      inject: [RAW_PRISMA_CLIENT],
    },
  ],
  exports: [PrismaService, RAW_PRISMA_CLIENT],
})
export class PrismaModule {}
