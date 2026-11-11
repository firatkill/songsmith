# Jobs runtime (T-08)

Start Docker, then `pnpm db:start`. With `.env.local` configured, `pnpm dev`
checks Supabase, starts persistent Redis, builds shared packages, and runs API,
worker and web with prefixed output. By default, Next uses Turbopack and all
three processes use native watchers. It never starts or resets Supabase. Ctrl-C
stops all three Node process groups. Redis remains available; stop it with
`pnpm redis:down` (the named AOF volume is retained). Stop Supabase separately
with `pnpm db:stop`.

In restricted environments where native watchers fail with FSEvent/EMFILE errors,
run `SONGSMITH_DEV_POLLING=1 pnpm dev`. Only this opt-in enables Next Webpack
and one-second polling: Watchpack for web and Chokidar for API/worker. Leave it
unset on the owner's Mac to retain native watching and fast reloads.

Redis listens on localhost:6379. `REDIS_URL` defaults there for local/CI and is
required in production. API health and ordinary routes can run without Redis;
authorized Bull Board access initializes queue connections. `/v1/admin/queues`
requires a staff bearer JWT with MFA AAL2, including its assets and API routes.
Browser navigation authentication belongs to T-12; no cookie workaround exists.

Music queues are discovered from catalogue adapters at process startup.
Logical `music:<adapter>` names map to `music-<adapter>` because BullMQ forbids
colons in queue names. Restart after catalogue/concurrency/limiter configuration
changes; T-09 owns the general flags cache. Optional flags
`music_queue_limiter:<adapter>` contain positive integer `max` and `duration`
(milliseconds); no limiter is assumed before provider measurements.

The worker registers only sweeper and nightly processors. Later tasks register
queue/name processors through `ProcessorRegistry` and use `runSteps` with
`stepStore(service)`. Each step must be independently idempotent: a crash after
its side effect but before SQL persistence can rerun that step. Saved false and
null results count as completed. Polling returns `{kind: 'wait', ms}` and releases
the worker slot. Call `app.touch_job` for stage progress; existing Realtime RLS
exposes it only to the owner.

Sweeper runs every five minutes, recovers stale non-final missing/failed queue
jobs at most twice, then marks `PROVIDER_TIMEOUT`. Fresh queued missing jobs
are also re-enqueued. Routing/model selection must already be persisted by
T-19; unrouted and synchronous lyric rows are not dispatched. Credit expiry,
release and refund are deliberately deferred to T-17. Nightly (03:00 Istanbul)
is a logging placeholder. Scheduler upserts survive process restarts without
duplication. Redis loss also removes schedulers: restart the worker to restore
them, then the sweeper reconstructs eligible jobs from Postgres.

Run `pnpm redis:up && pnpm test:integration` with local Supabase running.
IT-08 deliberately executes Redis `FLUSHALL`; stop development workers and do
not share this Redis instance with another test run or application.
