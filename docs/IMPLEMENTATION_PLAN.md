# Songsmith: Implementation Plan

Ordered tasks for building Songsmith end to end. Each task is sized for one focused agent session (roughly 2–5 hours) and ends in a state where its acceptance checks pass locally and in CI.

References: [PRD.md](./PRD.md) (FR, NFR, SEC, CMP, INF, D), [TRD.md](./TRD.md) (sections as "TRD §x", decisions TD-xx, assumptions A-xx), [../AGENTS.md](../AGENTS.md) (rules).

Conventions for every task:

- Branch `t-NN-short-name`; PR titled `T-NN: <goal>`; CI green before merge.
- A task is done when its acceptance checks pass and the tests it names exist. Update `docs/PROGRESS.md` in the same PR.
- SQL changes come with pgTAP tests in the same PR. Never edit an applied migration.
- If an assumption (TRD §25) fails, apply its fallback in that task and add a row to PRD §14.
- **M0–M5 must stay free (PRD D-12).** No task before T-45 may sign up for a paid service, call a live provider or need a paid developer account. If a task seems to need one, stop and ask the owner.

## Overview

| Milestone | Tasks | Exit criteria | Paid? |
| --------- | ----- | ------------- | ----- |
| M0 Foundation | T-01..T-12 | Monorepo builds; local Supabase with schema and RLS; auth with age gate on web and mobile; Express API with OpenAPI client; BullMQ worker on Redis; `pnpm dev:all` runs web, iOS and Android together; flags; mock providers with contract tests; admin skeleton | No |
| M1 Create and play | T-13..T-24 | A user creates, moderates, generates (mock), gets notified, and plays a song on web and mobile; ledger core charges and refunds | No |
| M2 Credits and payments | T-25..T-29 | Caps and kill switches; Paddle sandbox purchases and refunds; top-up path chosen by S-4; mobile purchases in Test Store; wallet | No |
| M3 More operations | T-30..T-34 | Extend, remix, stems, covers, synced lyrics, lyric video rendered in the worker, all on mocks | No |
| M4 Gift and community | T-35..T-39 | Gift pages, sharing, Explore, profiles, reports, moderation console, appeals | No |
| M5 Compliance and hardening | T-40..T-44 | Legal drafts, export and deletion, accessibility, security review, load tests, full local run on web, iOS and Android | No |
| M6 Real providers | T-45..T-48 | Live adapters pass contract tests; S-1, S-2, S-3, S-5, S-6 results; NFR-12 and NFR-13 met on live models; prices set; still local | Yes |
| M7 Launch | T-49..T-50 | Store accounts, device-only features verified, lawyer review, deployment plan executed (server, Supabase cloud, web, mobile), store submissions | Yes |

---

## M0 Foundation

### T-01 Monorepo, tooling and CI skeleton

- Goal: an empty but complete pnpm + Turborepo monorepo with strict TypeScript and a green CI `static` job.
- Files: root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.gitignore`, `.env.example`, `LICENSE` (MIT), `README.md` (stub), `packages/config/*` (tsconfig base, eslint, prettier), `.github/workflows/ci.yml` (`static` only), `.github/dependabot.yml`.
- Steps: create workspaces `frontend`, `backend`, `mobile`, `packages/*`, `eval`, `remotion` as empty packages with `lint`/`typecheck`/`test` scripts; resolve current stable versions and pin them (A-01); confirm every service in TRD §23 M0–M5 row is free for this use and record the result in README "Stack" (A-04, A-11).
- Acceptance: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` exit 0; CI `static` green.
- Depends on: none. Covers: INF-14 (partial), NFR-18.

### T-02 Shared packages and module boundaries

- Goal: `packages/schemas`, `domain`, `moderation-rules`, `i18n`, `ui-tokens`, `api-client` exist with build output usable from Node, Next.js and React Native.
- Steps: errors catalogue (`packages/schemas/src/errors.ts`) with TR/EN messages; `packages/i18n` with `tr.json`, `en.json`, ICU formatting and Turkish casing helpers (UT-01); `ui-tokens` exporting CSS variables and an RN theme object; ESLint `no-restricted-imports` for TRD §4.1 and `pnpm check:boundaries`.
- Acceptance: UT-01 (Turkish `İ/ı` casing), UT-02 (every error code has both translations), `pnpm check:boundaries` fails on a planted violating import in a fixture test.
- Depends on: T-01. Covers: NFR-09, NFR-18, FR-87 (partial).

### T-03 Supabase local and foundation migration

- Goal: `pnpm db:start`/`db:reset` run a local Supabase with schemas `app`, `restricted`, the default-deny grant model and a pgTAP harness.
- Files: `supabase/config.toml` (auth: e-mail OTP, Google and Apple providers disabled until keys exist; Mailpit), `supabase/migrations/0001_foundation.sql`, `supabase/tests/000_grants.test.sql`.
- Steps: TRD §6.1 conventions; revoke default privileges; `updated_at` trigger function; `audit_log`.
- Acceptance: `pnpm db:reset && pnpm test:db` with DB-01 (no `insert/update/delete` grants to `anon`/`authenticated` on any table) and DB-02 (RLS on every `public` table).
- Depends on: T-01. Covers: SEC-01, INF-03, INF-18.

### T-04 Core schema, RLS and seed

- Goal: all tables of TRD §6.2 (except credits and payments, which come in T-17 and T-26), with RLS policies and seed.
- Files: `0002_identity.sql`, `0003_catalogue.sql`, `0004_songs_jobs.sql`, `0005_library_community.sql`, `0006_moderation.sql`, `0007_ops.sql`, `supabase/seed.sql` (mock catalogue rows and language statuses from TRD §8.4, placeholder prices, flags, a staff user for local), `supabase/tests/010_rls_*.test.sql`.
- Acceptance: pgTAP DB-03..DB-08: owner can read own songs, others can read only public ready songs, blocked owners hidden, unlisted not readable by others, `restricted` not readable, `provider_health` not readable. `pnpm db:types` generates types with no diff in CI.
- Depends on: T-03. Covers: FR-11, FR-25, FR-54 (storage), INF-16.

### T-05 Backend skeleton

- Goal: Express 5 API process (TD-01) with env validation, logger, error middleware, middleware order (TRD §13.1), `defineRoute` helper, health route and OpenAPI generation.
- Files: `backend/src/app.ts`, `backend/src/server.ts`, `src/lib/route.ts` (`defineRoute`), `src/lib/{env,log,errors,ids,correlation}.ts`, `src/routes/health.ts`, `backend/openapi.json`, `packages/api-client` generation script.
- Acceptance: UT-03 (env refuses `PROVIDER_MODE=live` locally without the override, refuses mock in production without the override), UT-04 (error middleware maps `AppError`, `ZodError` and unknown errors without stack traces), UT-05 (log redaction), UT-06 (tokens are 128-bit base64url); `pnpm openapi` and CI drift check; `GET /v1/health` 200 in an integration test; webhook routes receive the raw body.
- Depends on: T-02. Covers: NFR-16, SEC-11, SEC-14.

### T-06 Auth, profile and age gate

- Goal: sign-in with e-mail OTP (Google/Apple wiring present, enabled when keys exist), JWT verification in the backend, `/v1/me`, age gate and consents.
- Files: `src/lib/auth.ts`, `src/routes/me.ts`, migration for profile creation trigger, tests.
- Acceptance: IT-04 (unauthenticated → 401; non-adult profile → `NOT_ADULT` on every other route), IT-05 (date of birth is not stored; under 18 deletes the user), IT-06 (consents recorded with version).
- Depends on: T-04, T-05. Covers: FR-85, FR-86, CMP-01, CMP-16 (storage).

### T-07 Web skeleton

- Goal: Next.js app with locales, tokens, auth screens (OTP), age gate, AI-disclosure consent screen, app shell with navigation, CSP and security headers.
- Acceptance: Playwright config per TRD §21.2; E2E-01 sign up with OTP via Mailpit → age gate → consent → home; E2E-02 under-18 is refused; E2E-03 security headers present; Lighthouse CI on the landing page (NFR-01 tracked, not yet gated).
- Depends on: T-06. Covers: FR-87, SEC-09, NFR-08 (start).

### T-08 Jobs runtime (BullMQ + Redis)

- Goal: Redis in `docker/compose.yml` (AOF, `noeviction`), `backend/src/worker.ts`, queues of TRD §9.1, `enqueue()`, the step runner of §9.2, job schedulers (sweeper, nightly placeholder), Bull Board behind the admin guard, job status updates through Realtime; `pnpm dev` starts Redis, API, worker and web.
- Acceptance: IT-07 a three-step test job whose second step fails once resumes at step two (step one not re-run); IT-08 sweeper re-enqueues a stuck job, fails it after two recoveries, and recovers queued jobs after a Redis `FLUSHALL`; IT-42 a polling step releases its worker slot (`moveToDelayed`) and completes; restarting the worker does not duplicate schedulers. Check A-03.
- Depends on: T-05. Covers: INF-02, NFR-05 (mechanism), TD-02.

### T-09 Flags, kill switches, rate limits, cost counters

- Goal: `flags` cache (30 s), `killSwitch(provider|operation|all)`, `app.rate_limit_hit`, `cost_counters` with daily caps per user, provider and global.
- Acceptance: DB-09 rate limit window; UT-07 flag cache expiry; IT-09 kill switch takes effect within 60 s (fake timers).
- Depends on: T-04, T-05. Covers: FR-91, FR-92, FR-93, INF-13, SEC-06.

### T-10 Mobile skeleton and the one-command local stack

- Goal: Expo app with Expo Router tabs, i18n, tokens, OTP sign-in, age gate, consent; development builds on the iOS Simulator and Android Emulator; Metro monorepo config; per-platform API and Supabase host resolution (TRD §5.1); `pnpm dev:all` and `pnpm dev:check`; `docs/runbooks/local-dev.md`.
- Acceptance: on a clean clone, following the runbook, `pnpm dev:all` brings up Supabase, Redis, API, worker, web and the app on both simulators at the same time; signing in with OTP (code from Mailpit) works on web, iOS and Android against the same local backend; Maestro flow M-01 sign-in to home on the Android Emulator; `expo prebuild` output git-ignored (TD-07). Check A-13.
- Depends on: T-06, T-08. Covers: INF-11, INF-18, FR-85, FR-87.

### T-11 Mock providers, registry and contract tests

- Goal: every adapter interface in TRD §8.1, mock implementations from §8.4, audio fixtures, registry with startup capability check, breaker store, contract test suite.
- Acceptance: IT-10 contract suite green for `mock-music-a` and `mock-music-b`; UT-12 registry never imports `providers/live` in mock mode; failure triggers produce the documented `ProviderError` codes; fixtures under 3 MB.
- Depends on: T-05, T-04. Covers: FR-24, INF-06, INF-18, TD-04.

### T-12 Admin skeleton

- Goal: `/v1/admin/*` guard (staff role + MFA AAL2, also protecting Bull Board), audit logging middleware, web admin layout with catalogue editor and flags/kill-switch page.
- Acceptance: IT-31 non-staff 403, staff without MFA 403, staff with MFA 200 and audit row written; E2E-04 `@isolated` admin disables a model and the catalogue endpoint hides it within 60 s.
- Depends on: T-07, T-09, T-11. Covers: FR-25, FR-93, FR-94 (partial), SEC-10.

## M1 Create and play

### T-13 Router and catalogue endpoint

- Goal: `packages/domain/src/router.ts` (TRD §8.3) and `GET /v1/catalogue`.
- Acceptance: UT-20..UT-29 table tests (capability filter, language verified/beta, instrumental skips language, extend prefers source model, manual choice not eligible, tie-break, all models excluded with per-model reasons, breaker open, kill switch).
- Depends on: T-11. Covers: FR-27, FR-28, FR-30 (mocks).

### T-14 Deterministic moderation layer

- Goal: `packages/moderation-rules`: normalisation, hashed hard-block lists (TR, EN), artist-voice patterns, age-plus-sexual co-occurrence rules.
- Acceptance: UT-30..UT-36 (normalisation of leetspeak, zero-width, homoglyphs, Turkish case folding; hard-block hit on evasion variants; profanity alone passes).
- Depends on: T-02. Covers: FR-51 (layer 1), FR-53.

### T-15 Moderation pipeline

- Goal: `backend/src/moderation/pipeline.ts` with classifier through `TextAdapter` (mock), decisions and evidence storage, hard-block handling, friction, `POST /v1/moderation/check`.
- Acceptance: IT-11 hard block creates a critical case and suspends generation in one transaction; IT-12 three blocks → cooldown; IT-13 classifier parse failure fails closed; UT-40 prompt wraps user text as data.
- Depends on: T-14, T-11, T-04. Covers: FR-50, FR-51, FR-54, FR-55, FR-56, SEC-08.

### T-16 Golden sets and evaluation harness

- Goal: `eval/harness` (modes `mock`/`live`, budget guard that aborts before exceeding `--budget-usd`, report writer), first moderation golden set (owner reviews hard-block rows), lyricist golden set, CI `eval-mock` job, `eval.yml` manual workflow.
- Acceptance: EV-01 mock run passes; the harness refuses `--mode live` without `--budget-usd`; CI requires `eval-mock` when moderation or lyricist prompt paths change.
- Depends on: T-15. Covers: FR-57, INF-15, NFR-12 (harness).

### T-17 Ledger core

- Goal: credit tables and functions of TRD §7 (without purchases), sign-up grant after e-mail verification.
- Acceptance: DB-10..DB-18; IT-01 concurrency; IT-03 reconciliation finds an injected discrepancy.
- Depends on: T-04. Covers: FR-70, FR-71, FR-72, FR-77, NFR-07, SEC-05.

### T-18 Lyricist

- Goal: `POST /v1/lyrics/write` and `/rewrite-section` with mock text adapter, validation and repair, output moderation; `packages/domain/src/lyrics.ts` (parse, serialise, add-missing-tags).
- Acceptance: UT-41..UT-45 lyrics domain; IT-14 invalid output repaired once then fails with credits released.
- Depends on: T-15, T-17. Covers: FR-02, FR-03, FR-04, NFR-13 (plumbing).

### T-19 Generation job end to end

- Goal: `POST /v1/songs` (validate, moderate, route, reserve, job row, event), `generateSong` function (TRD §9.2), storage paths, ID3 tags, settle or release, Realtime status; check A-06 and A-08.
- Acceptance: IT-15 happy path on `mock-music-a` and on async `mock-music-b`; IT-16 `⟦mock:fail:timeout⟧` → refunded; IT-18 Auto fallback only to same-or-cheaper model; IT-17 idempotency key replay returns the same job; IT-19 per-user concurrency limit.
- Depends on: T-08, T-13, T-15, T-17. Covers: FR-08, FR-09, FR-10, FR-11, FR-29, FR-90.

### T-20 Web create flow

- Goal: Describe / My lyrics modes, lyrics editor (sections, reorder, undo, rewrite dialog), style controls built from the catalogue, instrumental mode, Advanced model picker with reasons, moderation feedback, price on the button, job progress screen.
- Acceptance: E2E-10 describe → lyrics → edit → generate → ready; E2E-11 my lyrics with missing tags accepted; E2E-12 Turkish song routes to `mock-music-b` and the picker shows "language not verified" for A; E2E-13 blocked input shows category message; E2E-14 insufficient credits opens buy sheet (stub until T-26).
- Depends on: T-18, T-19, T-07. Covers: FR-01–FR-08, FR-28, US-01–US-05.

### T-21 Notifications

- Goal: `notify()`, in-app notification centre (web), e-mail templates TR/EN (Mailpit locally), Expo push registration and sending (Android emulator verifies; iOS in M7), settings screen.
- Acceptance: IT-20 song ready writes in-app row and sends e-mail when opted in; E2E-15 notification appears without reload.
- Depends on: T-19. Covers: FR-09, FR-88, INF-08.

### T-22 Web library, player, search, downloads

- Goal: library tabs, playlists CRUD and reorder, favourites, search (Turkish FTS), global player with mini player, Media Session, keyboard controls, MP3/WAV download with signed URLs.
- Acceptance: E2E-16 playlist create/reorder; E2E-17 search finds "İstanbul" with "istanbul"; E2E-18 player keeps playing across navigation; IT-21 signed URL expires; WAV offered only when stored.
- Depends on: T-19, T-07. Covers: FR-31–FR-34, FR-36, US-11, US-13.

### T-23 Mobile create flow

- Goal: the T-20 flow on mobile with shared domain and schemas.
- Acceptance: Maestro M-02 describe → generate → ready on both emulators.
- Depends on: T-20, T-10. Covers: FR-01–FR-09 (mobile).

### T-24 Mobile library, player and offline downloads

- Goal: library, track player with background playback and lock-screen controls (check A-02), downloads with SQLite index and validity sync.
- Acceptance: Maestro M-03 play, background, controls; M-04 download, airplane mode, play; deleted song disappears from Downloads after sync.
- Depends on: T-23, T-22. Covers: FR-31, FR-33, FR-35.

## M2 Credits and payments

### T-25 Cost control and resilience

- Goal: `provider_calls` recording, per-user and global caps enforced before reservation, kill switches checked in API and in each job step, circuit breakers wired, admin cost dashboard.
- Acceptance: IT-22 global cap refuses new jobs with `CAP_REACHED`; IT-23 breaker opens after 5 failures and the router skips the provider; E2E-20 `@isolated` kill switch blocks Generate with a clear message.
- Depends on: T-19, T-12. Covers: FR-90–FR-94, INF-06, G-6.

### T-26 Credit packs and Paddle sandbox

- Goal: `credit_packs`, `purchases`, `payment_events`; checkout endpoint; Paddle overlay on web; webhook with signature check; refunds via `reverse_purchase`; `pnpm paddle:simulate`. Check A-12.
- Acceptance: IT-02 duplicate webhooks grant once; IT-24 invalid signature 401; IT-25 refund reverses and can make balance negative, then spending is refused; E2E-21 sandbox purchase (or simulated webhook) increases balance.
- Depends on: T-17. Covers: FR-73, FR-76, FR-78, SEC-04.

### T-27 Spike S-4 and top-up

- Goal: run S-4 against Paddle sandbox, write `docs/spikes/S-4-paddle-topup.md`, implement Path A or Path B (TRD §16.3), settings UI on web, limits, receipts; log the decision in PRD §14.
- Acceptance: IT-26 top-up triggers below threshold, not above 3 per day, not above monthly cap; E2E-22 settings saved and shown.
- Depends on: T-26, T-21. Covers: FR-74, S-4.

### T-28 Mobile purchases (RevenueCat Test Store)

- Goal: RevenueCat SDK, products per pack, purchase sheet on mobile, webhook with REST re-fetch, refunds. Check A-05.
- Acceptance: IT-27 webhook grants once and verifies via REST; Maestro M-05 Test Store purchase increases balance; no auto top-up or web link on mobile.
- Depends on: T-26, T-24. Covers: FR-75, FR-76, CMP-12.

### T-29 Wallet and grants

- Goal: wallet screens (web, mobile) with ledger history and receipts; daily grant behind a flag (off); promotional expiry; nightly reconciliation job with alert.
- Acceptance: E2E-23 wallet shows the history of a purchase, spend and refund; DB-19 promo expiry FIFO; IT-28 nightly job alerts on discrepancy.
- Depends on: T-26, T-28. Covers: FR-72, FR-79, FR-80, NFR-07.

## M3 More operations

### T-30 Extend and remix

- Goal: endpoints, jobs, UI on web and mobile; cross-model warning; remix linked to source.
- Acceptance: IT-29 extend of a `mock-music-a` song routes to `mock-music-b` with the warning flag; E2E-24 extend and remix flows.
- Depends on: T-19, T-20, T-23. Covers: FR-15, FR-16, US-07.

### T-31 Stems

- Goal: stems job, individual files and ZIP with 7-day expiry, UI.
- Acceptance: IT-32 stems stored and ZIP expires (lifecycle job); E2E-25 download stems.
- Depends on: T-30. Covers: FR-17, INF-19.

### T-32 Cover images

- Goal: cover job with prompt moderation and image safety check; regenerate with instruction (paid); covers in all lists and the player.
- Acceptance: IT-33 unsafe image (mock trigger) is discarded and refunded; E2E-26 regenerate cover.
- Depends on: T-19, T-15. Covers: FR-18, FR-52 (images).

### T-33 Synced lyrics

- Goal: alignment job (mock), timings from model when present, synced view with tap-to-seek on web and mobile.
- Acceptance: UT-46 line timings from word timings; E2E-27 current line highlights and tap seeks.
- Depends on: T-22, T-24. Covers: FR-20, FR-34, NFR-08 (captions).

### T-34 Lyric video

- Goal: Remotion composition, rendering inside the worker on the `video` queue (TRD §12.3), UI with progress and download; check A-07 (licence).
- Acceptance: CI renders a 5-second smoke clip; IT-34 video job stores an MP4 with metadata; E2E-28 request video and receive notification.
- Depends on: T-33, T-32. Covers: FR-19, FR-46 (export), CMP-09 (video), INF-04.

## M4 Gift and community

### T-35 Gift flow and pages

- Goal: guided gift form, gift lyric templates (mock lyricist), gift creation with message, schedule and revoke, `/g/[token]` page without account, `noindex`; gift details purge job.
- Acceptance: E2E-29 gift created and opened in a fresh context; revoked link shows "no longer available"; future `opens_at` shows a countdown; IT-35 harassment of the named person blocked.
- Depends on: T-30, T-33. Covers: FR-40–FR-46, US-09, US-10.

### T-36 Visibility, renditions and share pages

- Goal: visibility changes create or delete renditions (TRD §12.1); `/s/[token]` with OG tags and OG image; `apple-app-site-association` and `assetlinks.json`.
- Acceptance: IT-41 private files never in `public-media`; E2E-30 making a song private breaks the old public URL; OG tags present.
- Depends on: T-22. Covers: FR-60, FR-61, SEC-02, INF-07, INF-17.

### T-37 Explore, likes, plays, trending

- Goal: Explore feeds, likes, play tickets and counting, trending cron, explicit filter.
- Acceptance: UT-47 trending formula; IT-36 play counted once per listener per hour, ticket required; E2E-31 `@isolated` Explore ordering.
- Depends on: T-36. Covers: FR-62, FR-63, FR-58, NFR-15.

### T-38 Profiles, follows, blocks, remixing others

- Goal: public profile pages, follow, block (hides content both ways in Explore and profile), remix of public songs when allowed, owner-level remix default.
- Acceptance: DB-20 blocked user's songs not returned by RLS; E2E-32 remix of another user's song credits the original; remix refused when disabled.
- Depends on: T-37, T-30. Covers: FR-64, FR-65, US-14, US-15.

### T-39 Reports, moderation console, appeals

- Goal: report endpoint and UI on all surfaces (anonymous on web with Turnstile), cases queue, preview with moderation history, actions with notices, appeal flow with a different decider.
- Acceptance: IT-37 action writes audit log and sends notice; IT-38 appeal cannot be decided by the original moderator; E2E-33 report → remove → user notified → appeal.
- Depends on: T-12, T-38. Covers: FR-66–FR-68, CMP-02, CMP-10, US-16, US-20.

## M5 Compliance and hardening

### T-40 Legal drafts, consent and policy pages

- Goal: drafts in `docs/legal/` and pages for CMP-18 in TR and EN; content policy page from PRD §9.1; child-safety runbook (`docs/runbooks/child-safety.md`); AI labels on every surface (CMP-09); cookie consent for analytics where required.
- Acceptance: E2E-34 every legal page reachable from footer and settings in both languages; "AI-generated" label on song, share and gift pages.
- Depends on: T-35, T-36. Covers: CMP-01–CMP-18 (drafts), CMP-03, CMP-09.

### T-41 Data export and account deletion

- Goal: export ZIP job; deletion flow in ≤ 3 steps on web and mobile, deletion job per TRD §19.3.
- Acceptance: IT-39 export contains every listed item; IT-40 deletion removes storage and personal rows and keeps tombstoned ledger rows; E2E-35 and Maestro M-06 delete account.
- Depends on: T-29, T-39. Covers: FR-89, FR-95, CMP-05, CMP-08, CMP-15.

### T-42 Accessibility pass

- Goal: WCAG 2.2 AA on web (axe in Playwright on main pages), VoiceOver/TalkBack labels on mobile, keyboard player.
- Acceptance: E2E-36 axe has no serious or critical violations on listed pages; manual checklist in `docs/runbooks/accessibility.md`.
- Depends on: T-35..T-39. Covers: NFR-08, CMP-17.

### T-43 Security review

- Goal: threat model (`docs/security/threat-model.md`), RLS audit, rate limits on every listed route, Turnstile on web sign-up/checkout/anonymous report, secret and dependency scanning gates, prompt-injection tests on lyricist and classifier.
- Acceptance: IT-30 rate limits; checklist of SEC-01..SEC-14 with evidence links, all green except items scheduled for M7 (attestation, PITR, EAS signing).
- Depends on: T-39. Covers: SEC-01–SEC-14, NFR-10.

### T-44 Load test, full local run and how-it-works

- Goal: k6 run against the local stack (API and job throughput on mocks); concurrency suite; a scripted full local run of web, iOS and Android together covering every M1–M4 flow (`docs/runbooks/local-acceptance.md`); `/how-it-works` page; README with architecture and screenshots.
- Acceptance: NFR-04 p95 < 400 ms locally on mocks; full Playwright and Maestro suites green on the local stack; the owner completes the local acceptance checklist on all three platforms; README complete.
- Depends on: T-40..T-43. Covers: NFR-04, NFR-05, G-7, INF-18.

## M6 Real providers (paid; owner sets the budget first)

### T-45 Text model and live evaluations

- Goal: decide Q-03 with a small lyricist comparison; live `TextAdapter`; live moderation and lyricist evaluations within budget; tune prompts and lists until NFR-12 and NFR-13 pass.
- Acceptance: EV-01 live meets NFR-12; EV-02 live meets NFR-13; reports committed; PRD decision logged.
- Depends on: T-44. Covers: Q-03, FR-57, NFR-12, NFR-13.

### T-46 Lyria live adapter, S-1 and S-6

- Goal: Lyria adapter; contract suite live; S-1 Turkish ratings (two native raters) and S-6 latency/limits; update `model_languages` and provider concurrency flags.
- Acceptance: EV-04 contract live green; `docs/spikes/S-1-turkish.md` and `S-6-latency.md`; catalogue updated through a migration.
- Depends on: T-45. Covers: FR-26, FR-30, S-1, S-6.

### T-47 ElevenLabs live adapter, S-2, S-3, S-5

- Goal: ElevenLabs music adapter (generate, extend, stems), alignment adapter; spikes S-2, S-3, S-5; decide Q-02.
- Acceptance: contract live green; spike reports; PRD decisions for Q-02 and alignment.
- Depends on: T-46. Covers: FR-15, FR-17, FR-20, S-2, S-3, S-5.

### T-48 Images, pricing and live local run

- Goal: live image and image-safety adapters; video render time and memory measured for server sizing (A-07); credit prices and packs from measured costs (Q-04); portfolio budget and caps (NFR-17); full local run on live providers with low caps.
- Acceptance: end-to-end local run on live providers within budget; pricing migration; cost dashboard shows real costs; render benchmark recorded for T-50.
- Depends on: T-47. Covers: FR-18, FR-19, Q-04, NFR-17.

## M7 Launch (paid accounts; owner approval per item)

### T-49 Store accounts and device-only features

- Goal: Apple Developer Program and Google Play Console; iOS push (APNs), Sign in with Apple on device, App Attest and Play Integrity for free grants, store sandbox purchases through RevenueCat, universal and app links on devices, EAS Update signing.
- Acceptance: Maestro suites on physical or store-signed builds; checklist items for SEC-07 and SEC-12 complete.
- Depends on: T-48. Covers: FR-75, SEC-07, SEC-12, INF-11.

### T-50 Deployment plan, legal review and submission

- Goal: write `docs/DEPLOYMENT.md` and execute it in order (TRD §22): Supabase cloud project (PITR, restore drill), rented server with Docker Compose (`api`, `worker`, `redis`, `caddy`), web on Vercel or the same server, webhooks, EAS production builds; lawyer review of `docs/legal/` and CMP items marked [verify]; store listings (18+ rating, AI disclosure); submissions; final full test suite; release notes.
- Files: `docker/api.Dockerfile`, `docker/worker.Dockerfile`, `docker/compose.prod.yml`, `docker/Caddyfile`, `.github/workflows/release.yml` (build and push images by tag), `docs/DEPLOYMENT.md`, `docs/runbooks/release.md`.
- Acceptance: production smoke test passes with mocks and then with live providers at low caps; release checklist all green; launch gates in PRD §12 met. Check A-11.
- Depends on: T-49. Covers: D-03, D-14, INF-01, SEC-03, SEC-13, CMP-01–CMP-18, Q-01, Q-05, Q-06.
