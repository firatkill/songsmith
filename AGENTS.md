# AGENTS.md

Instructions for AI coding agents working in this repository. Read this file fully before changing anything. If it conflicts with a task prompt, this file wins unless the repository owner says otherwise in the conversation.

## What this project is

Songsmith (working name) is an AI song-writing and song-generation app for web, iOS and Android. A user describes a song or pastes lyrics, an AI lyricist writes and edits them, a moderation pipeline checks every input, and a provider-agnostic model layer routes the job to a music model that supports the operation and the language. Credits are an append-only ledger.

## Where the specs live

| Document                      | Use it for                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/PRD.md`                 | Requirements (FR, NFR, SEC, CMP, INF), content policy, decisions (D-xx), milestones                                                              |
| `docs/TRD.md`                 | Architecture, schema, ledger functions, adapter interfaces, router, jobs, moderation, API, clients, tests, decisions (TD-xx), assumptions (A-xx) |
| `docs/IMPLEMENTATION_PLAN.md` | Ordered tasks T-01..T-50 with acceptance checks                                                                                                  |
| `docs/PROGRESS.md`            | What is done; update it in every task PR                                                                                                         |

Find the task ID in the plan and the TRD sections it references before writing code. Do not invent behaviour the docs do not specify. If something small is missing, choose the most conservative option and add a row to PRD §14. If it changes scope, cost, an external service or what a user sees, ask the owner.

## Hard rules

1. **No paid services before M6 (PRD D-12).** Do not call a live provider, sign up for a paid plan or need a paid developer account in tasks T-01..T-44. Use mocks (`PROVIDER_MODE=mock`), free tiers and sandboxes.
2. **Never ask for or paste secrets in chat or commits.** The owner puts keys in `.env.local` and in the deployment secret store. `.env.example` lists names only.
3. **Credits change only through SQL functions in schema `app`** (TRD §7). TypeScript never computes or writes a balance.
4. **Every text that can reach a generative model goes through `moderate()` first** (TRD §10). Never bypass it, including in admin tools and tests of live providers.
5. **Provider SDKs and URLs only in `backend/src/providers/**`** (and Paddle/RevenueCat in `backend/src/payments/**`).
6. **Clients never write to Supabase directly.** All writes go through the backend API (TD-03).
7. **Golden-set hard-block rows describe prohibited requests; they never contain explicit sexual text.** Do not generate such content for any reason.
8. **Postgres is the source of truth for jobs; Redis only holds queue state.** Every job step is idempotent and its result is saved in `generation_jobs.steps` before the next step (TRD §9.2).
9. **Logs never contain lyrics, descriptions, gift details, e-mail addresses or tokens** (SEC-11).

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; no `any`, no `@ts-ignore`.
- Zod at every boundary (requests, provider responses, webhook payloads, env, LLM outputs); schemas in `packages/schemas`.
- Credits and provider costs are integers (`bigint` in SQL; credits as integers, cost in micro-USD). No floating point for money.
- User-facing strings only from `packages/i18n` (TR and EN together, always).
- SQL: lowercase keywords, schema-qualified names, `security definer set search_path = app, public, pg_temp`, revoke from public, grant only to `service_role`. Never edit an applied migration.
- New runtime dependency: give the reason in the PR description.

## Testing rules

- SQL change → pgTAP test in the same PR. Ledger or locking change → run `pnpm test:integration` (IT-01, IT-02) and say so in the PR.
- Moderation or lyricist prompt/list change → `pnpm eval:moderation --mode mock` / `eval:lyricist --mode mock` in the same PR. Live evaluation runs only with `--budget-usd` and only when the owner asks.
- Playwright: `expect` timeout 3 s and test timeout 90 s in the config; do not raise them. Tests make unique data (`e2e+<uuid>@example.test`). Tests that change global state (flags, catalogue, caps, Explore order, sign-up limits) are tagged `@isolated` and restore state in `finally`. Do not run the suite with `--workers=1`.
- Fix-and-retest: rerun only the affected tests, then the full suite once at the end. Make sure no other Playwright run is using the same database first.

## Commands

See TRD §4.2. Most used: `pnpm dev:all` (Supabase, Redis, API, worker, web, iOS Simulator and Android Emulator together; TRD §5.1), `pnpm db:start`, `pnpm db:reset`, `pnpm dev`, `pnpm dev:mobile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:integration`, `pnpm e2e`.

## Authorship

Every commit's author and committer is `Fırat Kıl <72046564+firatkill@users.noreply.github.com>`, with no AI co-author lines, "Generated with" lines or session links in commits or PR descriptions. Turn your tool's own attribution off before the first commit (`.claude/settings.json` does this for Claude Code; for Codex and others, check their settings). `.githooks/commit-msg` removes such lines and rejects other identities; enable it once per clone with `git config core.hooksPath .githooks`. Never bypass it (`--no-verify` is not allowed).
