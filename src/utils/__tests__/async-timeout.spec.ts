import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../asyncTimeout';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('returns the value of a fast operation', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, '超时')).resolves.toBe('ok');
  });

  it('rejects with the given message when the operation never settles', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<string>(() => undefined), 15000, '写入超时');
    const assertion = expect(pending).rejects.toThrow('写入超时');
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it('propagates the original error instead of the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('磁盘忙')), 15000, '写入超时')).rejects.toThrow('磁盘忙');
  });

  it('skips the timer for non-positive timeouts', async () => {
    vi.useFakeTimers();
    const operation = withTimeout(Promise.resolve(1), 0, '超时');
    await expect(operation).resolves.toBe(1);
  });
});
