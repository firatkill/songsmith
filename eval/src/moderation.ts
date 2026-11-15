import { randomUUID } from 'node:crypto';
import { runLayers, type TextAdapter } from '@songsmith/backend/eval';
import type { Budget } from './budget.js';
import type { ModerationRow } from './golden.js';

export interface ModerationResult {
  id: string;
  lang: ModerationRow['lang'];
  tags: string[];
  expectedAction: ModerationRow['expected_action'];
  expectedCategory: ModerationRow['expected_category'];
  action: string;
  category: string;
  layer1: string;
}
export interface ModerationThresholds {
  hardBlockRecall: number;
  blockRecall: number;
  maxFalseBlockRate: number;
}

const BLOCKING = new Set(['block', 'hard_block']);

// Mock mode adds the row's ⟦mock:category⟧ twin (TRD §10.4); live mode sends the text.
export function inputFor(row: ModerationRow, mode: 'mock' | 'live') {
  const text = `[${row.surface}]\n${row.text}\n[/${row.surface}]`;
  return mode === 'mock' ? `${text} ⟦mock:${row.expected_category}⟧` : text;
}

// Every classifier call passes the budget guard first and records its cost.
export function guarded(adapter: TextAdapter, budget?: Budget): TextAdapter {
  if (!budget) return adapter;
  return {
    id: adapter.id,
    async completeJson(req, ctx) {
      budget.beforeCall();
      const result = await adapter.completeJson(req, ctx);
      budget.record(result.costMicroUsd);
      return result;
    },
  };
}

export async function runModeration(options: {
  rows: ModerationRow[];
  mode: 'mock' | 'live';
  classifier: TextAdapter;
  budget?: Budget;
}): Promise<ModerationResult[]> {
  const classifier = guarded(options.classifier, options.budget);
  const results: ModerationResult[] = [];
  for (const row of options.rows) {
    const { layer1, combined } = await runLayers({
      text: inputFor(row, options.mode),
      classifier,
      userId: '00000000-0000-4000-8000-000000000000',
      correlationId: randomUUID(),
    });
    results.push({
      id: row.id,
      lang: row.lang,
      tags: row.tags,
      expectedAction: row.expected_action,
      expectedCategory: row.expected_category,
      action: combined.action,
      category: combined.category,
      layer1: layer1.action,
    });
  }
  return results;
}

const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d);

export function moderationMetrics(
  results: ModerationResult[],
  thresholds: ModerationThresholds,
) {
  const hard = results.filter((r) => r.expectedAction === 'hard_block');
  const block = results.filter((r) => r.expectedAction === 'block');
  const allowed = results.filter(
    (r) =>
      r.expectedAction === 'allow' || r.expectedAction === 'allow_explicit',
  );
  const hardBlockRecall = ratio(
    hard.filter((r) => r.action === 'hard_block').length,
    hard.length,
  );
  // A stricter action still counts as caught for block-tier rows.
  const blockRecall = ratio(
    block.filter((r) => BLOCKING.has(r.action)).length,
    block.length,
  );
  const falseBlockRate =
    1 -
    ratio(
      allowed.filter((r) => !BLOCKING.has(r.action)).length,
      allowed.length,
    );
  const categories = [
    ...new Set(results.map((r) => r.expectedCategory)),
  ].sort();
  const perCategory = categories.map((category) => {
    const expected = results.filter((r) => r.expectedCategory === category);
    const predicted = results.filter((r) => r.category === category);
    const hits = expected.filter((r) => r.category === category).length;
    return {
      category,
      rows: expected.length,
      recall: ratio(hits, expected.length),
      precision: ratio(hits, predicted.length),
    };
  });
  const misses = results
    .filter((r) => {
      if (r.expectedAction === 'hard_block') return r.action !== 'hard_block';
      if (r.expectedAction === 'block') return !BLOCKING.has(r.action);
      return BLOCKING.has(r.action);
    })
    .map((r) => ({
      id: r.id,
      expected: `${r.expectedAction}/${r.expectedCategory}`,
      actual: `${r.action}/${r.category}`,
      layer1: r.layer1,
    }));
  const passed =
    hardBlockRecall >= thresholds.hardBlockRecall &&
    blockRecall >= thresholds.blockRecall &&
    falseBlockRate <= thresholds.maxFalseBlockRate;
  return {
    rows: results.length,
    hardBlockRecall,
    blockRecall,
    falseBlockRate,
    perCategory,
    misses,
    thresholds,
    passed,
  };
}
export type ModerationMetrics = ReturnType<typeof moderationMetrics>;
