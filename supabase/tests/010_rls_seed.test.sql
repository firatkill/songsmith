begin;
select no_plan();
-- Assert seed contents; idempotence is also verified by replaying seed.sql locally.
select is((select count(*) from public.models), 6::bigint, 'seed contains six models');
select is((select count(*) from public.model_prices), 9::bigint, 'seed contains nine prices');
select is((select count(*) from public.model_languages), 4::bigint, 'seed contains four language statuses');
select is((select count(*) from app.flags), 6::bigint, 'seed contains six documented flags');
select is((select count(*) from app.staff_roles), 1::bigint, 'seed contains one staff assignment');
select is((select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000004'), 1::bigint, 'seed contains one staff profile');
select ok((select capabilities @> '{"operations":["generate","instrumental","custom_lyrics","image_input"],"maxDurationSec":180,"outputFormats":["mp3","wav"],"returnsTimestamps":"none","watermark":["synthid"]}'::jsonb and jsonb_array_length(capabilities->'operations') = 4 from public.models where id = 'mock-music-a'), 'A capabilities match TRD 8.4');
select ok((select capabilities @> '{"operations":["generate","instrumental","custom_lyrics","extend","stems"],"maxDurationSec":300,"outputFormats":["mp3"],"acceptsExternalAudio":true,"stemSets":["two_stems","six_stems"]}'::jsonb and jsonb_array_length(capabilities->'operations') = 5 and jsonb_array_length(capabilities->'outputFormats') = 1 from public.models where id = 'mock-music-b'), 'B capabilities match TRD 8.4');
select is((select count(*) from public.models where kind = 'music' and not (capabilities ?& array['operations','maxDurationSec','minDurationSec','outputFormats','controls','returnsTimestamps','returnsLyrics','acceptsExternalAudio','stemSets','watermark'])), 0::bigint, 'both music mocks contain every MusicCapabilities field');
select is((select count(*) from public.models m cross join lateral jsonb_array_elements_text(m.capabilities->'operations') op where m.kind = 'music' and not exists (select 1 from public.model_prices p where p.model_id = m.id and p.operation = op)), 0::bigint, 'every supported music operation has a price');
select is((select count(*) from public.model_prices where credits <= 0 or est_cost_micro_usd <= 0), 0::bigint, 'placeholder prices exercise nonzero credit and cost accounting');
select * from finish();
rollback;
