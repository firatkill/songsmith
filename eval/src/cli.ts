// pnpm eval:moderation | eval:lyricist [--mode mock|live] [--budget-usd N] [--adapter id]
// Mock is the default and costs nothing. Live needs --budget-usd and live
// adapters (M6); it is run manually, never in CI on pull requests.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { createBudget, usdToMicro, BudgetExceededError } from './budget.js';
import {
  goldenFiles,
  lyricistRowSchema,
  moderationRowSchema,
  readJsonl,
} from './golden.js';
import {
  lyricistMetrics,
  runLyricist,
  type LyricistThresholds,
} from './lyricist.js';
import {
  moderationMetrics,
  runModeration,
  type ModerationThresholds,
} from './moderation.js';
import {
  lyricistMarkdown,
  moderationMarkdown,
  writeReport,
  type RunMeta,
} from './report.js';

export const argsSchema = z
  .strictObject({
    suite: z.enum(['moderation', 'lyricist']),
    mode: z.enum(['mock', 'live']).default('mock'),
    budgetUsd: z.coerce.number().positive().optional(),
    adapter: z.string().min(1).optional(),
    out: z.string().min(1).optional(),
  })
  .refine((a) => a.mode === 'mock' || a.budgetUsd !== undefined, {
    message: 'Live runs need --budget-usd',
    path: ['budgetUsd'],
  })
  .refine((a) => a.mode === 'mock' || a.adapter !== undefined, {
    message: 'Live runs need --adapter',
    path: ['adapter'],
  });
export type Args = z.infer<typeof argsSchema>;

export function parseArgs(argv: string[]): Args {
  const [suite, ...rest] = argv;
  const raw: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = rest[i + 1];
    const key = {
      '--mode': 'mode',
      '--budget-usd': 'budgetUsd',
      '--adapter': 'adapter',
      '--out': 'out',
    }[flag ?? ''];
    if (!key || value === undefined)
      throw new Error(`Unknown or incomplete option ${flag ?? ''}`);
    raw[key] = value;
    i++;
  }
  return argsSchema.parse({ suite, ...raw });
}

const thresholdsFile = (suite: Args['suite']) =>
  new URL(`../${suite}/thresholds.json`, import.meta.url);
const moderationThresholdsSchema = z.strictObject({
  hardBlockRecall: z.number().min(0).max(1),
  blockRecall: z.number().min(0).max(1),
  maxFalseBlockRate: z.number().min(0).max(1),
});
const lyricistThresholdsSchema = z.strictObject({
  sectionTags: z.number().min(0).max(1),
  language: z.number().min(0).max(1),
  giftNames: z.number().min(0).max(1),
});
// First-call estimate for the budget guard: 2000 micro-USD per text call.
const FIRST_CALL_ESTIMATE_MICRO_USD = 2000;

export async function main(argv: string[]) {
  const args = parseArgs(argv);
  const backend = await import('@songsmith/backend/eval');
  let adapter;
  if (args.mode === 'mock') adapter = backend.mockTextAdapter();
  else {
    // providers/live refuses to load unless the process is in live mode (UT-12).
    process.env['PROVIDER_MODE'] = 'live';
    adapter = await backend.liveTextAdapter('local', args.adapter ?? '');
  }
  const budget =
    args.budgetUsd === undefined
      ? undefined
      : createBudget(usdToMicro(args.budgetUsd), FIRST_CALL_ESTIMATE_MICRO_USD);
  const startedAt = new Date().toISOString();
  const out = args.out
    ? pathToFileURL(`${args.out.replace(/\/$/u, '')}/`)
    : new URL('../reports/', import.meta.url);
  const meta = (): RunMeta => ({
    suite: args.suite,
    mode: args.mode,
    startedAt,
    policyVersion: backend.POLICY_VERSION,
    spentMicroUsd: budget?.spentMicroUsd ?? 0,
  });
  let passed: boolean;
  let report: URL;
  if (args.suite === 'moderation') {
    const thresholds: ModerationThresholds = moderationThresholdsSchema.parse(
      JSON.parse(readFileSync(thresholdsFile('moderation'), 'utf8')),
    );
    const rows = readJsonl(goldenFiles.moderation, moderationRowSchema);
    const results = await runModeration({
      rows,
      mode: args.mode,
      classifier: adapter,
      ...(budget ? { budget } : {}),
    });
    const metrics = moderationMetrics(results, thresholds);
    passed = metrics.passed;
    report = writeReport(
      out,
      meta(),
      metrics,
      moderationMarkdown(metrics, meta()),
    );
  } else {
    const thresholds: LyricistThresholds = lyricistThresholdsSchema.parse(
      JSON.parse(readFileSync(thresholdsFile('lyricist'), 'utf8')),
    );
    const rows = readJsonl(goldenFiles.lyricist, lyricistRowSchema);
    const results = await runLyricist({
      rows,
      model: adapter,
      ...(budget ? { budget } : {}),
    });
    const metrics = lyricistMetrics(results, thresholds);
    passed = metrics.passed;
    report = writeReport(
      out,
      meta(),
      metrics,
      lyricistMarkdown(metrics, meta()),
    );
  }
  process.stdout.write(
    `${readFileSync(report, 'utf8')}\nReport: ${report.pathname}\n`,
  );
  return passed ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      if (error instanceof BudgetExceededError)
        process.stderr.write(
          `${error.message} (spent ${String(error.spentMicroUsd)} of ${String(error.limitMicroUsd)} micro-USD)\n`,
        );
      else if (error instanceof z.ZodError)
        process.stderr.write(
          `${error.issues.map((i) => i.message).join('\n')}\n`,
        );
      else
        process.stderr.write(
          `${error instanceof Error ? error.message : String(error)}\n`,
        );
      process.exitCode = 2;
    });
}
