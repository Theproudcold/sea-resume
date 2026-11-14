/**
 * 给可能永不 settle 的操作套上超时，保证界面不会无限等待。
 * 注意：超时只让调用方尽快拿到结果，底层操作仍可能继续执行；调用方需要保证幂等或可重试。
 */
export function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return operation;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
