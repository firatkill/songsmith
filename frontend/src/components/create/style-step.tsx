'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  formatMessage as t,
  type Locale,
  type MessageKey,
} from '@songsmith/i18n';
import {
  curatedGenres,
  moodSchema,
  tempoSchema,
  vocalTypeSchema,
  type CatalogueModel,
} from '@songsmith/schemas';
import { durationRange, modelChoice } from '@songsmith/domain';
import { LIMITS, type Action, type Draft } from './state';
import { clientApi, failure, moderationMessage } from './shared';
import type { ModerationPart } from './request';

export type Check =
  | { status: 'checking' }
  | { status: 'allow' }
  | { status: 'blocked'; message: string }
  | { status: 'error'; message: string };

// FR-07: the free pre-check runs on entry and after edits (debounced).
function useModerationCheck(
  locale: Locale,
  parts: ModerationPart[],
  language: Locale,
) {
  const [check, setCheck] = useState<Check>({ status: 'checking' });
  const key = JSON.stringify(parts);
  const seq = useRef(0);
  useEffect(() => {
    const current = ++seq.current;
    setCheck({ status: 'checking' });
    if (parts.length === 0) return;
    const timer = setTimeout(() => {
      void clientApi(locale)
        .POST('/v1/moderation/check', { body: { parts, language } })
        .then((result) => {
          if (current !== seq.current) return;
          if (result.data) {
            const data = result.data;
            if (data.action === 'block' || data.action === 'hard_block')
              setCheck({
                status: 'blocked',
                message: moderationMessage(
                  locale,
                  data.action,
                  data.action === 'block' ? data.category : undefined,
                ),
              });
            else setCheck({ status: 'allow' });
            return;
          }
          const mapped = failure(locale, result.error);
          setCheck(
            mapped.kind === 'blocked'
              ? { status: 'blocked', message: mapped.message }
              : {
                  status: 'error',
                  message:
                    mapped.kind === 'error'
                      ? mapped.message
                      : t(locale, 'create.checkFailed'),
                },
          );
        })
        .catch(() => {
          if (current === seq.current)
            setCheck({
              status: 'error',
              message: t(locale, 'create.checkFailed'),
            });
        });
    }, 800);
    return () => {
      clearTimeout(timer);
    };
    // `key` captures the parts' content.
  }, [key, language, locale]);
  return check;
}

export function StyleStep({
  locale,
  draft,
  dispatch,
  models,
  parts,
  available,
  busy,
  error,
  onEdit,
  onBack,
  onGenerate,
  onBuy,
}: {
  locale: Locale;
  draft: Draft;
  dispatch: (action: Action) => void;
  models: CatalogueModel[];
  parts: ModerationPart[];
  available: number | null;
  busy: boolean;
  error: string | null;
  onEdit: () => void;
  onBack: () => void;
  onGenerate: (model: CatalogueModel) => void;
  onBuy: (price: number) => void;
}) {
  const id = useId();
  const check = useModerationCheck(locale, parts, draft.language);
  const choice = useMemo(
    () =>
      modelChoice({
        models,
        language: draft.language,
        instrumental: draft.instrumental,
      }),
    [models, draft.language, draft.instrumental],
  );
  const picked = choice.options.find(
    (o) => o.id === draft.modelId && o.eligible,
  );
  const modelId = picked?.id ?? choice.autoModelId;
  const model = models.find((m) => m.id === modelId);
  const autoModel = models.find((m) => m.id === choice.autoModelId);
  const price = model?.prices.generate;
  const range = durationRange(model);
  const controls = model?.capabilities.controls;
  const style = draft.style;
  const titleMissing = !draft.title.trim();
  const lacking =
    price !== undefined && available !== null && available < price;
  const ready =
    !!model &&
    price !== undefined &&
    !titleMissing &&
    check.status === 'allow' &&
    !busy;
  const durationId = `${id}-duration`;
  return (
    <section className="create-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t(locale, 'create.styleTitle')}</h2>
      <label className="create-field">
        <span>{t(locale, 'create.songTitle')}</span>
        <input
          value={draft.title}
          maxLength={LIMITS.title}
          aria-invalid={titleMissing || undefined}
          aria-describedby={titleMissing ? `${id}-title-error` : undefined}
          onChange={(event) => {
            dispatch({
              type: 'field',
              field: 'title',
              value: event.target.value,
            });
          }}
        />
        {titleMissing ? (
          <span id={`${id}-title-error`} className="field-error">
            {t(locale, 'create.titleRequired')}
          </span>
        ) : null}
      </label>
      <fieldset className="create-fieldset">
        <legend>{t(locale, 'create.genre')}</legend>
        <div className="choice-chips">
          {['', ...curatedGenres, 'other'].map((genre) => (
            <label key={genre || 'any'} className="choice-chip">
              <input
                type="radio"
                name={`${id}-genre`}
                checked={style.genre === genre}
                onChange={() => {
                  dispatch({ type: 'style', patch: { genre } });
                }}
              />
              <span>
                {genre === ''
                  ? t(locale, 'create.any')
                  : genre === 'other'
                    ? t(locale, 'create.genreOther')
                    : t(locale, `create.genre.${genre}` as MessageKey)}
              </span>
            </label>
          ))}
        </div>
        {style.genre === 'other' ? (
          <label className="create-field">
            <span>{t(locale, 'create.genreOther')}</span>
            <span className="caption">
              {t(locale, 'create.genreOtherHelp')}
            </span>
            <input
              value={style.genreText}
              maxLength={LIMITS.genre}
              onChange={(event) => {
                dispatch({
                  type: 'style',
                  patch: { genreText: event.target.value },
                });
              }}
            />
          </label>
        ) : null}
      </fieldset>
      <div className="create-grid">
        <label className="create-field">
          <span>{t(locale, 'create.mood')}</span>
          <span className="select-control">
            <select
              value={style.mood}
              onChange={(event) => {
                dispatch({
                  type: 'style',
                  patch: { mood: event.target.value },
                });
              }}
            >
              <option value="">{t(locale, 'create.any')}</option>
              {moodSchema.options.map((mood) => (
                <option key={mood} value={mood}>
                  {t(locale, `create.mood.${mood}` as MessageKey)}
                </option>
              ))}
            </select>
          </span>
        </label>
        <fieldset className="create-fieldset">
          <legend>{t(locale, 'create.tempo')}</legend>
          <div className="segmented-control">
            {['', ...tempoSchema.options].map((tempo) => (
              <label key={tempo || 'any'}>
                <input
                  type="radio"
                  name={`${id}-tempo`}
                  checked={style.tempo === tempo}
                  onChange={() => {
                    dispatch({ type: 'style', patch: { tempo } });
                  }}
                />
                <span>
                  {tempo
                    ? t(locale, `create.tempo.${tempo}` as MessageKey)
                    : t(locale, 'create.any')}
                </span>
              </label>
            ))}
          </div>
          {controls?.bpm ? (
            <label className="create-field">
              <span>{t(locale, 'create.bpm')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={40}
                max={220}
                value={style.bpm}
                onChange={(event) => {
                  dispatch({
                    type: 'style',
                    patch: { bpm: event.target.value },
                  });
                }}
              />
            </label>
          ) : (
            <p className="caption">{t(locale, 'create.bpmUnsupported')}</p>
          )}
        </fieldset>
        {draft.instrumental ? null : (
          <label className="create-field">
            <span>{t(locale, 'create.vocal')}</span>
            <span className="select-control">
              <select
                value={controls?.vocalType ? style.vocalType : ''}
                disabled={!controls?.vocalType}
                aria-describedby={
                  controls?.vocalType ? undefined : `${id}-vocal`
                }
                onChange={(event) => {
                  dispatch({
                    type: 'style',
                    patch: { vocalType: event.target.value },
                  });
                }}
              >
                <option value="">{t(locale, 'create.any')}</option>
                {vocalTypeSchema.options.map((vocal) => (
                  <option key={vocal} value={vocal}>
                    {t(locale, `create.vocal.${vocal}` as MessageKey)}
                  </option>
                ))}
              </select>
            </span>
            {controls?.vocalType ? null : (
              <span id={`${id}-vocal`} className="caption">
                {t(locale, 'create.vocalUnsupported')}
              </span>
            )}
          </label>
        )}
        <label className="create-field" htmlFor={durationId}>
          <span>{t(locale, 'create.length')}</span>
          <input
            id={durationId}
            type="number"
            inputMode="numeric"
            min={range.min}
            max={range.max}
            step={10}
            value={style.durationSec}
            aria-describedby={`${durationId}-range`}
            onChange={(event) => {
              dispatch({
                type: 'style',
                patch: { durationSec: Number(event.target.value) || range.min },
              });
            }}
          />
          <span id={`${durationId}-range`} className="caption">
            {t(locale, 'create.lengthRange', range)}
          </span>
        </label>
      </div>
      <label className="create-field">
        <span>{t(locale, 'create.styleText')}</span>
        <span className="caption">{t(locale, 'create.styleTextHelp')}</span>
        <input
          value={style.free}
          maxLength={LIMITS.style}
          onChange={(event) => {
            dispatch({ type: 'style', patch: { free: event.target.value } });
          }}
        />
      </label>
      <details className="advanced">
        <summary>{t(locale, 'create.advanced')}</summary>
        <fieldset className="create-fieldset model-picker">
          <legend className="visually-hidden">
            {t(locale, 'create.advanced')}
          </legend>
          <label className="model-option">
            <input
              type="radio"
              name={`${id}-model`}
              checked={!picked}
              onChange={() => {
                dispatch({ type: 'model', modelId: null });
              }}
            />
            <span>
              <span className="toggle-label">{t(locale, 'create.auto')}</span>
              <span className="caption">
                {autoModel
                  ? t(locale, 'create.autoUses', {
                      model: autoModel.displayName,
                    })
                  : t(locale, 'create.noModel')}
              </span>
            </span>
          </label>
          {choice.options.map((option) => (
            <label
              key={option.id}
              className="model-option"
              data-testid={`model-${option.id}`}
              aria-disabled={!option.eligible || undefined}
            >
              <input
                type="radio"
                name={`${id}-model`}
                checked={picked?.id === option.id}
                disabled={!option.eligible}
                aria-describedby={`${id}-${option.id}-why`}
                onChange={() => {
                  dispatch({ type: 'model', modelId: option.id });
                }}
              />
              <span>
                <span className="toggle-label">{option.displayName}</span>
                <span id={`${id}-${option.id}-why`} className="caption">
                  {option.reason
                    ? t(locale, `router.reason.${option.reason}` as MessageKey)
                    : option.price !== undefined
                      ? t(locale, 'create.modelPrice', { count: option.price })
                      : ''}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </details>
      <div className="generate-bar" aria-live="polite">
        <div className="generate-status">
          {check.status === 'checking' ? (
            <p className="caption">{t(locale, 'create.checking')}</p>
          ) : check.status === 'allow' ? (
            <p className="caption">{t(locale, 'create.checkPassed')}</p>
          ) : (
            <div className="alert create-block" role="alert">
              <span>{check.message}</span>
              {check.status === 'blocked' ? (
                <button type="button" className="secondary" onClick={onEdit}>
                  {t(locale, 'create.edit')}
                </button>
              ) : null}
            </div>
          )}
          {!model ? (
            <p className="alert">{t(locale, 'create.noModel')}</p>
          ) : null}
          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}
          {available !== null ? (
            <p className="caption">
              {t(locale, 'create.balance', { count: available })}
            </p>
          ) : null}
        </div>
        <div className="create-actions">
          {lacking ? (
            <button
              type="button"
              className="primary-button create-primary"
              onClick={() => {
                onBuy(price);
              }}
            >
              {t(locale, 'create.buyCredits')}
            </button>
          ) : (
            <button
              type="button"
              className="primary-button create-primary"
              disabled={!ready}
              aria-busy={busy || undefined}
              onClick={() => {
                if (model) onGenerate(model);
              }}
            >
              {busy
                ? t(locale, 'create.generating')
                : t(locale, 'create.generate', { count: price ?? 0 })}
            </button>
          )}
          <button type="button" className="link-button" onClick={onBack}>
            {t(locale, 'create.back')}
          </button>
        </div>
      </div>
    </section>
  );
}
