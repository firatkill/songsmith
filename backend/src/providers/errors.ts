import type { ProviderErrorCode } from '@songsmith/schemas';
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = 'ProviderError';
  }
}
// Never retain unknown messages or causes: they can contain provider input (SEC-11).
export async function providerCall<T>(run: () => T | Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('unknown', false);
  }
}
