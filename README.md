# Songsmith

Songsmith is an AI songwriting and song-generation app for adults on web, iOS and Android. Users describe a song or bring their own lyrics, edit with an AI lyricist, and generate music through a moderated, provider-agnostic model layer. Songs can be extended, remixed, downloaded, shared or given as gifts, with a shared credit balance across platforms. The portfolio edition uses sandbox payments and capped generation.

Status: in development

## Stack

Resolved from npm's stable `latest` tags on 2026-11-10. T-01 installs development tooling only; application packages are empty TypeScript modules.

| Tool              | Pinned version | Notes                                                                                 |
| ----------------- | -------------- | ------------------------------------------------------------------------------------- |
| Node.js           | 24 (`.nvmrc`)  | Validated locally on 24.10.0; root engine range is >=22. Use Node 24 for all tooling. |
| pnpm              | 10.18.3        | Exact `packageManager` version; normal pnpm store.                                    |
| TypeScript        | 6.0.3          | Compatibility fallback from stable 7.0.2; see below.                                  |
| Turborepo         | 2.11.10        | Workspace tasks and local caching.                                                    |
| Vitest            | 5.1.0          | Root `test.projects` workspace configuration.                                         |
| ESLint            | 10.14.0        | Flat config.                                                                          |
| typescript-eslint | 8.72.2         | `strictTypeChecked`.                                                                  |
| Prettier          | 3.9.10         | Shared formatting config.                                                             |
| @eslint/js        | 10.0.1         | JavaScript config/script linting.                                                     |
| @types/node       | 24.19.2        | Types for the selected Node major.                                                    |

| Later-task target | Stable major | Version observed (not installed) |
| ----------------- | ------------ | -------------------------------- |
| Next.js           | 16           | 16.4.6                           |
| Express           | 5            | 5.3.0                            |
| BullMQ            | 6            | 6.7.3                            |
| Expo SDK          | 58           | 58.0.23                          |
| Zod               | 4            | 4.6.7                            |
| Supabase CLI      | 3            | 3.1.0                            |

A-01: typescript-eslint 8.72.2 declares TypeScript `>=4.8.4 <6.1.0`, so TypeScript 7.0.2 is unsupported. We pin the previous stable major, 6.0.3 (PRD D-15), following the [supported versions](https://typescript-eslint.io/users/dependency-versions/). Node 24.10.0 meets the installed tools' engine requirements; some Node 22 releases allowed by the root's broad range do not (ESLint requires at least 22.13 on that line). Registry peer/engine checks found no direct conflict among the six later-task targets, but their runtime integration is not tested in T-01. Expo's React Native/React versions must be chosen together in T-10; see the [Expo monorepo guide](https://docs.expo.dev/guides/monorepos/).

A-04: all M0–M5 services have a free path for the planned individual, local/mock use, subject to the documented quotas and licence eligibility. See the dated [free-tier check](docs/runbooks/free-tier-check.md). Vercel eligibility (A-11) stays in T-50.

## Local checks

Use Node 24 and pnpm 10.18.3:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm format` formats the repository through Turborepo. Root formatting and lint tasks cover tooling files as well as the 12 workspaces. Vitest's root projects configuration selects each workspace by name; empty packages explicitly allow no tests, while the domain package requires its smoke test to run. Commands belonging to future tasks print their task ID and exit 1 (for example, `pnpm dev` reports T-08).

Requirements, technical design, task order and progress are in [docs/](docs/).
