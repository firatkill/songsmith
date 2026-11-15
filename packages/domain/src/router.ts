import type {
  CatalogueModel,
  Operation,
  RouterReasonCode,
} from '@songsmith/schemas';

export interface RouteReason {
  kind: 'auto' | 'manual' | 'source';
  differentModel?: boolean;
}
export type RouteError = 'MODEL_NOT_ELIGIBLE' | 'NO_ELIGIBLE_MODEL';
export type RouteResult =
  | { ok: true; modelId: string; reason: RouteReason }
  | {
      ok: false;
      error: RouteError;
      perModel: Record<string, RouterReasonCode>;
    };

export function route(input: {
  operation: Operation;
  language: string | null;
  instrumental: boolean;
  sourceModelId?: string;
  requestedModelId?: string;
  models: CatalogueModel[];
  allowBetaLanguages: boolean;
}): RouteResult {
  const perModel: Record<string, RouterReasonCode> = {};
  const exclude = (id: string, reason: RouterReasonCode) => {
    // Define own keys even for ids such as "__proto__".
    Object.defineProperty(perModel, id, {
      value: reason,
      enumerable: true,
      configurable: true,
    });
  };
  const required: Operation[] = [input.operation];
  if (
    !input.instrumental &&
    (input.operation === 'generate' || input.operation === 'image_input')
  )
    required.push('custom_lyrics');
  if (input.instrumental && input.operation === 'generate')
    required.push('instrumental');
  let eligible = input.models.filter((model) => {
    const missing = required.find(
      (operation) => !model.capabilities.operations.includes(operation),
    );
    let reason: RouterReasonCode | undefined;
    if (missing) reason = `cannot_${missing}`;
    else if (model.prices[input.operation] === undefined) reason = 'no_price';
    else if (!input.instrumental) {
      const status =
        input.language === null ? undefined : model.languages[input.language];
      if (
        status !== 'verified' &&
        !(status === 'beta' && input.allowBetaLanguages)
      )
        reason = 'language_unverified';
    }
    if (!reason && !model.available) reason = 'unavailable';
    if (reason) exclude(model.id, reason);
    return reason === undefined;
  });
  let kind: RouteReason['kind'] = 'auto';
  let differentModel = false;
  if (
    (input.operation === 'extend' || input.operation === 'stems') &&
    input.sourceModelId !== undefined
  ) {
    const sourceEligible = eligible.some(
      (model) => model.id === input.sourceModelId,
    );
    differentModel = !sourceEligible;
    if (sourceEligible) kind = 'source';
    eligible = eligible.filter((model) => {
      const keep = sourceEligible
        ? model.id === input.sourceModelId
        : model.capabilities.acceptsExternalAudio;
      if (!keep)
        exclude(
          model.id,
          sourceEligible ? 'not_source_model' : 'no_external_audio',
        );
      return keep;
    });
  }
  if (input.requestedModelId !== undefined) {
    const requested = eligible.find(
      (model) => model.id === input.requestedModelId,
    );
    if (!requested) {
      if (!input.models.some((model) => model.id === input.requestedModelId))
        exclude(input.requestedModelId, 'unknown_model');
      return { ok: false, error: 'MODEL_NOT_ELIGIBLE', perModel };
    }
    return {
      ok: true,
      modelId: requested.id,
      reason: {
        kind: 'manual',
        ...(differentModel ? { differentModel: true } : {}),
      },
    };
  }
  eligible.sort(
    (a, b) =>
      b.qualityRank - a.qualityRank ||
      (a.prices[input.operation] ?? 0) - (b.prices[input.operation] ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const selected = eligible[0];
  if (!selected) return { ok: false, error: 'NO_ELIGIBLE_MODEL', perModel };
  return {
    ok: true,
    modelId: selected.id,
    reason: { kind, ...(differentModel ? { differentModel: true } : {}) },
  };
}
