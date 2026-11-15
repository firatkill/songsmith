# Progress

Updated: 2026-11-15.

## Status

- Specs committed: `docs/PRD.md`, `docs/TRD.md`, `docs/IMPLEMENTATION_PLAN.md`, `AGENTS.md`. Committed in the public `firatkill/songsmith` repository.
- Build order is mock-first (PRD D-12): M0–M5 cost nothing; paid work starts at T-45.
- Local first (PRD D-14): everything runs on the owner's machine (web, iOS Simulator, Android Emulator) until T-50; jobs use BullMQ on Redis; deployment to a rented server happens once in T-50.
- T-01 done (PR #1): pnpm/Turborepo monorepo, shared strict TypeScript/ESLint/Prettier config, Vitest, CI `static` green.
- T-02 done (PR #5): shared packages build to ESM for Node, Next.js and React Native; error catalogue; TR/EN i18n with Turkish casing; provisional ui-tokens; module boundaries enforced by `pnpm check:boundaries`.
- T-03 done (PR #6): Supabase CLI 3.1.0 pinned; local Postgres 17 with e-mail OTP and Mailpit; default-deny foundation migration (`app`, `restricted`, `audit_log`); pgTAP DB-01/DB-02 (20 assertions); CI `db` job green.

- T-04 done (PR #7): core schema (migrations 0002–0007) with read-only RLS and hidden share/gift tokens; mock catalogue, language statuses, placeholder prices, six flags and a local staff admin seeded; `pnpm db:types` with CI drift check; 164 pgTAP assertions. Decisions D-20–D-26.
- T-05 done (PR #8): Express 5 API with the §13.1 middleware order, env validation, redacting JSON logger, TR/EN error mapping, `defineRoute`, `/v1/health`, OpenAPI 3.1 and generated `api-client`; `app` schema exposed to the backend service client only (D-27); CI `integration` job.
- T-06 done (PR #9): JWKS JWT auth with enforced route modes; profile status and age gate; `/v1/me`, `/v1/me/age`, `/v1/me/consents`; profile provisioning trigger; under-18 deletion with a 30-day sign-up block via the Auth hook; versioned append-only consents. Decisions D-32–D-39.

- T-07 done (PR #10): Next.js 16 web skeleton with TR/EN routes, OTP sign-in, age gate (day/month/year), consent, app shell; nonce CSP and security headers; Pop studio visual direction (owner decision D-42) in `ui-tokens` with AA contrast tests; Playwright E2E-01..03 and CI `e2e-web`; CI retries Supabase start after registry rate limits. T-08 is doing; review fixes and local acceptance complete, reviewer/CI pending.

- T-08 done (PR #11): BullMQ 6 on Redis 7 with the TRD §9.1 queues, worker process, resumable step runner with SQL-persisted steps, sweeper and nightly schedulers, Redis-loss recovery, Bull Board behind staff + MFA, `pnpm dev` for Redis, API, worker and web; A-03 verified.
- T-09 done (PR #12): flag registry with a shared 30 s cache and kill switches; Postgres fixed-window rate limits on the `/v1/me` writes; daily cost counters (Europe/Istanbul) and cap checks; `GET /v1/flags/public`; placeholder caps and limits until M6; `next-env.d.ts` generated instead of tracked.

- T-10 doing: Merged in PR #13: mobile skeleton, `dev:all`, owner-approved redesign of mobile and web auth screens, and Appearance setting; Android and web verified. Remaining: iOS Simulator verification, blocked until Xcode 26.4+ is installed.
- T-11 done (PR #14): provider types and `ProviderError`; six mock adapters (music A sync, music B async with extend and stems, text as lyricist and classifier, cover, image safety, alignment) with deterministic `⟦mock:…⟧` triggers; `pnpm fixtures:audio` (about 480 KB); registry with the startup capability check, 30 s cache, kill switches and breakers; breaker SQL with single-probe admission; IT-10 contract suite, UT-12 and DB-11. Decisions D-65–D-70.
- T-12 done (PR #15): `/v1/admin` staff + AAL2 guard (Bull Board included), audited catalogue and flag endpoints, web admin console (TOTP MFA, catalogue editor, flags and kill switches), IT-31 and E2E-04. Decisions D-71–D-73.

- T-13 done (PR #16): pure router (UT-20..UT-29) with TR/EN exclusion reasons, shared catalogue schemas, public `GET /v1/catalogue` with fresh availability and shared admin invalidation, generated API client, IT-31 and E2E-04 extended to the public endpoint. Decisions D-74–D-78.

- T-14 done (PR #17): pure deterministic moderation layer: Turkish-aware normalisation with leetspeak, invisible-character and homoglyph handling; hashed TR/EN hard-block lists with `pnpm moderation:hash`; age-plus-sexual co-occurrence; listed-artist voice/style blocking; profanity passes. UT-30..UT-36. Decisions D-79–D-84.
- T-15 done (PR #18): moderation pipeline (layer 1, mock classifier, fail-closed retry), atomic decision storage with hard-block case and suspension, friction with cooldown and suspension, `POST /v1/moderation/check` with a 10-minute result reuse, `ACCOUNT_RESTRICTED`, IT-11..IT-13, UT-40 and DB-12. Decisions D-85–D-90.
- T-16 done (PR #19): evaluation harness in `eval/` (mock and live modes, budget guard, reports), moderation golden set (1192 rows, TR and EN, evasion variants, 160 allowed rows) and lyricist golden set (24 rows), CI `eval-mock` job and manual `Eval` workflow. Owner approved the hard-block templates on 2026-11-15. Decisions D-91–D-96.

## Tasks

A finishing commit is recorded only when acceptance checks, including CI, pass.

| Task | Goal                                             | Status | Finishing commit |
| ---- | ------------------------------------------------ | ------ | ---------------- |
| T-01 | Monorepo, tooling and CI skeleton                | done   | 2ad951d          |
| T-02 | Shared packages and module boundaries            | done   | 98fb951          |
| T-03 | Supabase local and foundation migration          | done   | 5ffce0b          |
| T-04 | Core schema, RLS and seed                        | done   | f51fd4f          |
| T-05 | Backend skeleton                                 | done   | fc914a4          |
| T-06 | Auth, profile and age gate                       | done   | ef898af          |
| T-07 | Web skeleton                                     | done   | 76483d1          |
| T-08 | Jobs runtime (BullMQ + Redis)                    | done   | d1e2dc0          |
| T-09 | Flags, kill switches, rate limits, cost counters | done   | 2a5cb30          |
| T-10 | Mobile skeleton and the one-command local stack  | doing  |                  |
| T-11 | Mock providers, registry and contract tests      | done   | 5571840          |
| T-12 | Admin skeleton                                   | done   | 5e6d9ef          |
| T-13 | Router and catalogue endpoint                    | done   | f8df1d8          |
| T-14 | Deterministic moderation layer                   | done   | 6bc663e          |
| T-15 | Moderation pipeline                              | done   | 0deb9bc          |
| T-16 | Golden sets and evaluation harness               | done   | 7580941          |
| T-17 | Ledger core                                      | todo   |                  |
| T-18 | Lyricist                                         | todo   |                  |
| T-19 | Generation job end to end                        | todo   |                  |
| T-20 | Web create flow                                  | todo   |                  |
| T-21 | Notifications                                    | todo   |                  |
| T-22 | Web library, player, search, downloads           | todo   |                  |
| T-23 | Mobile create flow                               | todo   |                  |
| T-24 | Mobile library, player and offline downloads     | todo   |                  |
| T-25 | Cost control and resilience                      | todo   |                  |
| T-26 | Credit packs and Paddle sandbox                  | todo   |                  |
| T-27 | Spike S-4 and top-up                             | todo   |                  |
| T-28 | Mobile purchases (RevenueCat Test Store)         | todo   |                  |
| T-29 | Wallet and grants                                | todo   |                  |
| T-30 | Extend and remix                                 | todo   |                  |
| T-31 | Stems                                            | todo   |                  |
| T-32 | Cover images                                     | todo   |                  |
| T-33 | Synced lyrics                                    | todo   |                  |
| T-34 | Lyric video                                      | todo   |                  |
| T-35 | Gift flow and pages                              | todo   |                  |
| T-36 | Visibility, renditions and share pages           | todo   |                  |
| T-37 | Explore, likes, plays, trending                  | todo   |                  |
| T-38 | Profiles, follows, blocks, remixing others       | todo   |                  |
| T-39 | Reports, moderation console, appeals             | todo   |                  |
| T-40 | Legal drafts, consent and policy pages           | todo   |                  |
| T-41 | Data export and account deletion                 | todo   |                  |
| T-42 | Accessibility pass                               | todo   |                  |
| T-43 | Security review                                  | todo   |                  |
| T-44 | Load test, full local run and how-it-works       | todo   |                  |
| T-45 | Text model and live evaluations                  | todo   |                  |
| T-46 | Lyria live adapter, S-1 and S-6                  | todo   |                  |
| T-47 | ElevenLabs live adapter, S-2, S-3, S-5           | todo   |                  |
| T-48 | Images, pricing and live local run               | todo   |                  |
| T-49 | Store accounts and device-only features          | todo   |                  |
| T-50 | Deployment plan, legal review and submission     | todo   |                  |

## Spikes

| Spike | Milestone | Status  | Report |
| ----- | --------- | ------- | ------ |
| S-1   | M6 (T-46) | not run |        |
| S-2   | M6 (T-47) | not run |        |
| S-3   | M6 (T-47) | not run |        |
| S-4   | M2 (T-27) | not run |        |
| S-5   | M6 (T-47) | not run |        |
| S-6   | M6 (T-46) | not run |        |
