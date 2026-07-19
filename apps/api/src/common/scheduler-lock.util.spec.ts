import { runWithSchedulerLock } from './scheduler-lock.util';

describe('runWithSchedulerLock', () => {
  let redis: any;

  beforeEach(() => {
    redis = { set: jest.fn(), del: jest.fn().mockResolvedValue(1) };
  });

  it('runs fn and returns its result when the lock is acquired', async () => {
    redis.set.mockResolvedValue('OK');
    const fn = jest.fn().mockResolvedValue('done');

    const result = await runWithSchedulerLock(redis, 'lock:key', 300, fn);

    expect(result).toBe('done');
    expect(redis.set).toHaveBeenCalledWith('lock:key', '1', 'EX', 300, 'NX');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('skips fn and returns undefined when another instance already holds the lock', async () => {
    redis.set.mockResolvedValue(null);
    const fn = jest.fn();

    const result = await runWithSchedulerLock(redis, 'lock:key', 300, fn);

    expect(result).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it('releases the lock after fn succeeds', async () => {
    redis.set.mockResolvedValue('OK');

    await runWithSchedulerLock(redis, 'lock:key', 300, async () => 'done');

    expect(redis.del).toHaveBeenCalledWith('lock:key');
  });

  it('releases the lock even when fn throws, and still propagates the error', async () => {
    redis.set.mockResolvedValue('OK');
    const err = new Error('sweep failed');

    await expect(
      runWithSchedulerLock(redis, 'lock:key', 300, async () => {
        throw err;
      }),
    ).rejects.toThrow(err);

    expect(redis.del).toHaveBeenCalledWith('lock:key');
  });

  it('does not throw even if releasing the lock itself fails', async () => {
    redis.set.mockResolvedValue('OK');
    redis.del.mockRejectedValue(new Error('redis unavailable'));

    await expect(runWithSchedulerLock(redis, 'lock:key', 300, async () => 'done')).resolves.toBe('done');
  });
});
