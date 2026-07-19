import type { Redis } from 'ioredis';

/**
 * Every periodic sweep (RSS ingestion, scheduled-publish, the autonomous
 * pipeline, DB backups) drives itself off its own in-process setInterval,
 * so running more than one API instance (horizontal scaling) means every
 * replica's timer fires the same sweep independently and on its own clock —
 * with no lock that means N-times-redundant RSS fetches, racing autonomous
 * AI passes, two instances both trying to publish the same scheduled
 * article, or two concurrent pg_dumps against the same database. Guards a
 * sweep with a short-lived Redis mutex (same SET NX EX pattern already used
 * for per-cluster locking in AutonomousPublishingService) so only one
 * instance's tick actually runs; every other instance's tick for that same
 * window is skipped rather than queued, since the next tick will simply
 * pick up whatever the winner didn't get to.
 *
 * `ttlSeconds` is a crash-only safety net, not the normal release path (that
 * releases immediately via `finally` once `fn` settles) — it just needs to
 * comfortably outlast a normal run of `fn` so a mid-run crash doesn't leave
 * the lock held past the point where a legitimate concurrent run would have
 * finished anyway.
 */
export async function runWithSchedulerLock<T>(
  redis: Redis,
  lockKey: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const acquired = await redis.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
  if (!acquired) return undefined;

  try {
    return await fn();
  } finally {
    await redis.del(lockKey).catch(() => undefined);
  }
}
