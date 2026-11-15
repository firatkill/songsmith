import { mkdirSync, writeFileSync } from 'node:fs';
import type { LyricistMetrics } from './lyricist.js';
import type { ModerationMetrics } from './moderation.js';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function moderationMarkdown(m: ModerationMetrics, meta: RunMeta) {
  const lines = [
    `# Moderation evaluation (${meta.mode})`,
    '',
    `Run ${meta.startedAt}, policy ${meta.policyVersion}, ${String(m.rows)} rows, spent ${String(meta.spentMicroUsd)} micro-USD. Result: **${m.passed ? 'PASS' : 'FAIL'}**.`,
    '',
    '| Measure | Value | Threshold |',
    '| --- | --- | --- |',
    `| Hard-block recall | ${pct(m.hardBlockRecall)} | ≥ ${pct(m.thresholds.hardBlockRecall)} |`,
    `| Block recall | ${pct(m.blockRecall)} | ≥ ${pct(m.thresholds.blockRecall)} |`,
    `| False blocks on allowed rows | ${pct(m.falseBlockRate)} | ≤ ${pct(m.thresholds.maxFalseBlockRate)} |`,
    '',
    '| Category | Rows | Recall | Precision |',
    '| --- | --- | --- | --- |',
    ...m.perCategory.map(
      (c) =>
        `| ${c.category} | ${String(c.rows)} | ${pct(c.recall)} | ${pct(c.precision)} |`,
    ),
    '',
    `## Misses (${String(m.misses.length)})`,
    '',
    ...(m.misses.length
      ? [
          '| Row | Expected | Actual | Layer 1 |',
          '| --- | --- | --- | --- |',
          ...m.misses.map(
            (x) => `| ${x.id} | ${x.expected} | ${x.actual} | ${x.layer1} |`,
          ),
        ]
      : ['None.']),
  ];
  return lines.join('\n') + '\n';
}

export function lyricistMarkdown(m: LyricistMetrics, meta: RunMeta) {
  return (
    [
      `# Lyricist evaluation (${meta.mode})`,
      '',
      `Run ${meta.startedAt}, ${String(m.rows)} rows, spent ${String(meta.spentMicroUsd)} micro-USD. Result: **${m.passed ? 'PASS' : 'FAIL'}**.`,
      '',
      '| Measure | Value | Threshold |',
      '| --- | --- | --- |',
      `| Section tags | ${pct(m.sectionTags)} | ≥ ${pct(m.thresholds.sectionTags)} |`,
      `| Language | ${pct(m.language)} | ≥ ${pct(m.thresholds.language)} |`,
      `| Gift names present | ${pct(m.giftNames)} | ≥ ${pct(m.thresholds.giftNames)} |`,
      '',
      `## Misses (${String(m.misses.length)})`,
      '',
      ...(m.misses.length
        ? m.misses.map((x) => `- ${x.id}: ${JSON.stringify(x)}`)
        : ['None.']),
    ].join('\n') + '\n'
  );
}

export interface RunMeta {
  suite: 'moderation' | 'lyricist';
  mode: 'mock' | 'live';
  startedAt: string;
  policyVersion: string;
  spentMicroUsd: number;
}

// Reports never contain row text, only ids and labels.
export function writeReport(
  dir: URL,
  meta: RunMeta,
  metrics: unknown,
  markdown: string,
) {
  mkdirSync(dir, { recursive: true });
  const stamp = meta.startedAt.replace(/[:.]/gu, '-');
  const base = `${meta.suite}-${meta.mode}-${stamp}`;
  writeFileSync(
    new URL(`${base}.json`, dir),
    JSON.stringify({ meta, metrics }, null, 2) + '\n',
  );
  writeFileSync(new URL(`${base}.md`, dir), markdown);
  return new URL(`${base}.md`, dir);
}
