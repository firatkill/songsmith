import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  creditIntegerSchema,
  creditReservationSchema,
} from '@songsmith/schemas';
import { creditRpcResult } from '../src/credits/ledger.js';

it.each([
  ['SS001', 'INSUFFICIENT_CREDITS'],
  ['SS002', 'ACCOUNT_RESTRICTED'],
  ['SS003', 'CONCURRENCY_LIMIT'],
  ['SS004', 'INTERNAL'],
  ['23505', 'INTERNAL'],
])('maps %s without leaking database details', (sqlstate, code) => {
  expect(() =>
    creditRpcResult({ data: null, error: { code: sqlstate } }, z.unknown()),
  ).toThrow(code);
});
it('parses RPC results and sanitizes malformed responses', () => {
  expect(creditRpcResult({ data: 2, error: null }, creditIntegerSchema)).toBe(
    2,
  );
  for (const data of [null, {}, '2', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
      creditRpcResult({ data, error: null }, creditIntegerSchema),
    ).toThrow('INTERNAL');
  }
  expect(() =>
    creditRpcResult(
      { data: { id: 'not-a-uuid' }, error: null },
      creditReservationSchema,
    ),
  ).toThrow('INTERNAL');
});
