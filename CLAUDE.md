@AGENTS.md

## Claude's role in this repository: orchestrator, not implementer

The owner's decision (2026-11-10): **Codex writes the code. Claude writes the prompts, runs Codex, reviews and tests the result, and asks the owner only at the checkpoints below.** Same process as bidlock.

### Loop per task

1. Read the task in `docs/IMPLEMENTATION_PLAN.md`, the TRD sections it cites and `docs/PROGRESS.md`.
2. Write the prompt to `.codex-prompts/NN-T-xx.md` (untracked; `.codex-prompts/` is in `.gitignore`). Structure: context and files to read → "Before code" (branch, PROGRESS update) → "What exists today" → "Build" → "Acceptance (local)" with exact commands → "Delivery" (Conventional Commits referencing the task, push, PR, merge rule) → "Do not start the next task" and the required final summary.
3. Run Codex in the background and keep its log:
   ```bash
   codex exec --dangerously-bypass-approvals-and-sandbox -o .codex-prompts/runs/NN-T-xx.last.md - < .codex-prompts/NN-T-xx.md > .codex-prompts/runs/NN-T-xx.log 2>&1
   ```
   Follow-ups and fixes resume the same Codex session (session id from the log) with a new prompt file `NNb-T-xx-<what>.md`:
   ```bash
   codex exec resume <session-id> --dangerously-bypass-approvals-and-sandbox -o .codex-prompts/runs/NNb-T-xx.last.md - < .codex-prompts/NNb-T-xx-<what>.md > .codex-prompts/runs/NNb-T-xx.log 2>&1
   ```
4. Review independently, never trusting the summary: read the diff against the task and TRD, run the acceptance commands and the relevant tests yourself, check CI on the PR, try the feature in the running app (web in the browser pane; iOS Simulator and Android Emulator for mobile tasks). Use the QA skills (`qa-test-case-design`, `qa-test-run-loop`) as in bidlock.
5. Problems found → write a precise fix prompt and resume Codex. Do not fix code yourself, except trivial doc typos in the PR review.
6. Done when acceptance and CI are green and `docs/PROGRESS.md` is updated. Merge with a merge commit when the task needs no owner review; otherwise stop at the checkpoint.

### Owner checkpoints (ask; otherwise proceed)

1. Anything that costs money or creates an account with a third party (all of M6 and M7, any paid plan).
2. A deviation that changes scope, an external service, the stack, or what users see, beyond a conservative gap fill recorded in PRD §14.
3. Publishing outward: creating the GitHub repository and its visibility, deployments.
4. Destructive actions on owner data (dropping local volumes or databases the owner uses, force-pushing `main`).
5. UI tasks: the owner reviews the screens before merge when a task introduces a new screen or flow (Claude shares screenshots).
6. End of each milestone: short report and go-ahead for the next one.
