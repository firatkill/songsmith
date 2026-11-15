import { clampDuration, serialiseLyrics } from '@songsmith/domain';
import type { paths } from '@songsmith/api-client';
import type { CatalogueModel } from '@songsmith/schemas';
import { moodSchema, tempoSchema, vocalTypeSchema } from '@songsmith/schemas';
import { apiSections, type Draft } from './state';

// Pure builders: the pre-check moderates exactly what POST /v1/songs will
// moderate (same parts, same order), so its cached decision is reused.
export type SongBody = NonNullable<
  paths['/v1/songs']['post']['requestBody']
>['content']['application/json'];
export interface ModerationPart {
  surface: 'title' | 'description' | 'lyrics' | 'style';
  text: string;
}
const sendsDescription = (draft: Draft) =>
  draft.mode === 'describe' || draft.instrumental;

export function styleControls(
  draft: Draft,
  model: CatalogueModel | undefined,
): SongBody['styleControls'] {
  const s = draft.style;
  const genre = s.genre === 'other' ? s.genreText.trim() : s.genre;
  const mood = moodSchema.safeParse(s.mood);
  const tempo = tempoSchema.safeParse(s.tempo);
  const vocal = vocalTypeSchema.safeParse(s.vocalType);
  const bpm = Number.parseInt(s.bpm, 10);
  const controls: NonNullable<SongBody['styleControls']> = {
    ...(genre ? { genre } : {}),
    ...(mood.success ? { mood: mood.data } : {}),
    ...(tempo.success ? { tempo: tempo.data } : {}),
    ...(model?.capabilities.controls.bpm && bpm >= 40 && bpm <= 220
      ? { bpm }
      : {}),
    ...(!draft.instrumental &&
    model?.capabilities.controls.vocalType &&
    vocal.success
      ? { vocalType: vocal.data }
      : {}),
  };
  return Object.keys(controls).length ? controls : undefined;
}
function freeStyle(draft: Draft, curated: ReadonlySet<string>) {
  const genre =
    draft.style.genre === 'other' ? draft.style.genreText.trim() : '';
  return [genre && !curated.has(genre) ? genre : '', draft.style.free.trim()]
    .filter(Boolean)
    .join('\n');
}
export function moderationParts(
  draft: Draft,
  curated: ReadonlySet<string>,
): ModerationPart[] {
  const parts: ModerationPart[] = [];
  if (draft.title.trim())
    parts.push({ surface: 'title', text: draft.title.trim() });
  if (sendsDescription(draft) && draft.description.trim())
    parts.push({ surface: 'description', text: draft.description.trim() });
  if (!draft.instrumental) {
    const lyrics = serialiseLyrics(apiSections(draft));
    if (lyrics) parts.push({ surface: 'lyrics', text: lyrics });
  }
  const style = freeStyle(draft, curated);
  if (style) parts.push({ surface: 'style', text: style });
  return parts;
}
export function songRequest(
  draft: Draft,
  model: CatalogueModel,
  manual: boolean,
): SongBody {
  const controls = styleControls(draft, model);
  return {
    title: draft.title.trim(),
    language: draft.language,
    instrumental: draft.instrumental,
    durationSec: clampDuration(model, draft.style.durationSec),
    ...(sendsDescription(draft) && draft.description.trim()
      ? { description: draft.description.trim() }
      : {}),
    ...(draft.instrumental ? {} : { sections: apiSections(draft) }),
    ...(draft.style.free.trim() ? { style: draft.style.free.trim() } : {}),
    ...(controls ? { styleControls: controls } : {}),
    ...(manual ? { modelId: model.id } : {}),
  };
}
