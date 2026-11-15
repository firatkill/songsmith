import type {
  CatalogueModel,
  RouterReasonCode,
  StyleControls,
} from '@songsmith/schemas';
import { route } from './router.js';

// Shared by the web (T-20) and mobile (T-23) create flows.
export interface ModelOption {
  id: string;
  displayName: string;
  price: number | undefined;
  eligible: boolean;
  reason?: RouterReasonCode;
}
export interface ModelChoice {
  autoModelId: string | undefined;
  options: ModelOption[];
}
// POST /v1/songs always routes the `generate` operation (custom lyrics and
// instrumental are capabilities on top of it), so the price is `generate`.
export function modelChoice(input: {
  models: CatalogueModel[];
  language: string;
  instrumental: boolean;
}): ModelChoice {
  const auto = route({
    operation: 'generate',
    language: input.instrumental ? null : input.language,
    instrumental: input.instrumental,
    models: input.models,
    allowBetaLanguages: false,
  });
  const perModel = auto.ok ? undefined : auto.perModel;
  const options = input.models.map((model): ModelOption => {
    const single = route({
      operation: 'generate',
      language: input.instrumental ? null : input.language,
      instrumental: input.instrumental,
      models: input.models,
      allowBetaLanguages: false,
      requestedModelId: model.id,
    });
    const reason = single.ok
      ? undefined
      : (single.perModel[model.id] ?? perModel?.[model.id]);
    return {
      id: model.id,
      displayName: model.displayName,
      price: model.prices.generate,
      eligible: single.ok,
      ...(reason ? { reason } : {}),
    };
  });
  return { autoModelId: auto.ok ? auto.modelId : undefined, options };
}
// Target length within the model's limits and the API's 30..300 s.
export function durationRange(model: CatalogueModel | undefined) {
  const min = Math.max(30, model?.capabilities.minDurationSec ?? 30);
  const max = Math.min(300, model?.capabilities.maxDurationSec ?? 300);
  return { min, max: Math.max(min, max) };
}
export function clampDuration(model: CatalogueModel | undefined, sec: number) {
  const { min, max } = durationRange(model);
  return Math.min(max, Math.max(min, Math.round(sec)));
}
const GENRE_LABELS: Record<string, string> = {
  hiphop: 'hip-hop',
  rnb: 'R&B',
  turkish_pop: 'Turkish pop',
  anatolian_rock: 'Anatolian rock',
};
// The provider's style string (English, deterministic). Free text last.
export function styleText(controls: StyleControls | undefined, free?: string) {
  const parts: string[] = [];
  if (controls?.genre)
    parts.push(
      GENRE_LABELS[controls.genre] ?? controls.genre.replace(/_/g, ' '),
    );
  if (controls?.mood) parts.push(controls.mood);
  if (controls?.bpm !== undefined) parts.push(`${String(controls.bpm)} BPM`);
  else if (controls?.tempo) parts.push(`${controls.tempo} tempo`);
  if (controls?.vocalType)
    parts.push(
      controls.vocalType === 'duet' || controls.vocalType === 'choir'
        ? `${controls.vocalType} vocals`
        : `${controls.vocalType} vocal`,
    );
  if (free?.trim()) parts.push(free.trim());
  return parts.join(', ');
}
