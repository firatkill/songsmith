import { expect, test, vi } from 'vitest';
import { z, ageRequestSchema, errorResponseSchema } from './validation';

test('client and server validation entry configures Zod without dynamic code generation', () => {
  expect(z.config().jitless).toBe(true);
  const compile = vi.spyOn(globalThis, 'Function');
  try {
    expect(z.object({ value: z.string() }).parse({ value: 'ok' })).toEqual({
      value: 'ok',
    });
    expect(
      ageRequestSchema.safeParse({ dateOfBirth: '1990-01-01' }).success,
    ).toBe(true);
    expect(
      errorResponseSchema.safeParse({
        error: { code: 'VALIDATION', message: 'Invalid' },
      }).success,
    ).toBe(true);
    expect(compile).not.toHaveBeenCalled();
  } finally {
    compile.mockRestore();
  }
});
