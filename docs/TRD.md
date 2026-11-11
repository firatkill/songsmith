# Songsmith: Technical Requirements Document

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Product  | Songsmith (working name)                                       |
| Status   | Draft for review                                               |
| Date     | 2026-11-10                                                     |
| Requires | `docs/PRD.md` (requirement IDs), `AGENTS.md` (rules)           |
| Next     | `docs/IMPLEMENTATION_PLAN.md` (tasks T-xx), `docs/PROGRESS.md` |

This document defines how Songsmith is built. It references PRD IDs (FR, NFR, SEC, CMP, INF, D, S, Q). Its own IDs are stable and append-only:

- **TD-xx**: technical decisions (section 24).
- **A-xx**: assumptions not yet verified, each with a fallback (section 25).
- **DB-xx, UT-xx, IT-xx, E2E-xx, EV-xx**: named tests (section 21).

**Build order (PRD D-12).** Everything in M0 to M5 runs on mock providers, free tiers and sandboxes. Every design that depends on a paid provider sits behind an interface whose mock implementation exists from M0. M6 replaces mocks with live adapters; it must not need changes outside `backend/src/providers/live/`, the catalogue seed and the evaluation results. If it does, the interface was wrong; fix the interface and log a TD entry.

---

## 1. Reading order for implementers

1. PRD sections 2, 7, 9 (what the product does and the content policy).
2. This document, sections 2 to 6 (architecture, stack, layout, configuration, database).
3. The section for the task's area (credits §7, models §8, jobs §9, moderation §10 and so on).
4. `AGENTS.md` for coding rules, then the task in `docs/IMPLEMENTATION_PLAN.md`.

## 2. Architecture

```
                ┌─────────────────────┐        ┌──────────────────────┐
  Browser ────▶ │ frontend/ (Next.js) │        │ mobile/ (Expo RN)    │ ◀── iOS / Android
                │ web app, share and  │        │ iOS + Android apps   │
                │ gift pages, admin   │        └──────────┬───────────┘
                └─────────┬───────────┘                   │
                          │  HTTPS JSON (typed client from packages/api-client)
                          ▼                               ▼
                ┌───────────────────────────────┐   enqueue    ┌───────────────────────────────┐
                │ backend API (server.ts)       │ ───────────▶ │ Redis 7 (BullMQ queues)        │
                │ Express 5: /v1 REST, webhooks │              └───────────────┬───────────────┘
                │ moderation · router · ledger  │                              │ consume
                │ calls (no provider work)      │              ┌───────────────▼───────────────┐
                └──────┬────────────────────────┘              │ backend worker (worker.ts)     │
                       │ service role                          │ music · media · video ·        │
                       │                                       │ account · maintenance queues   │
                       │                                       │ providers/mock/* | live/*      │
                       ▼                                       └──────┬─────────────────┬──────┘
                ┌────────────────────────────┐   service role         │                 │ HTTPS
                │ Supabase: Postgres, Auth,  │ ◀──────────────────────┘                 ▼
                │ Storage, Realtime          │                    ┌─────────────────────────────┐
                └────────────────────────────┘                    │ Providers (mock or live):    │
                                                                  │ music, LLM, image, alignment,│
                                                                  │ Paddle, RevenueCat, Expo     │
                                                                  │ push, Resend                 │
                                                                  └─────────────────────────────┘
```

Rules that shape everything else:

- **Reads may go direct, writes never do.** Clients read their own data and public data from Supabase with the user's JWT under RLS (lists, library, job status through Realtime). Every write goes through the backend API. Database roles `anon` and `authenticated` have `select` only, and only on tables with a policy (TD-03).
- **Money and safety live in SQL and the backend.** Credit changes happen only in `security definer` SQL functions (§7). Moderation runs only in the backend (§10). Clients show prices and pre-checks but never decide.
- **Providers are adapters.** No code outside `backend/src/providers/` imports a provider SDK or calls a provider URL.
- **Every long operation is a job.** API handlers validate, moderate, reserve credits, create a job row and enqueue a BullMQ job, then return `202` with the job ID. They never call a music provider inline; only the worker does.

## 3. Stack

Exact versions are resolved and pinned in T-01 and recorded in the README. Majors below are the target; if a newer stable major exists at T-01, the implementer may take it and record it (A-01).

| Area             | Choice                                                                                                                                     | Notes                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Language         | TypeScript 5.x strict everywhere                                                                                                           | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Runtime          | Node 22 LTS or newer                                                                                                                       | `.nvmrc`                                                 |
| Package manager  | pnpm workspaces + Turborepo                                                                                                                | task caching for lint, typecheck, test, build            |
| Web              | Next.js (App Router), React 19, Tailwind 4, shadcn/ui, next-intl, TanStack Query                                                           | `frontend/`                                              |
| Backend          | Express 5 with `helmet`, `cors`, Zod request validation and `@asteasolutions/zod-to-openapi`; long-running Node processes (API and worker) | `backend/` (TD-01)                                       |
| Validation       | Zod 4                                                                                                                                      | one schema source in `packages/schemas`                  |
| API client       | Generated from the OpenAPI document (`openapi-typescript` + `openapi-fetch`)                                                               | `packages/api-client`                                    |
| Database         | Supabase Postgres 17, EU region (Frankfurt)                                                                                                | migrations in `supabase/migrations`                      |
| DB tests         | pgTAP through `supabase test db`                                                                                                           | `supabase/tests`                                         |
| Jobs             | BullMQ on Redis 7; Bull Board for the admin queue view                                                                                     | TD-02                                                    |
| Containers       | Docker Compose for Redis locally and for API, worker, Redis and reverse proxy in production                                                | §22                                                      |
| Mobile           | Expo (latest SDK), Expo Router, React Native New Architecture                                                                              | `mobile/`                                                |
| Mobile audio     | `react-native-track-player`                                                                                                                | background, lock screen, Bluetooth (A-02)                |
| Mobile purchases | RevenueCat (`react-native-purchases`) with its Test Store until M7                                                                         | TD-06, A-05                                              |
| Web payments     | Paddle Billing, sandbox until launch                                                                                                       | PRD D-04                                                 |
| E-mail           | Resend + React Email; Mailpit (bundled with Supabase CLI as Inbucket/Mailpit) locally                                                      | TD-08                                                    |
| Push             | Expo Push Service (APNs, FCM)                                                                                                              |                                                          |
| Video            | Remotion renderer inside the worker (`video` queue), locally and on the server                                                             | A-07                                                     |
| Analytics        | PostHog EU Cloud, server-side events for money and generation                                                                              |                                                          |
| Errors           | Sentry (web, backend, mobile)                                                                                                              |                                                          |
| Unit tests       | Vitest                                                                                                                                     |                                                          |
| Web E2E          | Playwright (two projects: `parallel`, `isolated`)                                                                                          | §21                                                      |
| Mobile E2E       | Maestro                                                                                                                                    |                                                          |
| Lint and format  | ESLint (typescript-eslint strict) + Prettier                                                                                               |                                                          |

## 4. Repository layout

```
songsmith/
├─ AGENTS.md  README.md  LICENSE  package.json  pnpm-workspace.yaml  turbo.json
├─ .github/workflows/        ci.yml, eval.yml (manual, paid), deploy-*.yml
├─ docker/                   compose.yml (local Redis), production compose and Dockerfiles (T-50)
├─ docs/                     PRD, TRD, IMPLEMENTATION_PLAN, PROGRESS, spikes/, runbooks/, legal/
├─ frontend/                 Next.js app
│  └─ src/app/[locale]/…     (marketing, app, share, gift, admin route groups)
├─ backend/
│  └─ src/
│     ├─ app.ts              Express app, middleware order (§13.1)
│     ├─ server.ts           API process entry (`app.listen`)
│     ├─ worker.ts           worker process entry (BullMQ workers and schedulers)
│     ├─ routes/             one file per resource
│     ├─ jobs/               queues, enqueue, step runner, processors (§9)
│     ├─ moderation/         pipeline, policy prompts (versioned), classifier client
│     ├─ lyricist/           prompts (versioned), output validation
│     ├─ models/             registry, router glue, breaker store, catalogue cache
│     ├─ providers/
│     │  ├─ types.ts         adapter interfaces (§8.1)
│     │  ├─ mock/            mock adapters + fixtures (M0)
│     │  └─ live/            live adapters (M6)
│     ├─ media/              storage paths, renditions, ID3 tagging
│     ├─ payments/           paddle/, revenuecat/
│     ├─ notify/             push, email, in-app
│     ├─ db/                 Supabase service client, typed RPC wrappers
│     └─ lib/                env, log, errors, flags, rate limit, ids
├─ mobile/                   Expo app (ios/ and android/ are generated by prebuild, not committed — TD-07)
├─ packages/
│  ├─ schemas/               Zod schemas shared by backend and clients
│  ├─ api-client/            generated OpenAPI client
│  ├─ domain/                pure logic: router, pricing, lyrics sections, normalisation, trending score
│  ├─ moderation-rules/      deterministic layer (pure; used by backend, mirrored in clients for hints)
│  ├─ i18n/                  tr.json, en.json, ICU messages, Turkish casing helpers
│  ├─ ui-tokens/             colours, spacing, type scale → CSS variables and RN theme
│  └─ config/                shared tsconfig, eslint, prettier
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/            0001_… numbered SQL
│  ├─ seed.sql               catalogue with mock models, placeholder prices, flags, staff user
│  └─ tests/                 pgTAP
├─ eval/
│  ├─ moderation/            golden set (JSONL), thresholds
│  ├─ lyricist/              golden set
│  ├─ language/              lyric sets per language (S-1)
│  └─ harness/               runner: provider mode, budget guard, report writer
└─ remotion/                 lyric video composition (package used by the renderer)
```

### 4.1 Module boundaries

Enforced with ESLint `no-restricted-imports` and checked by `pnpm check:boundaries`:

- `packages/*` never import from `frontend`, `backend` or `mobile`.
- `packages/domain`, `packages/moderation-rules`, `packages/schemas` have no I/O and no Node-only imports (they run in React Native).
- `frontend` and `mobile` never import `backend`.
- Inside `backend`, only `src/providers/**` imports provider SDKs (`@google/genai`, `elevenlabs`, `@paddle/paddle-node-sdk` is allowed in `src/payments/paddle/**`).
- `src/providers/live/**` is never imported when `PROVIDER_MODE=mock` (registry uses dynamic import; UT-12 checks).

### 4.2 Root scripts

| Script                                                     | Does                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                 | Redis, API, worker and web in parallel (Supabase must be started)                                    |
| `pnpm dev:all`                                             | Supabase, Redis, API, worker, web and Expo on the iOS Simulator and Android Emulator together (§5.1) |
| `pnpm dev:check`                                           | checks local prerequisites (§5.1)                                                                    |
| `pnpm dev:mobile`                                          | Expo dev server against the local backend                                                            |
| `pnpm db:start` / `db:stop` / `db:reset`                   | Supabase CLI local stack; reset applies migrations and seed                                          |
| `pnpm db:types`                                            | Generates `packages/schemas/src/db.types.ts` from the local database                                 |
| `pnpm lint` / `typecheck` / `test`                         | Turborepo across all workspaces                                                                      |
| `pnpm test:db`                                             | pgTAP                                                                                                |
| `pnpm test:integration`                                    | backend integration tests against local Supabase and mock providers                                  |
| `pnpm e2e`                                                 | Playwright against a production build with mocks                                                     |
| `pnpm e2e:mobile`                                          | Maestro flows on a simulator or emulator                                                             |
| `pnpm eval:moderation` / `eval:lyricist` / `eval:language` | evaluation harness; `--mode mock` default; `--mode live --budget-usd N` only manually (M6)           |
| `pnpm openapi`                                             | writes `backend/openapi.json` and regenerates `packages/api-client`                                  |
| `pnpm fixtures:audio`                                      | regenerates mock audio fixtures (§8.4)                                                               |

## 5. Configuration and environments

All configuration is environment variables validated by a Zod schema in `backend/src/lib/env.ts` (and `frontend/src/env.ts`, `mobile/src/env.ts` for public values). Invalid configuration fails at startup. `.env.example` lists every variable with a comment; real values live only in `.env.local` (never committed) and in the deployment's secret store (SEC-03). Agents never ask for secret values in chat.

| Variable                                                               | Used by           | Notes                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                                                              | all               | `local`, `ci`, `production`                                                                                                                                                     |
| `PROVIDER_MODE`                                                        | backend           | `mock` (default) or `live`. `production` refuses `mock` unless `ALLOW_MOCK_IN_PRODUCTION=true` (portfolio demo). `local`/`ci` refuse `live` unless `ALLOW_LIVE_PROVIDERS=true`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`                                    | all               | public                                                                                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`                                            | backend           | secret, backend only (SEC-01)                                                                                                                                                   |
| `SUPABASE_JWT_ISSUER`                                                  | backend           | JWT verification via JWKS                                                                                                                                                       |
| `REDIS_URL`                                                            | backend           | `redis://localhost:6379` locally                                                                                                                                                |
| `API_PORT`                                                             | backend           | default `4000`                                                                                                                                                                  |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_DEV_HOST`                          | mobile            | §5.1                                                                                                                                                                            |
| `GEMINI_API_KEY`                                                       | backend live      | M6                                                                                                                                                                              |
| `ELEVENLABS_API_KEY`                                                   | backend live      | M6                                                                                                                                                                              |
| `LLM_PROVIDER`, `LLM_API_KEY`                                          | backend live      | Q-03, M6                                                                                                                                                                        |
| `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENV`                | backend           | `sandbox` until launch                                                                                                                                                          |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`                                      | frontend          | sandbox token                                                                                                                                                                   |
| `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_KEY`                     | backend           |                                                                                                                                                                                 |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | mobile            | Test Store key until M7                                                                                                                                                         |
| `RESEND_API_KEY`                                                       | backend           | absent locally → SMTP to Mailpit                                                                                                                                                |
| `EXPO_ACCESS_TOKEN`                                                    | backend           | push sending                                                                                                                                                                    |
| `SENTRY_DSN`, `POSTHOG_KEY`, `POSTHOG_HOST`                            | all               | optional locally                                                                                                                                                                |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`               | backend, frontend | Cloudflare test keys locally                                                                                                                                                    |
| `GLOBAL_DAILY_COST_CAP_USD`                                            | backend           | default `0` in mock mode is ignored; enforced in live mode                                                                                                                      |
| `MOCK_LATENCY_MS`, `MOCK_FAILURE_RATE`                                 | backend mock      | defaults `3000`, `0`                                                                                                                                                            |

Environments:

| Env        | When     | Database                       | Redis                       | Providers                                                             | Payments                                                                      | Where it runs                                       |
| ---------- | -------- | ------------------------------ | --------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| local      | M0–M6    | Supabase CLI (Docker)          | Docker `redis:7`            | mock (M0–M5), live with low caps and `ALLOW_LIVE_PROVIDERS=true` (M6) | Paddle sandbox through a tunnel, or simulated webhooks; RevenueCat Test Store | developer machine                                   |
| ci         | every PR | Supabase CLI in GitHub Actions | `redis:7` service container | mock                                                                  | simulated webhooks                                                            | GitHub Actions                                      |
| production | M7       | Supabase cloud project (EU)    | Redis on the rented server  | live                                                                  | sandbox for the portfolio edition (D-03), live after legal review             | rented server (API, worker, Redis) + web host (§22) |

There is no shared staging environment before M7 (PRD D-14). Everything is developed and tested locally; deployment happens once, in order, from `docs/DEPLOYMENT.md` (written in T-50).

### 5.1 Local full stack (web, iOS and Android at the same time)

`pnpm dev:all` starts everything the owner needs to try the whole product on one machine:

| Process                                                       | URL / target                                                    | Notes                                                                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Supabase (Postgres, Auth, Storage, Realtime, Studio, Mailpit) | API `http://localhost:54321`, Studio `:54323`, Mailpit `:54324` | `supabase start` (Docker)                                                                                                      |
| Redis                                                         | `localhost:6379`                                                | `docker compose -f docker/compose.yml up redis`                                                                                |
| API                                                           | `http://localhost:4000`                                         | `backend/src/server.ts`, watch mode                                                                                            |
| Worker                                                        | —                                                               | `backend/src/worker.ts`, watch mode; Bull Board at `http://localhost:4000/v1/admin/queues`                                     |
| Web                                                           | `http://localhost:3000`                                         | Next.js dev server                                                                                                             |
| Expo                                                          | Metro `:8081`                                                   | opens the development build on the iOS Simulator and the Android Emulator together (`expo start --dev-client --ios --android`) |

Rules that make this work:

- The API base URL and Supabase URL are resolved per platform at runtime in `mobile/src/env.ts`: iOS Simulator `localhost`, Android Emulator `10.0.2.2`, physical devices the machine's LAN IP from `EXPO_PUBLIC_DEV_HOST`. Supabase Auth redirect URLs include all three.
- Development builds are made once per native change with `pnpm mobile:build:ios` (`expo run:ios`) and `pnpm mobile:build:android` (`expo run:android`); both are free and need no developer account for simulators.
- Webhooks that must reach localhost (Paddle sandbox, RevenueCat) go through a free tunnel (`cloudflared tunnel --url http://localhost:4000`) when testing real sandbox events; otherwise `pnpm paddle:simulate` and `pnpm revenuecat:simulate` post signed fixtures.
- `pnpm dev:check` verifies prerequisites (Docker running, ports free, Xcode and Android SDK present, `.env.local` complete for mock mode) and prints what is missing.
- `docs/runbooks/local-dev.md` (T-10) is the step-by-step guide, including first-time simulator setup.

## 6. Database

### 6.1 Conventions

- Schema `public` for tables clients may read under RLS; schema `app` for internal tables and all functions; schema `restricted` for moderation evidence (FR-54), readable only by `service_role`.
- Primary keys `uuid` (`gen_random_uuid()`), except where a random public token is needed (separate column, SEC-14).
- `created_at timestamptz not null default now()`, `updated_at` maintained by trigger.
- Money: integer minor units (`bigint`). Credits: integer (`bigint`). Provider cost: integer micro-USD (`bigint`), never floats.
- Every function: `security definer set search_path = app, public, pg_temp`; `revoke execute on all functions in schema app from public;` in every migration that defines functions; grant only to `service_role`.
- `anon` and `authenticated` get `select` on listed tables with RLS policies; no `insert`/`update`/`delete` grants on any table (TD-03). DB-01 asserts this from the catalogue.
- Never edit an applied migration; add a new numbered file.

### 6.2 Tables

Columns listed are the essential ones; the migration adds indexes and checks as noted.

**Identity and settings**

| Table           | Key columns                                                                                                                                                                                                                                        | RLS read                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `profiles`      | `id` (= auth user id), `handle` (unique, citext), `display_name`, `bio`, `avatar_seed`, `locale`, `is_adult`, `adult_verified_at`, `remix_default` bool, `status` (`active`, `cooldown`, `suspended`, `banned`, `deleted`), `explicit_hidden` bool | own row; public subset through view `public_profiles` |
| `user_settings` | `user_id`, notification prefs (jsonb, validated), `marketing_email_opt_in`, `analytics_consent`                                                                                                                                                    | own                                                   |
| `consents`      | `user_id`, `kind` (`terms`, `privacy`, `ai_disclosure`, `marketing`, `analytics`), `version`, `granted` bool, `at`, `source`                                                                                                                       | own                                                   |
| `devices`       | `user_id`, `platform`, `expo_push_token`, `attestation_status`, `last_seen_at`                                                                                                                                                                     | none                                                  |
| `staff_roles`   | `user_id`, `role` (`moderator`, `admin`)                                                                                                                                                                                                           | none                                                  |

**Catalogue and routing (FR-24–FR-30)**

| Table             | Key columns                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models`          | `id` text (`mock-music-a`, `lyria-3.5`…), `kind` (`music`, `text`, `image`, `alignment`), `adapter` text, `adapter_version`, `display_name`, `enabled`, `quality_rank` int, `is_mock` bool, `capabilities` jsonb (validated against `CapabilitiesSchema`) |
| `model_prices`    | `model_id`, `operation`, `credits` int, `est_cost_micro_usd` bigint; PK (`model_id`, `operation`)                                                                                                                                                         |
| `model_languages` | `model_id`, `language` (BCP 47), `status` (`unverified`, `beta`, `verified`), `eval_run_id`, `verified_at`                                                                                                                                                |
| `provider_health` | `provider`, `breaker_state` (`closed`, `open`, `half_open`), `opened_at`, `failure_count`, `window_started_at`                                                                                                                                            |

Readable by everyone (catalogue is public), except `provider_health` (backend only; exposed through the catalogue endpoint as `available` bool).

**Songs and media**

| Table             | Key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | RLS read                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `songs`           | `id`, `owner_id`, `title`, `lyrics` text, `sections` jsonb, `language`, `style` jsonb, `instrumental`, `model_id`, `model_version`, `duration_ms`, `visibility` (`private`, `unlisted`, `public`), `share_token` (unique, 22-char base64url, SEC-14), `explicit` bool, `remix_allowed` bool, `parent_song_id`, `parent_kind` (`extend`, `remix`), `moderation_decision_id`, `credit_cost`, `status` (`pending`, `ready`, `failed`, `hidden`, `removed`, `deleted`), `deleted_at`, `search` tsvector (generated, Turkish + simple config, INF-16) | owner: all; others: `visibility='public' and status='ready'` minus blocked users |
| `song_assets`     | `song_id`, `kind` (`audio_mp3`, `audio_wav`, `stems_zip`, `stem`, `cover`, `video`, `public_mp3`, `public_cover`), `label` (stem name), `bucket`, `path`, `bytes`, `sha256`, `expires_at`                                                                                                                                                                                                                                                                                                                                                        | via song                                                                         |
| `song_timings`    | `song_id`, `granularity` (`word`, `line`), `source` (`model`, `alignment`, `mock`), `timings` jsonb                                                                                                                                                                                                                                                                                                                                                                                                                                              | via song                                                                         |
| `generation_jobs` | `id`, `user_id`, `operation` (`lyrics`, `rewrite`, `generate`, `extend`, `remix`, `stems`, `cover`, `video`, `align`), `status` (`queued`, `moderating`, `running`, `finishing`, `ready`, `failed`, `refunded`, `cancelled`), `stage_detail`, `song_id`, `model_id`, `route_reason` jsonb, `reservation_id`, `idempotency_key` (unique per user), `error_code`, `attempts`, `steps` jsonb (step results, §9.2), `heartbeat_at`, `correlation_id`, timestamps                                                                                     | own (Realtime enabled)                                                           |
| `provider_calls`  | `job_id`, `user_id`, `provider`, `model_id`, `operation`, `est_cost_micro_usd`, `actual_cost_micro_usd`, `status`, `latency_ms`, `provider_request_id`                                                                                                                                                                                                                                                                                                                                                                                           | none (FR-90)                                                                     |

**Library and community**

| Table                         | Key columns                                                                                                                                                                                               | RLS read                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `playlists`, `playlist_items` | `position` numeric for reordering                                                                                                                                                                         | own                                                  |
| `favourites`                  | `user_id`, `song_id`                                                                                                                                                                                      | own                                                  |
| `likes`                       | `user_id`, `song_id`                                                                                                                                                                                      | counts via `song_stats`                              |
| `song_stats`                  | `song_id`, `likes`, `plays`, `trending_score`, `updated_at`                                                                                                                                               | public for public songs                              |
| `play_events`                 | `song_id`, `listener_key` (hash of user id or anonymous device id), `hour_bucket`; unique (`song_id`, `listener_key`, `hour_bucket`) (FR-63)                                                              | none                                                 |
| `follows`, `blocks`           |                                                                                                                                                                                                           | own                                                  |
| `gifts`                       | `id`, `song_id`, `sender_id`, `token` (unique, SEC-14), `recipient_name`, `message`, `occasion`, `opens_at`, `revoked_at`, `details` jsonb (memories; deleted 30 days after the song is generated, FR-44) | own; public read only through `GET /v1/gifts/:token` |
| `notifications`               | `user_id`, `kind`, `payload` jsonb, `read_at`                                                                                                                                                             | own (Realtime)                                       |

**Moderation (FR-50–FR-58, FR-66–FR-68)**

| Table                            | Key columns                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `moderation_decisions`           | `id`, `user_id`, `surface` (`description`, `lyrics`, `style`, `rewrite_instruction`, `cover_instruction`, `gift`, `title`, `profile`, `output_lyrics`, `output_image`, `output_transcript`), `input_sha256`, `policy_version`, `layers` jsonb (each layer's result), `category`, `severity`, `action` (`allow`, `allow_explicit`, `block`, `hard_block`), `classifier_model`, `latency_ms` |
| `restricted.moderation_evidence` | `decision_id`, `text`, `expires_at` (90 days; hard-block evidence kept per CMP-03 procedure)                                                                                                                                                                                                                                                                                               |
| `reports`                        | `reporter_id` (nullable for anonymous web reports, rate limited by IP), `target_kind`, `target_id`, `reason`, `note`, `status`, `priority`                                                                                                                                                                                                                                                 |
| `moderation_cases`               | `id`, `kind` (`report`, `hard_block`, `flag`, `appeal`), `subject_user_id`, `target`, `priority`, `status`, `assigned_to`                                                                                                                                                                                                                                                                  |
| `moderation_actions`             | `case_id`, `actor_id`, `action`, `reason_code`, `reason_text`, `notice_sent_at`                                                                                                                                                                                                                                                                                                            |
| `appeals`                        | `action_id`, `user_id`, `text`, `decided_by`, `outcome`                                                                                                                                                                                                                                                                                                                                    |

**Credits and payments (§7, §16)**: `credit_accounts`, `credit_ledger`, `credit_reservations`, `purchases`, `payment_events`, `topup_settings`, `credit_packs`.

**Operations**: `flags` (`key`, `value` jsonb, `updated_by`, `updated_at`), `cost_counters` (`scope` = `user:<id>` / `provider:<name>` / `global`, `day`, `micro_usd`), `rate_limits` (`key`, `window_start`, `count`), `audit_log` (`actor_id`, `action`, `target`, `diff` jsonb, `at`), `data_requests` (`user_id`, `kind` `export`/`delete`, `status`, `artifact_path`, `due_at`).

### 6.3 RLS model

- Default deny on every table. DB-02 fails if a table in `public` has RLS disabled.
- Owner policies: `using (owner_id = auth.uid())` (or `user_id`).
- Public song policy: `visibility = 'public' and status = 'ready' and not exists (block where blocker = auth.uid() and blocked = owner_id)`.
- Unlisted songs and gifts are never readable by RLS from other users; they are served by backend endpoints that check the token (SEC-14), so tokens cannot be enumerated through PostgREST filters.
- Staff never use RLS bypass from a client; admin screens call backend endpoints that check `staff_roles` and MFA (SEC-10).

### 6.4 Realtime

`generation_jobs` and `notifications` are in the `supabase_realtime` publication. Clients subscribe with a filter `user_id=eq.<uid>`; RLS applies to Postgres Changes. If Realtime is unavailable, clients poll `GET /v1/jobs/:id` every 3 s (A-08).

## 7. Credit ledger (FR-70–FR-80, NFR-07, SEC-05)

### 7.1 Model

- `credit_accounts(user_id pk, balance bigint, held bigint, updated_at)`. `balance` = sum of ledger amounts; `held` = sum of active reservations. Both are maintained inside the same transaction as the ledger insert, under `select … for update` on the account row.
- `credit_ledger(id, user_id, kind, amount, balance_after, ref_kind, ref_id, idempotency_key unique, expires_at, created_at)`. `kind` ∈ `signup_grant`, `daily_grant`, `purchase`, `spend`, `refund`, `reversal`, `expiry`, `adjustment`. Append-only: a trigger rejects `update` and `delete`.
- `credit_reservations(id, user_id, job_id, amount, status` `active`/`settled`/`released`/`expired`, `expires_at)`. A reservation does not write the ledger; settling writes one `spend` row.
- Available to spend = `balance - held`. Must be ≥ 0 for any reservation. `balance` may be negative only after a `reversal` (FR-78); then reservations fail with `INSUFFICIENT_CREDITS`.
- Promotional credits with expiry: each grant row may carry `expires_at`. A nightly function writes `expiry` rows for the unspent part, consuming spends oldest-expiring-first (FIFO lots tracked in `credit_lots(ledger_id, remaining)`). Purchased credits have no `expires_at` (FR-80).

### 7.2 Functions (schema `app`, callable by `service_role` only)

| Function                                                                                                           | Behaviour                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.grant_credits(user_id, amount, kind, ref_kind, ref_id, idem_key, expires_at default null) returns ledger row` | `amount > 0`. Idempotent on `idem_key`: a second call returns the first row.                                                                                                                                                                                                        |
| `app.reserve_credits(user_id, job_id, amount, idem_key, ttl interval default '30 min') returns reservation`        | Locks account; checks status not suspended; checks available ≥ amount, else raises `SS001 INSUFFICIENT_CREDITS`; inserts reservation; `held += amount`. Idempotent on `idem_key`.                                                                                                   |
| `app.start_job(user_id, operation, model_id, amount, idem_key) returns job`                                        | One transaction: checks the user's non-final music jobs against the concurrency flag (`CONCURRENCY_LIMIT`), calls `reserve_credits`, inserts the `generation_jobs` row. The API enqueues the BullMQ job after commit; the sweeper covers a crash between commit and enqueue (§9.4). |
| `app.settle_reservation(reservation_id, final_amount)`                                                             | `final_amount ≤ amount`. Writes `spend` of `-final_amount`, `held -= amount`, status `settled`. Calling twice is a no-op. Triggers auto top-up check (§16.3) by inserting an outbox event.                                                                                          |
| `app.release_reservation(reservation_id, reason)`                                                                  | `held -= amount`, status `released`. No-op if not active.                                                                                                                                                                                                                           |
| `app.refund_spend(ledger_id, reason, idem_key)`                                                                    | Writes `refund` of the spent amount (FR-10 when failure is detected after settle).                                                                                                                                                                                                  |
| `app.reverse_purchase(purchase_id, idem_key)`                                                                      | Writes `reversal` of the purchase's credits; may make balance negative (FR-78).                                                                                                                                                                                                     |
| `app.adjust_credits(user_id, amount, actor_id, reason, idem_key)`                                                  | Admin adjustment; writes `audit_log`.                                                                                                                                                                                                                                               |
| `app.expire_reservations()`                                                                                        | Releases reservations past `expires_at` whose job is not running (cron every 5 min).                                                                                                                                                                                                |
| `app.reconcile_credits() returns setof discrepancy`                                                                | Nightly: compares `balance` to `sum(ledger)`, `held` to active reservations, purchases to `purchase` rows. Any row → Sentry alert and admin notification.                                                                                                                           |

Job lifecycle: the API reserves before sending the job event. The job settles on success and releases on any failure that is not the user's fault (FR-10). A job that dies without either is released by `expire_reservations` and flagged in the admin console.

### 7.3 Tests

- DB-10..DB-18 (pgTAP): each function's happy path, idempotency, insufficient funds, double settle, release after settle, append-only trigger, negative balance only via reversal, expiry FIFO.
- IT-01 (integration): 50 concurrent `reserve_credits` for a user with credits for 10 → exactly 10 succeed; `balance - held` never negative.
- IT-02: duplicate Paddle and RevenueCat webhooks (same event ID, concurrently) grant once.
- IT-03: reconciliation finds an injected discrepancy.

## 8. Model layer (FR-24–FR-30, INF-06)

### 8.1 Adapter interfaces (`backend/src/providers/types.ts`)

```ts
type Operation =
  | 'generate'
  | 'instrumental'
  | 'custom_lyrics'
  | 'extend'
  | 'stems'
  | 'image_input';

interface MusicCapabilities {
  operations: Operation[];
  maxDurationSec: number;
  minDurationSec: number;
  outputFormats: ('mp3' | 'wav')[];
  controls: { bpm: boolean; lengthControl: boolean; vocalType: boolean };
  returnsTimestamps: 'none' | 'line' | 'word';
  returnsLyrics: boolean; // model may improvise words (FR-52 transcript check)
  acceptsExternalAudio: boolean; // for cross-model extend and stems (S-2, S-3)
  stemSets: string[]; // e.g. ['two_stems', 'six_stems']
  watermark: ('synthid' | 'c2pa' | 'none')[];
}

interface ProviderContext {
  jobId: string;
  userId: string;
  correlationId: string;
  signal: AbortSignal;
}

type StartResult<T> =
  | {
      kind: 'done';
      output: T;
      costMicroUsd: number | null;
      providerRequestId?: string;
    }
  | {
      kind: 'pending';
      taskId: string;
      pollAfterMs: number;
      providerRequestId?: string;
    };

interface MusicAdapter {
  readonly id: string; // matches models.adapter
  capabilities(): MusicCapabilities;
  estimateCostMicroUsd(op: Operation, req: MusicRequest): number;
  generate(
    req: GenerateRequest,
    ctx: ProviderContext,
  ): Promise<StartResult<AudioOutput>>;
  extend?(
    req: ExtendRequest,
    ctx: ProviderContext,
  ): Promise<StartResult<AudioOutput>>;
  stems?(
    req: StemsRequest,
    ctx: ProviderContext,
  ): Promise<StartResult<StemsOutput>>;
  poll?(
    taskId: string,
    ctx: ProviderContext,
  ): Promise<StartResult<AudioOutput | StemsOutput>>;
}

interface TextAdapter {
  // lyricist and classifier
  readonly id: string;
  completeJson<T>(
    req: {
      system: string;
      user: string;
      schema: z.ZodType<T>;
      maxTokens: number;
    },
    ctx: ProviderContext,
  ): Promise<{ value: T; costMicroUsd: number | null }>;
}
interface ImageAdapter {
  readonly id: string;
  cover(
    req: CoverRequest,
    ctx: ProviderContext,
  ): Promise<{ png: Uint8Array; costMicroUsd: number | null }>;
}
interface ImageSafetyAdapter {
  readonly id: string;
  check(
    png: Uint8Array,
    ctx: ProviderContext,
  ): Promise<{ safe: boolean; categories: string[] }>;
}
interface AlignmentAdapter {
  readonly id: string;
  align(
    audio: AudioRef,
    lyrics: string,
    language: string,
    ctx: ProviderContext,
  ): Promise<Timings>;
}
```

`AudioOutput` is `{ bytes: Uint8Array | AsyncIterable<Uint8Array>; format: 'mp3' | 'wav'; durationMs; timestamps?; lyrics? }`. Adapters throw only `ProviderError { code: 'rate_limited' | 'timeout' | 'unavailable' | 'rejected_by_provider_policy' | 'invalid_request' | 'unknown', retryable: boolean, retryAfterMs? }`.

### 8.2 Registry and catalogue

- `backend/src/models/registry.ts` maps `adapter` ids to factories. In `mock` mode it registers only `providers/mock/*`; in `live` mode it registers live adapters and, only outside production, mocks too.
- A model is **usable** when: catalogue row `enabled`, adapter registered, capabilities in the row equal `adapter.capabilities()` (checked at startup; mismatch disables the model and logs an error), breaker not open, and kill switches allow it.
- The catalogue is cached in memory for 30 s per function instance (flags too), so admin changes take effect within one minute (FR-93).
- `GET /v1/catalogue` returns usable models with capabilities, prices and language statuses; clients build style controls from it (FR-05, G-3).

### 8.3 Router (`packages/domain/src/router.ts`, pure)

```ts
route(input: {
  operation: Operation; language: string | null; instrumental: boolean;
  sourceModelId?: string;            // for extend and stems
  requestedModelId?: string;         // FR-28 manual choice
  models: CatalogueModel[];          // usable models with health
  allowBetaLanguages: boolean;
}): { ok: true; modelId: string; reason: RouteReason } | { ok: false; error: RouteError; perModel: Record<string, string> }
```

Steps (FR-27):

1. Filter by capability (`operation`; `custom_lyrics` unless instrumental).
2. Filter by language: `verified`, or `beta` if `allowBetaLanguages`; skip for instrumental.
3. For `extend`/`stems` with `sourceModelId`: keep the source model if eligible (R-08); otherwise keep models with `acceptsExternalAudio` (Q-02, warning flag in reason).
4. If `requestedModelId` is given and eligible, return it; if not eligible, return `MODEL_NOT_ELIGIBLE` with the reason for that model.
5. Sort by `quality_rank` desc, then credit price asc, then id. Return first.

`perModel` holds the human reason per excluded model (`"cannot_extend"`, `"language_unverified"`, `"unavailable"`), used by the Advanced picker (FR-28). UT-20..UT-29 cover each branch with table tests.

Fallback (FR-29): only in jobs, only when the user chose Auto, only to a model with price ≤ the reserved price; the job records both models.

### 8.4 Mock providers (INF-18)

Mocks are first-class: the whole product, CI and E2E run on them. They imitate the **documented shapes** of the real models so routing and UI behave as they will in M6 (R-11).

| Catalogue row       | Imitates                  | Capabilities                                                                                                                                            |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mock-music-a`      | Lyria 3.5                 | generate, instrumental, custom_lyrics, image_input; max 180 s; mp3+wav; no extend, no stems; returnsTimestamps `none`; watermark synthid; sync (`done`) |
| `mock-music-b`      | ElevenLabs Music          | generate, instrumental, custom_lyrics, extend, stems (two, six); max 300 s; mp3; acceptsExternalAudio; async (`pending` → poll)                         |
| `mock-text`         | lyricist / classifier LLM | JSON output                                                                                                                                             |
| `mock-image`        | cover model               | 1024×1024 PNG                                                                                                                                           |
| `mock-image-safety` | image classifier          |                                                                                                                                                         |
| `mock-align`        | alignment API             | line + word timings                                                                                                                                     |

Language seed for mocks: `mock-music-a` → `en` verified, `tr` unverified; `mock-music-b` → `en`, `tr` verified. This exercises "Turkish routes to B" and the disabled-reason UI before real data exists. M6 replaces these rows with real results.

Behaviour:

- **Audio**: `pnpm fixtures:audio` synthesises short royalty-free WAV clips (chord progressions with a click track, in pure TypeScript, no samples) at 4 tempos and writes MP3 with `@breezystack/lamejs` or ffmpeg if present. Fixtures are committed (< 3 MB total). Output length is the requested length, made by looping. Stems are derived by filtering (low-pass "bass", band "other", etc.) so files are distinct.
- **Lyrics (`mock-text` as lyricist)**: deterministic template per language and occasion that uses the description's keywords and gift names; always valid section tags (lets E2E assert NFR-13 plumbing).
- **Classifier (`mock-text` as classifier)**: rule-based on the golden set's _markers_. Every golden-set row has an expected category; the mock classifier recognises a reserved marker `⟦mock:category⟧` embedded in test inputs, and otherwise returns `allow` with low confidence. It never pretends to understand language; real quality is measured only in M6 (R-12).
- **Cover**: deterministic gradient PNG from a hash of the title, with the title set in the image (via `@resvg/resvg-js` from an SVG).
- **Alignment**: spreads lines evenly over the duration, words evenly within lines.
- **Latency and failures**: `MOCK_LATENCY_MS` with ±30 % jitter; `MOCK_FAILURE_RATE`; plus deterministic triggers recognised in mock mode only, in the description or lyrics: `⟦mock:fail:timeout⟧`, `⟦mock:fail:rate_limited⟧`, `⟦mock:fail:provider_policy⟧`, `⟦mock:slow⟧`. E2E tests use these to cover FR-10 and FR-29.
- **Cost**: mocks report realistic estimated costs from the seed so cost caps and dashboards are exercised.

### 8.5 Circuit breakers (INF-06)

Per provider, stored in `provider_health`: open after 5 failures of retryable kinds within 60 s or 3 consecutive timeouts; half-open after 120 s, letting one job through; closed on success. Updated by job steps through `app.record_provider_result(provider, ok, kind)`. The router treats open as unavailable.

### 8.6 Contract tests

`backend/src/providers/__contract__/music.contract.ts` runs the same suite against any `MusicAdapter`: declared capabilities match behaviour (unsupported op throws `invalid_request`), durations within limits, output formats, poll protocol, error mapping. Runs against mocks in CI (IT-10); against live adapters only with `--mode live` in M6 (EV-04).

## 9. Jobs (INF-02, FR-09)

### 9.1 Runtime: BullMQ on Redis (TD-02)

- **Processes.** The backend has two entry points built from the same code: `backend/src/server.ts` (Express API) and `backend/src/worker.ts` (BullMQ workers and job schedulers). Locally both run under `pnpm dev`; in production each runs as its own container on the rented server (§22). The API only enqueues; it never processes jobs.
- **Redis.** Redis 7 in Docker (`docker/compose.yml`, service `redis`) with `appendonly yes`, `appendfsync everysec` and `maxmemory-policy noeviction` (BullMQ requires no eviction). Connection from `REDIS_URL`. Redis holds queue state only; the source of truth for every job is `generation_jobs` in Postgres, so a Redis loss loses no money or songs: the sweeper re-enqueues any non-final job that has no live BullMQ job (§9.4).
- **Queues** (`backend/src/jobs/queues.ts`):

| Queue                                                                           | Concurrency (per worker process) | Limiter                                                             | Jobs                             |
| ------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| `music:<provider>` (one per music provider, e.g. `music:mock-a`, `music:lyria`) | from flags, default 4            | `{ max, duration }` from flags, set from provider rate limits (S-6) | generate, extend, remix, stems   |
| `media`                                                                         | 4                                | —                                                                   | cover, align, ID3/rendition work |
| `video`                                                                         | 1 (CPU heavy)                    | —                                                                   | lyric video render               |
| `account`                                                                       | 2                                | —                                                                   | export, delete, top-up check     |
| `maintenance`                                                                   | 1                                | —                                                                   | scheduled jobs (§9.3)            |

- **Per-user concurrency (FR-91)** is enforced before enqueue, in the same transaction that reserves credits: `app.start_job()` counts the user's non-final music jobs and refuses with `CONCURRENCY_LIMIT` above the flag value (default 2). BullMQ's open-source edition has no per-group limits, and the database check is authoritative anyway.
- **Enqueue** goes through `enqueue(queue, name, data, { jobId })` in `backend/src/jobs/enqueue.ts`. `jobId` is always the `generation_jobs.id`, so a duplicate enqueue is ignored by BullMQ. Job data carries only IDs and the correlation ID, never lyrics or personal data (SEC-11).
- **Retries.** `attempts: 5`, exponential backoff with jitter starting at 5 s. A `ProviderError` with `retryable: false` throws `UnrecoverableError` so BullMQ does not retry. `removeOnComplete: { age: 86400 }`, `removeOnFail: { age: 7 * 86400 }`.
- **Admin view.** Bull Board (`@bull-board/express`) mounted at `/v1/admin/queues` behind the staff + MFA guard (SEC-10).

### 9.2 Step model (durable multi-step jobs)

BullMQ retries a whole job, not a step, so each processor is written as a resumable state machine:

```ts
// backend/src/jobs/steps.ts
type StepName =
  | 'route'
  | 'provider_start'
  | 'provider_poll'
  | 'store_audio'
  | 'tag'
  | 'output_check'
  | 'timings'
  | 'cover'
  | 'settle'
  | 'notify';

async function runSteps(job: Job<JobData>, steps: Step[]) {
  const state = await loadJobState(job.data.jobId); // generation_jobs.steps jsonb
  for (const step of steps) {
    if (state.done[step.name]) continue; // completed in an earlier attempt
    const result = await step.run(state, ctx); // must be idempotent
    if (result.kind === 'wait') {
      // provider still working
      await job.moveToDelayed(Date.now() + result.ms, job.token);
      throw new DelayedError(); // BullMQ re-runs the job later
    }
    await saveStepResult(job.data.jobId, step.name, result.value); // persisted before next step
  }
}
```

Rules:

- Step results (provider task ID, storage paths, timings, reservation outcome) are persisted in `generation_jobs.steps` before the next step starts. A retried job skips finished steps.
- Every step is idempotent on its own: storage paths are deterministic (`songs/<songId>/<kind>.<ext>`); ledger calls carry `job:<jobId>:settle` keys; provider starts carry the job ID as the provider's idempotency key where the provider supports one, and otherwise the saved task ID prevents a second start.
- Polling providers (`StartResult.kind = 'pending'`) use `moveToDelayed` + `DelayedError`, so no worker slot is held while a provider works.
- A heartbeat column `generation_jobs.heartbeat_at` is updated at each step; the sweeper uses it.

### 9.3 Processors and schedules

| Queue / name                                                           | Processor                               | Steps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `music:*` / `generate`                                                 | `generateSong`                          | load job → mark `running` → `route` (re-check eligibility) → provider start → poll until done → store audio (private bucket, MP3, WAV if lossless) → write ID3 tags (CMP-09) → output check: transcript moderation if `returnsLyrics` → timings from model, or enqueue `media/align` → enqueue `media/cover` → settle reservation → mark `ready` → notify. On non-user failure (final attempt or unrecoverable): release reservation (or refund after settle), mark `failed`/`refunded`, notify. |
| `music:*` / `extend`                                                   | `extendSong`                            | as generate, with source audio and new section; creates a new song linked by `parent_song_id`.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `music:*` / `remix`                                                    | `generateSong` with `parent_kind=remix` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `music:*` / `stems`                                                    | `separateStems`                         | provider stems → store each stem + ZIP (expires 7 days, INF-19) → settle → notify.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `media` / `cover`                                                      | `makeCover`                             | moderation of cover prompt → image → image safety → store → set cover. Included in the song price on first generation; regenerations are a separate paid job.                                                                                                                                                                                                                                                                                                                                    |
| `media` / `align`                                                      | `alignLyrics`                           | alignment adapter → `song_timings`. Free (internal).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `video` / `render`                                                     | `renderVideo`                           | Remotion render inside the worker (§12.3) → store MP4 with metadata kept → settle → notify.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `account` / `topup-check`                                              | `autoTopup`                             | §16.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `account` / `export`                                                   | `exportData`                            | build ZIP → store → e-mail link (FR-89).                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `account` / `delete`                                                   | `deleteAccount`                         | §19.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maintenance` / `nightly` (job scheduler, `0 3 * * *` Europe/Istanbul) | `nightly`                               | reconcile credits, expire promo credits, purge expired assets and evidence, purge gift details.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `maintenance` / `sweeper` (every 5 min)                                | `sweeper`                               | §9.4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `maintenance` / `trending` (every 15 min)                              | `trending`                              | §18.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Schedules are registered with `queue.upsertJobScheduler()` at worker start, so restarts do not duplicate them.

Lyric writing and section rewrites are synchronous in the API (fast, < 30 s) and are not jobs (TD-10).

Every processor writes `stage_detail` updates to `generation_jobs`, which reach clients through Supabase Realtime (`queued → generating → finishing → ready`).

### 9.4 Sweeper and recovery

Every 5 minutes:

1. `app.expire_reservations()`.
2. Jobs in a non-final state whose `heartbeat_at` is older than 15 minutes and whose BullMQ job is missing or failed → re-enqueue with the same `jobId` (the step model resumes them) up to 2 times, then mark failed and release or refund.
3. Jobs in `queued` with no BullMQ job (for example after a Redis loss) → re-enqueue.

IT-08 covers each branch, including a Redis `FLUSHALL` in the middle of a mock generation.

### 9.5 Idempotency at the API

`Idempotency-Key` header required on every `POST` that costs credits; stored as `generation_jobs.idempotency_key` (unique per user); a replay returns the original job.

## 10. Moderation (FR-50–FR-58, PRD §9)

### 10.1 Pipeline (`backend/src/moderation/pipeline.ts`)

```
moderate({ surface, text, userId, language }) → Decision
  1. normalise (packages/moderation-rules: NFKC, Turkish case fold, zero-width strip,
     leetspeak map, whitespace collapse, homoglyph map for Latin/Cyrillic/Greek)
  2. deterministic layer → hard_block | block | pass   (term lists, artist-voice patterns,
     age-plus-sexual co-occurrence rules in TR and EN)
  3. if pass: classifier (TextAdapter) with policy prompt vN → { category, severity, evidence, confidence }
     - hard-block categories with confidence < 0.8 → treated as hard_block, case queued for review
  4. combine → action ∈ allow | allow_explicit | block | hard_block
  5. persist decision (+ evidence for review categories) and return
```

- Combined inputs are moderated as one text per request (description + lyrics + style free text), with surface tags, so context across fields is seen.
- The deterministic layer is real from M0 (it is free); term lists live in `packages/moderation-rules/lists/` as hashed entries for the hard-block lists (so the repo does not publish them in plain text) and plain entries for the rest.
- Policy prompts live in `backend/src/moderation/policy/v<N>.md`; `POLICY_VERSION` constant; changing either requires an eval run (EV-01) in the same PR (CI enforces: the eval workflow is required when these paths change).
- User text is passed as data in a delimited block; the classifier's output is parsed with a strict Zod schema; parse failure → retry once → treat as `block` with `classifier_error` (fail closed) (SEC-08).

### 10.2 Hard-block handling (FR-55, CMP-03)

In one transaction: decision stored with evidence (retention per the child-safety runbook, not the 90-day default), `moderation_cases` row priority `critical`, profile status → `suspended` for generation, admin e-mail alert. The user sees a neutral message (copy in `packages/i18n`). `docs/runbooks/child-safety.md` holds the procedure (written in M5, reviewed by counsel in M7).

### 10.3 Friction (FR-56)

`app.record_block(user_id)` counts blocks in 24 h; at 3 → `cooldown` for 1 h (flag-configurable); at N (flag, default 6) → `suspended` pending review.

### 10.4 Golden set and harness (FR-57, NFR-12, INF-15)

- `eval/moderation/golden.jsonl`: `{ id, lang, surface, text, expected_action, expected_category, tags }`. At least 40 rows per block category per language, 150 allowed rows including profanity and mature themes (TR, EN), and evasion variants.
- **Content rule for the golden set**: hard-block rows are written as _requests that describe the prohibited intent_ (for example, a request for romantic lyrics about a named 13-year-old), never as explicit sexual text. Rows are reviewed by the owner before merge.
- Each row also carries its `⟦mock:category⟧` twin for the mock classifier, so CI tests plumbing and the deterministic layer on every PR (EV-01 mock). The real classifier runs with `--mode live --budget-usd` in M6 and on every policy change after that.
- Report: per-category recall and precision, false-block rate on allowed rows, list of misses; written to `eval/reports/` and summarised in the PR.

## 11. Lyricist (FR-02–FR-04, FR-41, NFR-13)

- `POST /v1/lyrics/write` → moderation of inputs → reserve → `TextAdapter.completeJson` with `LyricsSchema { title, language, sections: [{ tag, lines[] }], suggestedStyle }` → output moderation → settle → return. Synchronous with a 30 s timeout; on timeout, release and return `PROVIDER_TIMEOUT`.
- Prompts versioned in `backend/src/lyricist/prompts/` (create, rewrite-section, gift-<occasion>).
- Validation after the model: section tags from the allowed set, detected language equals requested (a cheap detector, `franc-min` or similar), gift names present (NFR-13). On failure, one repair attempt with the validation error appended; second failure → error and release.
- Section parsing and serialisation (`[Verse]` blocks ⇄ `sections` JSON) lives in `packages/domain/src/lyrics.ts` and is shared with the editors. "Add missing tags" (FR-04) is a pure function there that proposes tags; the client shows a diff and the user accepts.

## 12. Media (FR-17–FR-21, FR-36, INF-04, INF-05, INF-07, SEC-02)

### 12.1 Buckets

| Bucket          | Public    | Contents                                                                                                                          |
| --------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `private-media` | no        | `songs/<songId>/audio.mp3`, `audio.wav`, `stems/*.mp3`, `stems.zip`, `cover.png`, `video.mp4`; `exports/<userId>/<requestId>.zip` |
| `public-media`  | yes (CDN) | `p/<renditionId>/audio.mp3`, `cover.webp`, `og.png` — only for `public` and `unlisted` songs                                      |

- `renditionId` is random (SEC-14), not the song ID. Making a song public or unlisted copies the MP3 and cover into a new rendition; making it private or deleting it deletes the rendition and rotates `renditionId` (so old URLs stop working). Cache headers `public, max-age=31536000, immutable`.
- Private files are served through `GET /v1/songs/:id/assets/:kind` returning a signed URL valid for 10 minutes (downloads, owner playback, offline sync).

### 12.2 File processing

- MP3 tagging with `node-id3` (title, artist = display name, comment "AI-generated with <model>", TXXX `ai_generated=true`, `model`). WAV gets a LIST/INFO chunk. Provider watermarks are inside the audio and preserved because we never re-encode provider audio except to produce a missing MP3 (A-09).
- WAV is stored only when the provider returned lossless audio (FR-36).

### 12.3 Lyric video (FR-19)

- `remotion/` holds the composition: 1080×1920, cover blurred background + sharp cover, current line large, next line dim, title, "Made with AI" mark, progress bar. Input props: audio URL, cover URL, timings, title, locale.
- `renderVideo` runs `@remotion/renderer` inside the worker on the `video` queue (concurrency 1). Locally it uses the developer's machine; in production the same container runs on the rented server, so no separate cloud renderer is needed. The server needs enough CPU and RAM for one render at a time (sized in T-50). CI renders a 5-second clip as a smoke test.
- Licence: Remotion is free for individuals and small companies; check the current terms before M7 (A-07).

### 12.4 Alignment (FR-20, INF-05)

`AlignmentAdapter`, mock in M0–M5. Candidate for M6: ElevenLabs Forced Alignment (same vendor as music B) if S-5 confirms Turkish (A-10). Line timings are derived from word timings when needed.

## 13. API

### 13.1 Conventions

- Base path `/v1`, JSON, OpenAPI 3.1 generated from Zod route definitions; clients use the generated client only.
- Express middleware order: raw-body parser on `/v1/webhooks/*` only (signature checks need the exact bytes, SEC-04) → `express.json({ limit: '256kb' })` elsewhere → request ID + correlation ID (`x-correlation-id` accepted from clients, else generated) → security headers → CORS (allow-list: web origins; mobile has no origin) → auth (Supabase JWT via JWKS; `auth.optional` or `auth.required`) → profile status check → rate limit → handler → 404 → error middleware (maps `AppError`, `ZodError` and unknown errors to the error shape below; never leaks stack traces). `app.disable('x-powered-by')`; `trust proxy` set to the reverse proxy hop count so rate limits see the client IP.
- Errors: `{ error: { code, message, details? } }` with codes from `packages/schemas/src/errors.ts` (for example `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_ADULT`, `VALIDATION`, `MODERATION_BLOCKED`, `MODERATION_HARD_BLOCKED`, `INSUFFICIENT_CREDITS`, `MODEL_NOT_ELIGIBLE`, `RATE_LIMITED`, `CONCURRENCY_LIMIT`, `CAP_REACHED`, `KILL_SWITCH`, `PROVIDER_TIMEOUT`, `NOT_FOUND`, `CONFLICT`). Each code has a status, a TR and EN message in `packages/i18n`, and a test.
- Pagination: cursor-based (`?cursor=&limit=`).
- Rate limits: `app.rate_limit_hit(key, window_seconds, max)` fixed-window in Postgres (TD-05); limits in flags.

### 13.2 Endpoints

| Area                 | Endpoints                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meta                 | `GET /v1/health`, `GET /v1/catalogue`, `GET /v1/flags/public`                                                                                                                                                                                                     |
| Me                   | `GET /v1/me`, `PATCH /v1/me`, `POST /v1/me/age` (age gate), `POST /v1/me/consents`, `PUT /v1/me/settings`, `POST /v1/me/devices`, `POST /v1/me/export`, `POST /v1/me/delete`, `GET /v1/me/notifications`, `POST /v1/me/notifications/read`                        |
| Moderation pre-check | `POST /v1/moderation/check` (free; used before enabling Generate, FR-07; result cached by input hash for 10 min so Generate does not pay twice)                                                                                                                   |
| Lyrics               | `POST /v1/lyrics/write`, `POST /v1/lyrics/rewrite-section`                                                                                                                                                                                                        |
| Songs                | `POST /v1/songs` (generate), `GET /v1/songs/:id`, `PATCH /v1/songs/:id` (title, visibility, remix flag), `DELETE /v1/songs/:id`, `POST /v1/songs/:id/extend`, `/remix`, `/stems`, `/cover`, `/video`, `GET /v1/songs/:id/assets/:kind`, `GET /v1/songs/search?q=` |
| Jobs                 | `GET /v1/jobs/:id`, `POST /v1/jobs/:id/cancel` (only while `queued`)                                                                                                                                                                                              |
| Library              | playlists CRUD and reorder, `PUT/DELETE /v1/favourites/:songId`                                                                                                                                                                                                   |
| Community            | `GET /v1/explore?feed=new\|trending\|genre&genre=`, `GET /v1/u/:handle`, `PUT/DELETE /v1/follows/:userId`, `PUT/DELETE /v1/blocks/:userId`, `PUT/DELETE /v1/likes/:songId`, `POST /v1/plays` (FR-63), `GET /v1/s/:shareToken` (unlisted/public song by token)     |
| Gifts                | `POST /v1/gifts/lyrics` (gift lyric writing), `POST /v1/gifts`, `PATCH /v1/gifts/:id` (message, opens_at, revoke), `GET /v1/gifts/:token` (public)                                                                                                                |
| Reports              | `POST /v1/reports` (auth optional; Turnstile on web when anonymous), `POST /v1/appeals`                                                                                                                                                                           |
| Credits              | `GET /v1/wallet`, `GET /v1/wallet/ledger`, `GET /v1/credit-packs`, `POST /v1/checkout/paddle` (creates transaction, returns ID for the overlay), `PUT /v1/topup-settings`                                                                                         |
| Webhooks             | `POST /v1/webhooks/paddle`, `POST /v1/webhooks/revenuecat`, `POST /v1/webhooks/providers/:provider` (music callbacks if a provider supports them)                                                                                                                 |
| Admin                | `/v1/admin/*`: users, ledger adjust, jobs, catalogue, flags and kill switches, costs, cases, actions, appeals, audit log — staff role + AAL2 (MFA) required                                                                                                       |
| Internal             | `/v1/admin/queues` (Bull Board, staff + MFA)                                                                                                                                                                                                                      |

## 14. Web client (`frontend/`)

- Route groups under `src/app/[locale]/`: `(marketing)` landing, `/how-it-works`, legal pages; `(app)` create, library, song, wallet, settings, notifications; `(public)` `/s/[token]`, `/g/[token]`, `/u/[handle]`, `/explore`; `(admin)` admin and moderation consoles.
- Locale prefix `tr` / `en`; default from `Accept-Language`; Turkish casing via `toLocaleUpperCase('tr')` helpers from `packages/i18n` (NFR-09).
- Share and gift pages are server-rendered with `generateMetadata` (Open Graph, `noindex` for gift and unlisted, FR-43, FR-61) and an OG image route (`/og/[renditionId]`).
- Player: a single `<audio>` element owned by a React context, mini player in the app layout, Media Session API for OS controls, keyboard shortcuts (NFR-08).
- Create flow state in a reducer persisted to `sessionStorage` (so switching modes and navigating keeps input, FR-01); lyrics editor with section blocks, undo stack, rewrite-section dialog.
- CSP with nonces via middleware (`proxy.ts` on Next 16; A-01) (SEC-09); Paddle and Turnstile origins allow-listed.
- `/how-it-works`: architecture diagram, router explanation, ledger explanation, moderation pipeline (G-7).

## 15. Mobile client (`mobile/`)

- Expo Router with tabs: Create, Library, Explore, Profile; stacks for song, player, wallet, settings.
- Development uses Expo development builds on the iOS Simulator and Android Emulator, which are free (no Apple Developer account needed for the simulator). Expo Go is not enough because track player and purchases are native modules.
- `ios/` and `android/` are generated with `expo prebuild` (Continuous Native Generation) and not committed (TD-07). Native config lives in `app.config.ts` and config plugins.
- Audio: `react-native-track-player` service for background playback, lock screen, remote events, audio focus (FR-33). If it is not compatible with the current Expo SDK at T-01, use `expo-audio` with its lock-screen support (A-02).
- Downloads: `expo-file-system` into the app's document directory; index in SQLite (`expo-sqlite`); synced against `GET /v1/me/downloads-validity` on launch to remove deleted or unavailable songs (FR-35).
- Push: `expo-notifications`. Android push works with a free Firebase project. iOS push needs APNs, which needs the Apple Developer Program, so it is verified in M7; until then in-app notifications cover iOS.
- Deep links: universal links and app links for `/s/*`, `/g/*`, `/u/*`; `apple-app-site-association` and `assetlinks.json` served by the web app (INF-17). Real-device verification in M7.
- Purchases: RevenueCat SDK; Test Store in M2–M6 (A-05). No auto top-up UI and no web links on mobile (FR-75, CMP-12).
- Sign in with Apple and Google via Supabase Auth (FR-85); Apple sign-in on device needs the developer account, so it is tested on device in M7, on simulator earlier where possible.
- Attestation (SEC-07): App Attest and Play Integrity in M7; until then, free grants are tied to verified e-mail only.
- Shared code: `packages/schemas`, `api-client`, `domain`, `moderation-rules`, `i18n`, `ui-tokens`. Metro configured for the pnpm monorepo (`watchFolders`, `nodeModulesPaths`).

## 16. Payments

### 16.1 Credit packs

`credit_packs(id, credits, price_minor, currency, paddle_price_id, apple_product_id, google_product_id, active)`. Prices are placeholders in the seed until Q-04 (M6).

### 16.2 Paddle (web)

- `POST /v1/checkout/paddle` creates a Paddle transaction with `custom_data { user_id, pack_id, purchase_id }`; the client opens the overlay with the transaction ID. Credits are granted only from the webhook `transaction.completed` (verified signature, SEC-04), idempotent on Paddle event ID in `payment_events` and on `purchase:<transaction_id>` for the ledger.
- `adjustment.created` (refund, chargeback) → `reverse_purchase`.
- Local development: either Paddle sandbox with a tunnel for webhooks, or `pnpm paddle:simulate <event>` which posts a signed fixture to the local webhook (signature made with the local secret).

### 16.3 Auto top-up and one-tap top-up (FR-74, S-4)

- `topup_settings(user_id, enabled, threshold, pack_id, monthly_cap_minor, paddle_customer_id, paddle_payment_method_id)`.
- After `settle_reservation`, an outbox row triggers `credits/topup.check`: if enabled, balance < threshold, < 3 top-ups today, monthly cap not exceeded → charge.
- **Path A (if S-4 passes):** server-side charge of the saved payment method for a one-time item, per Paddle's API.
- **Path B (fallback):** create a transaction for the customer with the saved method and send an in-app + e-mail prompt "Top up 500 credits for ₺X?"; one tap opens Paddle checkout with the saved method selected.
- Both paths share settings, limits and receipts; S-4 in M2 selects which is enabled (flag `topup_mode`). Result recorded as a PRD decision.

### 16.4 Mobile (RevenueCat)

- Consumable products per pack. RevenueCat webhook `NON_RENEWING_PURCHASE` → verify by fetching the customer from the RevenueCat REST API (SEC-04) → grant idempotent on `transaction_id`. `REFUND` → `reverse_purchase`.
- RevenueCat app user ID = Supabase user ID (set at login) so purchases attach to the account across devices (FR-70).
- Test Store (no store accounts) in M2–M6; App Store and Play sandbox in M7.

## 17. Notifications (FR-09, FR-88, INF-08)

- `notify(userId, kind, payload)` writes `notifications` (in-app, Realtime) and then, per user settings, push (Expo) and e-mail (Resend). Kinds: `song_ready`, `song_failed`, `stems_ready`, `video_ready`, `gift_opened`, `report_decision`, `moderation_notice`, `topup_receipt`, `topup_prompt`, `export_ready`, `account_deleted`.
- Templates in `packages/i18n` (push) and `backend/src/notify/emails/` (React Email, TR and EN).
- Transactional e-mails always; marketing only with opt-in, and in Turkey only after İYS registration (CMP-14; not built for v1 beyond the opt-in flag).

## 18. Community details

- **Trending score** (`packages/domain/src/trending.ts`): `(likes*3 + plays) / (age_hours + 2)^1.5`, recomputed every 15 minutes for songs published in the last 14 days (cron), stored in `song_stats.trending_score`.
- **Plays** (FR-63, NFR-15): client posts `POST /v1/plays` after 30 s or half the song with a signed play ticket issued at stream start (`GET` of the asset returns `playTicket`, HMAC of song + listener + time); insert into `play_events` with the unique hour bucket; counters updated by trigger. Rate limit per IP and per listener.
- **Explicit**: songs with `allow_explicit` decisions get `explicit=true`; Explore filters when `explicit_hidden`.
- **Remix of others** (FR-65): requires `visibility='public'` and `remix_allowed` on the source and on the owner's default; the new song stores `parent_song_id`; the song page shows "Remix of …".

## 19. Security and privacy implementation

### 19.1 Mapping

| PRD    | Implementation                                                                                                                               | Verified by                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| SEC-01 | RLS default deny; no client write grants; service key only in `backend` env                                                                  | DB-01, DB-02, `check:boundaries`, secret scan |
| SEC-02 | Bucket split and renditions (§12.1)                                                                                                          | IT-41, E2E-30                                 |
| SEC-03 | `.env.local` locally; on the server, env files readable only by the deploy user (or Docker secrets); web host secret store; rotation runbook | runbook                                       |
| SEC-04 | Paddle signature (`Paddle-Signature` HMAC), RevenueCat auth header + REST re-fetch; `payment_events` unique event ID                         | IT-02, IT-03                                  |
| SEC-05 | §7 functions only                                                                                                                            | DB-10..DB-18, IT-01                           |
| SEC-06 | `rate_limit_hit` on listed routes                                                                                                            | IT-30                                         |
| SEC-07 | Turnstile on web sign-up, anonymous report, checkout; attestation M7                                                                         | E2E with Turnstile test keys                  |
| SEC-08 | delimited data blocks, versioned prompts, Zod output parsing, fail closed                                                                    | UT-40.., EV-01                                |
| SEC-09 | nonce CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame-ancestors none                                     | E2E header check                              |
| SEC-10 | staff roles + Supabase MFA (AAL2) check on `/v1/admin/*` (including Bull Board); `audit_log`                                                 | IT-31                                         |
| SEC-11 | logger redacts fields by key list; lint rule forbids logging request bodies                                                                  | UT-05                                         |
| SEC-12 | GitHub secret scanning, `pnpm audit` gate (high), Dependabot, pinned lockfile, EAS update code signing (M7)                                  | CI                                            |
| SEC-13 | PITR on production (paid Supabase plan, M7); restore drill                                                                                   | runbook                                       |
| SEC-14 | `randomBytes(16)` base64url tokens                                                                                                           | UT-06                                         |

### 19.2 Auth details

- Supabase Auth: e-mail OTP (6 digits) rather than magic link, so it works inside mobile apps without link handling; Apple and Google OAuth.
- Age gate (FR-86): after first sign-in, `POST /v1/me/age` with date of birth; the backend computes adulthood, stores only `is_adult` + `adult_verified_at`, never the date; under 18 → account deleted immediately and the e-mail hash blocked for 30 days. All other `/v1` endpoints return `NOT_ADULT` until set.
- Consents (CMP-16): AI-disclosure consent is required before the first lyric or song request; stored with policy version.

### 19.3 Deletion and export (FR-89, FR-95)

- Delete: profile status → `deleted` immediately (sign-out everywhere, content hidden); job `deleteAccount` removes storage objects, songs, playlists, likes, follows, gifts, devices; anonymises `credit_ledger` and `purchases` user references by keeping them under a tombstone ID (legal retention); keeps hard-block moderation records per the runbook; deletes the auth user last; confirmation e-mail sent to the address captured before deletion. Completes within 30 days, target same day.
- Export: ZIP of JSON + audio files, link valid 7 days.

## 20. Observability and analytics

- Logger: JSON lines with `level, msg, correlationId, userId (uuid), jobId, route, latencyMs, errorCode`; redaction by key list (SEC-11).
- Sentry in all three apps with source maps; correlation ID as a tag; PII scrubbing on.
- PostHog EU: client events only after analytics consent (where required); server events for `song_generated`, `purchase_completed`, `credits_spent` keyed by user ID. Funnel in PRD INF-09.
- Admin cost dashboard from `provider_calls` and `cost_counters`.
- Alerts (e-mail to owner): reconciliation discrepancy, hard-block case, breaker open > 10 min, global cap 80 %.

## 21. Testing and CI

### 21.1 Layers

| Layer            | Tool                                                        | Runs                                                                  | Scope                                                |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| Unit (UT)        | Vitest                                                      | every PR                                                              | `packages/*`, backend pure modules, React components |
| Database (DB)    | pgTAP                                                       | every PR                                                              | RLS, grants, ledger, rate limit, friction, triggers  |
| Integration (IT) | Vitest + local Supabase + Redis + in-process worker + mocks | every PR                                                              | API routes, jobs end to end, webhooks, concurrency   |
| Contract         | Vitest                                                      | every PR (mocks), manual (live)                                       | §8.6                                                 |
| Web E2E          | Playwright                                                  | every PR                                                              | full flows on a production build with mocks          |
| Mobile E2E       | Maestro                                                     | nightly + before release                                              | create, play, library, purchase (Test Store)         |
| Evaluations (EV) | `eval/harness`                                              | mock: every PR touching moderation/lyricist; live: manual with budget | NFR-12, NFR-13, FR-26                                |

### 21.2 Playwright configuration

`frontend/playwright.config.ts` must contain: `expect: { timeout: 3000 }`, `timeout: 90_000`, and two projects:

- `parallel`: `fullyParallel: true`, workers 4; tests create their own users (unique e-mails `e2e+<uuid>@example.test`) and data.
- `isolated`: depends on `parallel`, one worker; tests tagged `@isolated` (flags, kill switches, catalogue, Explore ordering, global caps, sign-up rate limits); restore changed global state in `finally`.

No waits longer than 3 s for ordinary assertions. Waiting for a mock generation job is allowed up to 30 s with a comment (mock latency is set to 500 ms in E2E).

### 21.3 CI (`.github/workflows/ci.yml`)

Jobs: `static` (install, lint, typecheck, boundaries, unit, OpenAPI drift check) → `db` (Supabase CLI start, reset, pgTAP) → `integration` (with a `redis:7` service container) → `e2e-web` → `eval-mock`. All free on a public repository. `eval.yml` is `workflow_dispatch` only, needs live keys from repository secrets and a `budget_usd` input; never runs on PRs from forks.

## 22. Deployment (M7, one plan: PRD D-14)

Nothing is deployed before M7. T-50 writes `docs/DEPLOYMENT.md` and executes it in this order:

1. **Supabase cloud project** (EU region): apply migrations with `supabase db push`, configure Auth providers and redirect URLs, create buckets, enable PITR (Pro plan) and run a restore drill (SEC-13).
2. **Rented server** (a VPS with at least 4 vCPU and 8 GB RAM for video rendering; provider chosen by the owner, EU region preferred for KVKK/GDPR): Docker Compose with `api`, `worker`, `redis` (AOF volume, `noeviction`, password, bound to the internal network only) and `caddy` (TLS, `api.` domain, reverse proxy). Images built in GitHub Actions and pulled by tag. Firewall: only 80/443 and SSH (key only). Daily Redis AOF and env backups off the server.
3. **Web**: Next.js on Vercel (INF-01) by default; alternatively a `web` container on the same server behind Caddy if the owner prefers one host. Decided in T-50.
4. **Webhooks** pointed at `https://api.<domain>/v1/webhooks/*` (Paddle, RevenueCat).
5. **Mobile**: EAS Build profiles `development`, `preview`, `production`; EAS Update channels `preview`, `production`; production API URL baked into the `production` profile; store submission.
6. **Smoke test** against production with mocks enabled (`ALLOW_MOCK_IN_PRODUCTION=true`), then switch to live providers with low caps.

Database migrations in production are applied manually from the release checklist, never automatically.

## 23. Cost plan

| Phase                      | Services                                                                                                                                                                                             | Monthly cost                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| M0–M5 (local)              | Supabase CLI, Redis and Remotion on the developer machine; GitHub Actions (public repo); Expo development builds; Paddle sandbox; RevenueCat Free; optional free tiers of Sentry, PostHog and Resend | $0 (A-04)                                                                             |
| M6 (local, live providers) | + Gemini paid tier (Lyria, LLM), ElevenLabs paid plan, eval runs                                                                                                                                     | budget set by owner before M6; every live run uses `--budget-usd`; global caps active |
| M7 (deployment)            | + rented server (VPS), Supabase Pro (~$25/month) for PITR, Apple Developer Program (~$99/year), Google Play Console (~$25 once), domain; Vercel for the web                                          | owner approval per item                                                               |

The portfolio edition's monthly provider budget (NFR-17) is set at M6 from S-6 measurements and enforced by `GLOBAL_DAILY_COST_CAP_USD`.

## 24. Technical decisions

| ID    | Decision                                                                                                                                                                         | Why                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TD-01 | Backend is an Express 5 app in `backend/`, run as long-running Node processes (API and worker) on a rented server; Next.js is only the web app. Owner decision (PRD D-13, D-14). | One API for web and mobile clients; the owner's choice of framework. Express 5 forwards rejected promises from async handlers to the error middleware, so no wrapper is needed. Routes are declared through a small `defineRoute({ method, path, auth, request, response, handler })` helper that validates with Zod and registers the route in the OpenAPI registry, so the generated client stays in sync (CI drift check). |
| TD-02 | BullMQ on Redis for background jobs, with a resumable step model persisted in Postgres (§9.2). Owner decision (PRD D-14).                                                        | Open source, no vendor, runs fully locally and on the rented server; queue-level rate limits per provider; Bull Board for visibility. Postgres stays the source of truth so Redis loss is recoverable (§9.4).                                                                                                                                                                                                                 |
| TD-03 | Clients read through RLS, write only through the API.                                                                                                                            | One place for validation, moderation, rate limits and money; RLS stays simple (select only).                                                                                                                                                                                                                                                                                                                                  |
| TD-04 | Mock providers are catalogue rows with the shapes of the real models.                                                                                                            | Routing, UI and tests behave the same before and after M6 (D-12, R-11).                                                                                                                                                                                                                                                                                                                                                       |
| TD-05 | Rate limits in Postgres, not Redis.                                                                                                                                              | No extra vendor; volume is small; swappable behind `rateLimit()`.                                                                                                                                                                                                                                                                                                                                                             |
| TD-06 | RevenueCat for mobile purchases.                                                                                                                                                 | Receipt validation, refunds and webhooks for both stores; Test Store allows building purchases before store accounts exist.                                                                                                                                                                                                                                                                                                   |
| TD-07 | `mobile/ios` and `mobile/android` are generated, not committed.                                                                                                                  | Expo CNG keeps native config in `app.config.ts`; fewer merge conflicts. Folders still exist locally after `expo prebuild`, matching D-10.                                                                                                                                                                                                                                                                                     |
| TD-08 | Resend for e-mail; Mailpit locally.                                                                                                                                              | Free tier, React Email templates.                                                                                                                                                                                                                                                                                                                                                                                             |
| TD-09 | E-mail OTP instead of magic links.                                                                                                                                               | Works the same on web and in native apps.                                                                                                                                                                                                                                                                                                                                                                                     |
| TD-10 | Lyric writing is synchronous; music, stems, covers and videos are jobs.                                                                                                          | Lyrics take seconds and the editor needs them immediately.                                                                                                                                                                                                                                                                                                                                                                    |

## 25. Assumptions (verify at the named task; fallback if false)

| ID   | Assumption                                                                                                                                                   | Check at | Fallback                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| A-01 | Latest stable Next.js, Expo SDK, Express 5, BullMQ and Zod work together in a pnpm monorepo.                                                                 | T-01     | Pin the previous major of the conflicting package; record in README.                                                  |
| A-02 | `react-native-track-player` supports the current Expo SDK and New Architecture.                                                                              | T-24     | `expo-audio` with lock-screen controls.                                                                               |
| A-03 | Verified in T-08 IT-42 with BullMQ 6.7.4: `moveToDelayed` + `DelayedError` releases the concurrency-1 worker slot, waits twice and completes.                | T-08     | Re-enqueue a new job with `delay` and the same step state, under a new BullMQ job ID derived from the attempt number. |
| A-04 | Every service in the M0–M5 row of §23 has a free tier that allows this use.                                                                                  | T-01     | Replace the service or run it locally; no paid sign-up without owner approval.                                        |
| A-05 | RevenueCat Test Store supports consumables and webhooks without store accounts.                                                                              | T-28     | Mock purchase adapter on mobile that posts a signed fake webhook, local only.                                         |
| A-06 | Supabase Realtime Postgres Changes with RLS is enough for job status.                                                                                        | T-19     | Polling every 3 s.                                                                                                    |
| A-07 | Remotion licence allows this use for free, and one render fits the server size planned in T-50.                                                              | T-34, M6 | Render with ffmpeg directly (static background + drawtext lyric lines).                                               |
| A-08 | Realtime connection limits on the free tier are not hit in testing.                                                                                          | T-19     | Polling.                                                                                                              |
| A-09 | Provider watermarks survive storage and ID3 tagging (no re-encode).                                                                                          | M6 (S-6) | Document; add C2PA manifest ourselves for files we produce.                                                           |
| A-10 | An alignment API handles Turkish to ±300 ms.                                                                                                                 | M6 (S-5) | Line-level timings from section lengths; owner can nudge lines in an editor (Could).                                  |
| A-11 | Vercel Hobby terms allow the portfolio edition's web app.                                                                                                    | T-50     | Vercel Pro, or the web container on the rented server.                                                                |
| A-12 | Paddle sandbox is free and needs no business verification.                                                                                                   | T-26     | Simulated webhooks only until M7.                                                                                     |
| A-13 | The iOS Simulator and Android Emulator can run development builds side by side with the web app on the owner's Mac (memory, Xcode and Android SDK versions). | T-10     | Run one simulator at a time; document the minimum machine in `docs/runbooks/local-dev.md`.                            |

## 26. Traceability

| PRD area           | TRD sections               | Plan milestone                      |
| ------------------ | -------------------------- | ----------------------------------- |
| FR-01–FR-11        | §8, §9, §10, §11, §14, §15 | M1                                  |
| FR-15–FR-21        | §8, §9, §12                | M3                                  |
| FR-24–FR-30        | §8                         | M1 (mocks), M6 (live)               |
| FR-31–FR-36        | §12, §14, §15              | M1                                  |
| FR-40–FR-46        | §11, §13, §14              | M4                                  |
| FR-50–FR-58        | §10                        | M1 (pipeline), M6 (real classifier) |
| FR-60–FR-68        | §13, §18                   | M4                                  |
| FR-70–FR-80        | §7, §16                    | M2                                  |
| FR-85–FR-89, FR-95 | §19                        | M0 (auth, age), M5 (export, delete) |
| FR-90–FR-94        | §8.5, §9, §20              | M2                                  |
| NFR-01–NFR-18      | §14, §15, §20, §21         | M5 (pass), ongoing                  |
| SEC-01–SEC-14      | §19.1                      | M0–M5                               |
| CMP-01–CMP-18      | §19, docs/legal            | M5 (drafts), M7 (review)            |
| INF-01–INF-19      | §3–§9, §12, §20–§22        | M0                                  |
