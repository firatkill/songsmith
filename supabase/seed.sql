-- Local-only, idempotent fixtures. Never apply this seed to production.
-- Prices are placeholders for exercising cost accounting; measured prices arrive in M6.
insert into public.models (id, kind, adapter, adapter_version, display_name, enabled, quality_rank, is_mock, capabilities) values
('mock-music-a', 'music', 'mock-music-a', '1', 'mock-music-a', true, 20, true, '{"minDurationSec": 1, "outputFormats": ["mp3", "wav"], "controls": {"bpm": false, "lengthControl": false, "vocalType": false}, "returnsTimestamps": "none", "returnsLyrics": false, "acceptsExternalAudio": false, "stemSets": [], "watermark": ["synthid"], "operations": ["generate", "instrumental", "custom_lyrics", "image_input"], "maxDurationSec": 180}'::jsonb),
('mock-music-b', 'music', 'mock-music-b', '1', 'mock-music-b', true, 10, true, '{"minDurationSec": 1, "outputFormats": ["mp3"], "controls": {"bpm": false, "lengthControl": false, "vocalType": false}, "returnsTimestamps": "none", "returnsLyrics": false, "acceptsExternalAudio": true, "stemSets": ["two_stems", "six_stems"], "watermark": ["none"], "operations": ["generate", "instrumental", "custom_lyrics", "extend", "stems"], "maxDurationSec": 300}'::jsonb),
('mock-text', 'text', 'mock-text', '1', 'mock-text', true, 0, true, '{}'::jsonb),
('mock-image', 'image', 'mock-image', '1', 'mock-image', true, 0, true, '{}'::jsonb),
('mock-image-safety', 'image', 'mock-image-safety', '1', 'mock-image-safety', true, 0, true, '{}'::jsonb),
('mock-align', 'alignment', 'mock-align', '1', 'mock-align', true, 0, true, '{}'::jsonb)
on conflict (id) do update set kind = excluded.kind, adapter = excluded.adapter, adapter_version = excluded.adapter_version, display_name = excluded.display_name, enabled = excluded.enabled, quality_rank = excluded.quality_rank, is_mock = excluded.is_mock, capabilities = excluded.capabilities;

insert into public.model_languages (model_id, language, status, verified_at) values
('mock-music-a', 'en', 'verified', '2026-11-11T00:00:00Z'),
('mock-music-a', 'tr', 'unverified', null),
('mock-music-b', 'en', 'verified', '2026-11-11T00:00:00Z'),
('mock-music-b', 'tr', 'verified', '2026-11-11T00:00:00Z')
on conflict (model_id, language) do update set status = excluded.status, verified_at = excluded.verified_at;

insert into public.model_prices (model_id, operation, credits, est_cost_micro_usd) values
('mock-music-a', 'generate', 10, 100000),
('mock-music-a', 'instrumental', 10, 100000),
('mock-music-a', 'custom_lyrics', 10, 100000),
('mock-music-a', 'image_input', 10, 100000),
('mock-music-b', 'generate', 10, 100000),
('mock-music-b', 'instrumental', 10, 100000),
('mock-music-b', 'custom_lyrics', 10, 100000),
('mock-music-b', 'extend', 10, 100000),
('mock-music-b', 'stems', 20, 200000)
on conflict (model_id, operation) do update set credits = excluded.credits, est_cost_micro_usd = excluded.est_cost_micro_usd;

-- TRD §9.1 lines 539, 545; §10.3 line 655. Keys are the T-04 naming decision.
insert into app.flags (key, value) values
('music_queue_concurrency', '4'),
('per_user_concurrency', '2'),
('block_window_seconds', '86400'),
('block_cooldown_threshold', '3'),
('block_cooldown_seconds', '3600'),
('block_suspend_threshold', '6')
on conflict (key) do update set value = excluded.value;

-- Fixed local identity: passwordless email OTP through Mailpit; no password/secret.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, confirmation_token, recovery_token, email_change_token_new,
  email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'staff@example.test', '2026-11-11T00:00:00Z',
  '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.profiles (id, handle, display_name, is_adult, adult_verified_at, status)
values ('00000000-0000-4000-8000-000000000004', 'local-staff', 'Local staff', true, '2026-11-11T00:00:00Z', 'active')
on conflict (id) do update set is_adult = true, adult_verified_at = excluded.adult_verified_at, status = 'active';
insert into app.staff_roles (user_id, role)
values ('00000000-0000-4000-8000-000000000004', 'admin')
on conflict (user_id, role) do nothing;
