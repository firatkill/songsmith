# Web skeleton local guide

## Run locally

Use Node 24, pnpm 10.18.3 and Docker. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm db:start
```

Run this environment block in **each of two terminals** at the repository root.
It reads local credentials into the process environment without printing or saving them:

```sh
set -a
source <(pnpm exec supabase status -o env)
set +a
export SUPABASE_URL="$API_URL"
export SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export NEXT_PUBLIC_API_URL=http://localhost:4000
export APP_ENV=local
export PROVIDER_MODE=mock
```

Terminal 1:

```sh
pnpm --filter @songsmith/backend... --filter '@songsmith/frontend^...' build
pnpm --filter @songsmith/backend dev
```

Terminal 2:

```sh
pnpm --filter @songsmith/frontend dev
```

Open <http://localhost:3000/en> or <http://localhost:3000/tr>. API: <http://localhost:4000/v1/health>. Read the six-digit code in Mailpit at <http://localhost:54324> after entering a fresh test email. Use a fictional adult date to review consent/home. Use a separate fresh test email for underage refusal: the backend deletes that identity and blocks its email hash for 30 days.

For production review, stop the dev server, then in terminal 2 run `pnpm --filter @songsmith/frontend build && pnpm --filter @songsmith/frontend start` with the same exported environment. Public variables must be set at **build time** as well as runtime; Turbo includes them in the build cache key. Do not run dev and production builds concurrently. Alternatively store only the three public variables in ignored `frontend/.env.local`; backend secrets belong only in the ignored root `.env.local` or backend process environment. Empty variables are not defaults.

Stop both servers with Ctrl-C, then `pnpm db:stop`.

## Route map

All routes have `en` and `tr` prefixes. `/` chooses the explicit locale cookie first, then weighted Accept-Language, then English. Switching language preserves the current path, query and fragment and stores the explicit choice.

| Group     | Routes                                                                               | Behavior                                                             |
| --------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| marketing | `/[locale]`                                                                          | Product pitch and sign-in CTA                                        |
| marketing | `/[locale]/how-it-works`                                                             | Localized coming-soon placeholder                                    |
| auth      | `/[locale]/sign-in`                                                                  | Email OTP, six-digit/paste input, resend cooldown, errors            |
| auth      | `/[locale]/age-gate`                                                                 | Localized day/month/year fields; transient DOB submitted only to API |
| auth      | `/[locale]/consent`                                                                  | Three required and two optional versioned consents                   |
| auth      | `/[locale]/refused`                                                                  | Neutral refusal after local sign-out                                 |
| app       | `/[locale]/home`                                                                     | Welcome with backend profile handle                                  |
| app       | `/[locale]/create`, `/library`, `/explore`, `/wallet`, `/settings`, `/notifications` | Protected coming-soon placeholders                                   |

No create flow, player, actual library/wallet/settings, admin, legal content, OAuth buttons or Turnstile is included.

## Sessions, redirects and CSP

Supabase SSR owns cookie sessions. The proxy calls `auth.getClaims()` to refresh tokens and forwards updated cookies to both the request and response. Server pages read the cookie access token, but authorization comes from the backend's verified `GET /v1/me`, never from trusting cookie contents alone. The layout and each protected page guard against stale navigation: no session → sign-in; `needsAgeGate` → age gate; any `missingConsents` → consent; otherwise home/app. Server reads use no-store and React request-local deduplication. API requests use the generated client, bearer token and current Accept-Language; typed catalogue codes select local translations. Supabase clients expose only `.auth` to web application code.

Every matched request gets a fresh nonce. The proxy supplies the CSP on the forwarded request (so Next can nonce its scripts) and response. Pages are dynamic; responses are private/no-store. Scripts allow self, nonce and strict-dynamic; objects/base URI/frames are forbidden; connect-src lists only self, configured API/Supabase HTTP origins and their websocket forms. Token styles carry the nonce. HSTS is enabled for production, alongside nosniff, strict-origin-when-cross-origin and disabled camera/microphone/geolocation permissions.

Development adds **only** script `unsafe-eval` for Next/React debugging, style `unsafe-inline` for injected development styles, and `ws://localhost:3000` / `ws://127.0.0.1:3000` for HMR. Production scripts never allow unsafe-inline or unsafe-eval. No third-party script origins are included. The web server validates public environment at dev/start; dependency-only/static builds can run without credentials.

Light/dark colors come solely from `@songsmith/ui-tokens`; system dark preference applies unless `data-theme="light"` or `data-theme="dark"` overrides it. The Pop studio theme uses flat colours, outlined controls, visible focus, a skip link, landmarks and mobile navigation. Required and optional consents are grouped separately. Date fields follow Turkish day/month/year or English month/day/year order and validate a real, non-future date before sending ISO YYYY-MM-DD to the API.

Zod is configured with `jitless: true` by the validation entry before shared or local schemas are evaluated, on both server and client. This prevents its dynamic-code capability probe from generating CSP violation reports. Import application schemas and Zod through `src/lib/validation.ts`.

Bricolage Grotesque (500/800) and Inter (400/500) load through `next/font/google` with `latin` and `latin-ext` subsets. A clean production build needs network access to download the fonts; browsers then fetch only the self-hosted files from the app. No Google origins are needed in the CSP. Font families, sizes, weights, radii, border widths and hard shadow dimensions are shared with the native theme in `@songsmith/ui-tokens`.
