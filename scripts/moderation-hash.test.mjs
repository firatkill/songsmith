import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { checkDeterministic } from '../packages/moderation-rules/src/index.ts';
import { sha256 } from '../packages/moderation-rules/src/sha256.ts';
it('moderation:hash stdin round trip, deduplication and sorting', () => {
  const output = execFileSync('pnpm', ['-s', 'moderation:hash'], {
    input: 'forbiddensentinel\nFORBIDDENSENTINEL\nanothersentinel\n\n',
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  expect(output).toHaveLength(2);
  expect(output).toEqual([...output].sort());
  expect(
    checkDeterministic('f0rbiddensentinel', {
      lists: { hardBlockEn: output, hardBlockTr: [] },
    }).action,
  ).toBe('hard_block');
});
it('pure SHA-256 agrees with Node for Unicode and padding boundaries', () => {
  for (const text of [
    'ışık çocuk 🎵',
    '\ud800',
    'x'.repeat(55),
    'x'.repeat(56),
    'x'.repeat(64),
    'x'.repeat(65),
  ])
    expect(sha256(text)).toBe(createHash('sha256').update(text).digest('hex'));
});
