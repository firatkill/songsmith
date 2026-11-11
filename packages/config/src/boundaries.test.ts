import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
// A full ESLint process run needs headroom under Turborepo's parallel load.
test('boundary CLI reports every planted import and accepts allowed locations', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-boundaries.mjs', '--fixtures', '--json'],
    { cwd: root, encoding: 'utf8' },
  );
  expect(result.status).toBe(1);
  const reports = JSON.parse(result.stdout) as {
    filePath: string;
    errorCount: number;
    messages: { ruleId: string }[];
  }[];
  expect(reports).toHaveLength(20);
  for (const report of reports) {
    if (report.filePath.endsWith('/clean.ts'))
      expect(report.errorCount).toBe(0);
    else {
      expect(report.errorCount, report.filePath).toBeGreaterThan(0);
      expect(
        report.messages.every(
          ({ ruleId }) => ruleId === 'no-restricted-imports',
        ),
      ).toBe(true);
    }
  }
  expect(reports.reduce((count, report) => count + report.errorCount, 0)).toBe(
    18,
  );
}, 30_000);
// A full ESLint process run needs headroom under Turborepo's parallel load.
test('repository boundary CLI passes', () => {
  expect(() =>
    execFileSync(process.execPath, ['scripts/check-boundaries.mjs'], {
      cwd: root,
    }),
  ).not.toThrow();
}, 30_000);
