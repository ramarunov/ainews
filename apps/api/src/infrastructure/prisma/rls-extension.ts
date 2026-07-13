import { PrismaClient } from '@prisma/client';
import { orgContextStorage } from './org-context';

// organizationId is always a server-generated UUID, never raw user input —
// but SET LOCAL has no bind-parameter support (Postgres doesn't allow
// parameters in SET), so this is interpolated directly. Validate the shape
// defensively before interpolating rather than trusting that invariant.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidOrgId(organizationId: string): void {
  if (!UUID_RE.test(organizationId)) {
    throw new Error(`Refusing to set RLS context to a non-UUID value: ${organizationId}`);
  }
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

// $queryRawUnsafe/$executeRawUnsafe take a plain positional array
// ([sql, ...values]) that must be spread. $queryRaw/$executeRaw (the
// tagged-template forms, e.g. prisma.$queryRaw`...${x}...`) instead
// receive ONE special Sql object as `args` — spreading that throws
// "Spread syntax requires ...iterable[Symbol.iterator] to be a function",
// since it isn't an array — confirmed by direct testing after this broke
// AnalyticsService's dashboard query in production-shaped testing.
const UNSAFE_RAW_OPERATIONS = new Set(['$queryRawUnsafe', '$executeRawUnsafe']);

/**
 * Wraps every Prisma model operation so that, when an org context is active
 * (see org-context.ts), the call runs inside a short-lived transaction with
 * Postgres's `app.current_org_id` session variable set for the duration of
 * that single transaction — which the tenant_isolation RLS policies (see
 * migrations/20260712120000_row_level_security) key off of.
 *
 * Deliberately one transaction PER OPERATION, not one per HTTP request: this
 * app interleaves Prisma calls with slow external I/O within a single
 * request (AI provider calls, S3 uploads, webhook delivery, OpenSearch
 * indexing) — holding one transaction open for an entire request would
 * routinely blow Prisma's transaction timeout on those requests.
 */
export function createRlsExtendedClient(basePrisma: PrismaClient) {
  return basePrisma.$extends({
    name: 'rls-tenant-isolation',
    query: {
      $allOperations: async ({ args, query, model, operation }) => {
        const ctx = orgContextStorage.getStore();

        // No per-request org context at all: system scripts (seed, health
        // checks) or a superadmin request. Superadmins are intentionally
        // exempt from tenant scoping, mirroring PermissionsGuard's existing
        // "superadmins bypass all permission checks" behavior.
        if (!ctx) return query(args);

        // Already inside a transaction that set the GUC — either this
        // wrapper's own transaction below, or an explicit multi-step
        // transaction via withOrgTransaction(). Opening another transaction
        // here would nest transactions unnecessarily; just run the call,
        // it's already covered by the active transaction's SET LOCAL.
        if (ctx.inTransaction) return query(args);

        assertValidOrgId(ctx.organizationId);

        return basePrisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL app.current_org_id = '${ctx.organizationId}'`,
          );
          // The `async () => ...` here (not a bare arrow returning the call
          // result) is load-bearing — see the comment on runWithOrgContext
          // in org-context.ts for why: Prisma operations are lazy thenables,
          // and only awaiting them INSIDE this callback keeps their actual
          // execution within the tracked AsyncLocalStorage context.
          return orgContextStorage.run({ ...ctx, inTransaction: true }, async () => {
            // `model` is present for ordinary model operations and is the
            // PascalCase schema name (e.g. "Article"), not the camelCase
            // client property (e.g. "article") — confirmed by direct
            // testing against the extension's actual arguments.
            if (model) return (tx as any)[lowerFirst(model)][operation](args);
            if (UNSAFE_RAW_OPERATIONS.has(operation)) {
              return (tx as any)[operation](...(args as unknown[]));
            }
            return (tx as any)[operation](args);
          });
        });
      },
    },
  });
}

/**
 * For the handful of places that already batch several Prisma calls into
 * one atomic `$transaction(...)` — replaces that direct call so the org
 * context's GUC still gets set once for the whole batch. Without this, the
 * batch's inner calls would see `ctx.inTransaction` as false (since this
 * transaction isn't the one createRlsExtendedClient's wrapper would have
 * opened) and nothing would set the GUC at all — invisible to the app, but
 * every inner query would then be denied by the RLS policy.
 */
export async function withOrgTransaction<T>(
  // Accepts either the raw PrismaClient or the RLS-extended wrapper —
  // `$extends()`'s return type isn't structurally a PrismaClient, so this
  // is intentionally loose rather than fighting Prisma's extension typing.
  prisma: { $transaction: (fn: (tx: any) => Promise<T>) => Promise<T> },
  callback: (tx: any) => Promise<T>,
): Promise<T> {
  const ctx = orgContextStorage.getStore();

  if (!ctx) return prisma.$transaction(callback);

  assertValidOrgId(ctx.organizationId);

  return prisma.$transaction(async (tx) => {
    // `inTransaction: true` must already be active BEFORE the SET LOCAL
    // call itself, not just around `callback(tx)`. `prisma` here is
    // typically the RLS-extended client (every service's `this.prisma`
    // is, per prisma.module.ts), so `tx` carries the same $allOperations
    // hook — without this, that hook would see `inTransaction` still
    // false for this raw call and redirect SET LOCAL onto a brand new,
    // unrelated nested transaction, leaving the GUC unset on the actual
    // transaction `callback(tx)` runs in. Confirmed by direct testing.
    return orgContextStorage.run({ ...ctx, inTransaction: true }, async () => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${ctx.organizationId}'`);
      return callback(tx);
    });
  });
}
