import { AsyncLocalStorage } from 'async_hooks';

export interface OrgContext {
  organizationId: string;
  /**
   * True once we're already executing inside a transaction that has set the
   * Postgres session variable for this context — nested per-operation
   * wrapping must not open another transaction on top of it.
   */
  inTransaction?: boolean;
}

export const orgContextStorage = new AsyncLocalStorage<OrgContext>();

/**
 * Runs `fn` with the given organizationId established as the RLS context
 * for every Prisma call made within it (see rls-extension.ts). Passing
 * `null` (no org — e.g. a superadmin request, or a script with no request
 * context) runs `fn` unmodified: RLS-protected tables then deny all rows,
 * by design (fail closed), unless the caller is genuinely exempt.
 *
 * The `async () => fn()` wrapper (not just passing `fn` straight to
 * `.run()`) is load-bearing, not stylistic: Prisma Client operations
 * return lazy thenables that don't start executing until awaited, so if
 * `.run()`'s callback merely returns that un-awaited thenable, the actual
 * query execution happens later, outside this function's call stack —
 * and AsyncLocalStorage context set by `.run()` no longer applies to it.
 * Awaiting `fn()` INSIDE the callback keeps the query's real execution
 * within the tracked async context. Confirmed by direct testing: without
 * this, `orgContextStorage.getStore()` reads back `undefined` inside the
 * Prisma extension hook even though a context was ostensibly active.
 */
export function runWithOrgContext<T>(
  organizationId: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!organizationId) return fn();
  return orgContextStorage.run({ organizationId }, async () => fn());
}
