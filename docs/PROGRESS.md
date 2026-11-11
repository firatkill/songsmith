# Progress

Updated: 2026-11-11.

## Status

- Specs committed: `docs/PRD.md`, `docs/TRD.md`, `docs/IMPLEMENTATION_PLAN.md`, `AGENTS.md`. Committed in the public `firatkill/songsmith` repository.
- Build order is mock-first (PRD D-12): M0–M5 cost nothing; paid work starts at T-45.
- Local first (PRD D-14): everything runs on the owner's machine (web, iOS Simulator, Android Emulator) until T-50; jobs use BullMQ on Redis; deployment to a rented server happens once in T-50.
- T-01 done (PR #1): pnpm/Turborepo monorepo, shared strict TypeScript/ESLint/Prettier config, Vitest, CI `static` green.
- T-02 done (PR #5): shared packages build to ESM for Node, Next.js and React Native; error catalogue; TR/EN i18n with Turkish casing; provisional ui-tokens; module boundaries enforced by `pnpm check:boundaries`.
- T-03 done (PR #6): Supabase CLI 3.1.0 pinned; local Postgres 17 with e-mail OTP and Mailpit; default-deny foundation migration (`app`, `restricted`, `audit_log`); pgTAP DB-01/DB-02 (20 assertions); CI `db` job green.

- T-04 done (PR #7): core schema (migrations 0002–0007) with read-only RLS and hidden share/gift tokens; mock catalogue, language statuses, placeholder prices, six flags and a local staff admin seeded; `pnpm db:types` with CI drift check; 164 pgTAP assertions. Decisions D-20–D-26.
- T-05 done (PR #8): Express 5 API with the §13.1 middleware order, env validation, redacting JSON logger, TR/EN error mapping, `defineRoute`, `/v1/health`, OpenAPI 3.1 and generated `api-client`; `app` schema exposed to the backend service client only (D-27); CI `integration` job.
- T-06 done (PR #9): JWKS JWT auth with enforced route modes; profile status and age gate; `/v1/me`, `/v1/me/age`, `/v1/me/consents`; profile provisioning trigger; under-18 deletion with a 30-day sign-up block via the Auth hook; versioned append-only consents. Decisions D-32–D-39. Next: T-07.

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
| T-07 | Web skeleton                                     | todo   |                  |
| T-08 | Jobs runtime (BullMQ + Redis)                    | todo   |                  |
| T-09 | Flags, kill switches, rate limits, cost counters | todo   |                  |
| T-10 | Mobile skeleton and the one-command local stack  | todo   |                  |
| T-11 | Mock providers, registry and contract tests      | todo   |                  |
| T-12 | Admin skeleton                                   | todo   |                  |
| T-13 | Router and catalogue endpoint                    | todo   |                  |
| T-14 | Deterministic moderation layer                   | todo   |                  |
| T-15 | Moderation pipeline                              | todo   |                  |
| T-16 | Golden sets and evaluation harness               | todo   |                  |
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
