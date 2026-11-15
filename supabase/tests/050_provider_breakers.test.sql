begin;
select no_plan();
-- DB-11: circuit breaker thresholds and single-probe admission (TRD §8.5).
delete from app.provider_health where provider like 'db11-%';

-- Four retryable failures keep the breaker closed; the fifth within 60 s opens it.
select app.record_provider_result('db11-a', false, 'unavailable') from generate_series(1, 4);
select is((select breaker_state from app.provider_health where provider = 'db11-a'), 'closed', 'four failures stay closed');
select app.record_provider_result('db11-a', false, 'rate_limited');
select is((select breaker_state from app.provider_health where provider = 'db11-a'), 'open', 'five retryable failures in 60 s open');
select ok((select opened_at is not null from app.provider_health where provider = 'db11-a'), 'opened_at recorded');

-- Failures older than the 60 s window do not count.
select app.record_provider_result('db11-b', false, 'unavailable') from generate_series(1, 4);
update app.provider_health set failure_times = array(select t - interval '61 seconds' from unnest(failure_times) t) where provider = 'db11-b';
select app.record_provider_result('db11-b', false, 'unavailable');
select is((select breaker_state from app.provider_health where provider = 'db11-b'), 'closed', 'old failures leave the window');
select is((select failure_count from app.provider_health where provider = 'db11-b'), 1, 'only the recent failure counts');

-- Three consecutive timeouts open; any other result in between resets the run.
select app.record_provider_result('db11-c', false, 'timeout');
select app.record_provider_result('db11-c', false, 'timeout');
select app.record_provider_result('db11-c', false, 'invalid_request');
select app.record_provider_result('db11-c', false, 'timeout');
select is((select consecutive_timeouts from app.provider_health where provider = 'db11-c'), 1, 'non-timeout resets the timeout run');
select app.record_provider_result('db11-c', false, 'timeout');
select app.record_provider_result('db11-c', false, 'timeout');
select is((select breaker_state from app.provider_health where provider = 'db11-c'), 'open', 'three consecutive timeouts open');

-- Non-retryable failures never open the breaker.
select app.record_provider_result('db11-d', false, 'rejected_by_provider_policy') from generate_series(1, 10);
select app.record_provider_result('db11-d', false, 'invalid_request') from generate_series(1, 10);
select is((select breaker_state from app.provider_health where provider = 'db11-d'), 'closed', 'policy and bad requests do not open');

-- Open: no probe before 120 s; then exactly one claimant moves it to half-open.
select is(app.claim_provider_probe('db11-a'), false, 'no probe before 120 s');
update app.provider_health set opened_at = opened_at - interval '121 seconds' where provider = 'db11-a';
select is(app.claim_provider_probe('db11-a'), true, 'first claim after 120 s wins');
select is((select breaker_state from app.provider_health where provider = 'db11-a'), 'half_open', 'claim moves to half-open');
select is(app.claim_provider_probe('db11-a'), false, 'second claimant refused');

-- A non-retryable probe result keeps half-open; a retryable one reopens.
select app.record_provider_result('db11-a', false, 'invalid_request');
select is((select breaker_state from app.provider_health where provider = 'db11-a'), 'half_open', 'non-retryable probe result keeps half-open');
select app.record_provider_result('db11-a', false, 'unavailable');
select is((select breaker_state from app.provider_health where provider = 'db11-a'), 'open', 'failed probe reopens');
select ok((select opened_at > clock_timestamp() - interval '5 seconds' from app.provider_health where provider = 'db11-a'), 'reopen restarts the 120 s wait');

-- A probe that never reports can be re-claimed after 120 s.
update app.provider_health set opened_at = opened_at - interval '121 seconds' where provider = 'db11-a';
select is(app.claim_provider_probe('db11-a'), true, 'probe claimed');
select is(app.claim_provider_probe('db11-a'), false, 'held while the probe runs');
update app.provider_health set half_open_at = half_open_at - interval '121 seconds' where provider = 'db11-a';
select is(app.claim_provider_probe('db11-a'), true, 'stale probe can be replaced');

-- Success closes and clears counters.
select app.record_provider_result('db11-a', true, null);
select results_eq(
  $$select breaker_state, failure_count, consecutive_timeouts, opened_at is null from app.provider_health where provider = 'db11-a'$$,
  $$values ('closed'::text, 0, 0, true)$$,
  'success closes and resets');
select is(app.claim_provider_probe('db11-a'), true, 'closed providers always admit');

-- Input validation and grants.
select throws_ok($$select app.record_provider_result('bad provider', false, 'timeout')$$, '22023', 'invalid provider result', 'provider id validated');
select throws_ok($$select app.record_provider_result('db11-e', false, 'nonsense')$$, '22023', 'invalid provider result', 'kind validated');
select ok(not has_function_privilege('anon', 'app.record_provider_result(text, boolean, text)', 'execute'), 'anon cannot record results');
select ok(not has_function_privilege('authenticated', 'app.claim_provider_probe(text)', 'execute'), 'authenticated cannot claim probes');
select ok(has_function_privilege('service_role', 'app.claim_provider_probe(text)', 'execute'), 'service role can claim probes');

select * from finish();
rollback;
