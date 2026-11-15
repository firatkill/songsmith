# Evaluations

The harness in `eval/` measures moderation (FR-57, NFR-12) and the lyricist (NFR-13) on golden sets (TRD §10.4, INF-15).

## Commands

```bash
pnpm eval:moderation            # mock mode, free, also runs in CI (eval-mock)
pnpm eval:lyricist              # mock mode
pnpm eval:golden                # rebuild the golden sets from eval/scripts/build-golden.ts
```

Live runs (M6 onwards, owner approval, never on pull requests):

```bash
pnpm eval:moderation --mode live --budget-usd 2 --adapter <live text adapter id>
```

The harness refuses live mode without `--budget-usd` and `--adapter`. Before every model call the budget guard checks that the amount spent plus the estimate (the largest cost seen so far; 2000 micro-USD before the first call) still fits, and stops the run if it does not. A live run can also be started from GitHub Actions with the manual `Eval` workflow.

Reports go to `eval/reports/` (ignored by git; CI uploads them as artifacts). They contain row ids and labels only, never row text. Exit codes: 0 thresholds met, 1 thresholds missed, 2 usage or setup error.

## Golden sets

- `eval/moderation/golden.jsonl`: `{ id, lang, surface, text, expected_action, expected_category, tags }`. At least 40 rows per prohibited category per language, plus three evasion variants each (`evasion` tag), and 160 allowed rows with profanity, mature themes and near misses (`child_context`, `music_terms`, `near_miss`).
- `eval/lyricist/golden.jsonl`: `{ id, lang, occasion, description, giftNames }`.
- Thresholds: `eval/moderation/thresholds.json` (hard-block recall 100 %, block recall 95 %, false blocks at most 5 %) and `eval/lyricist/thresholds.json` (section tags 100 %, language 100 %, gift names 95 %).

The rows are generated from templates in `eval/scripts/build-golden.ts`; edit the templates, run `pnpm eval:golden` and commit both. CI checks that the committed files match the generator.

**Content rule.** Prohibited rows describe the requested intent in neutral words and never contain explicit sexual text. The owner reviews every change to the hard-block templates before merge.

## Modes

- **Mock** adds each row's `⟦mock:<expected_category>⟧` marker at run time, so the mock classifier returns the expected category. Mock runs therefore test the plumbing and layer 1: a layer-1 hit on an allowed row shows up as a false block, and a layer-1 override of a prohibited row shows up in the category table.
- **Live** sends the row text unchanged to a live text adapter through the same `runLayers` code as `moderate()`. Live adapters arrive in M6; until then live mode stops with "No live text adapter".

The lyricist suite checks schema validity, section tags, the declared language and gift names. T-18 adds the lyricist prompt, a language detector and runs these rows through the lyricist module.
