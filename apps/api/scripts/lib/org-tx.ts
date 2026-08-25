import { PrismaClient } from '@prisma/client';

// `articles`/`categories`/`tags`/`media_files`/`redirects` (and others -
// see prisma/migrations/20260712120000_row_level_security) have FORCE ROW
// LEVEL SECURITY - any write/read through those tables needs
// `app.current_org_id` set for the duration of the transaction it runs in
// (mirrors infrastructure/prisma/rls-extension.ts's own pattern, which
// standalone scripts don't use directly since they aren't running inside
// Nest DI).
//
// Deliberately ONE SHORT transaction per call, not one transaction
// wrapping an entire script run - a real import that held one transaction
// open across thousands of sequential network calls (image downloads) hit
// Prisma's interactive-transaction timeout and rolled back everything, not
// just the slow part (see scripts/import-wordpress.ts's git history for
// the incident this was extracted from). Keep slow I/O (HTTP requests, S3
// uploads) outside whatever you pass to `fn`.
export function createWithOrgTx(prisma: PrismaClient) {
  return async function withOrgTx<T>(
    organizationId: string,
    fn: (tx: any) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${organizationId}'`);
        return fn(tx);
      },
      { timeout: 30_000 },
    );
  };
}
