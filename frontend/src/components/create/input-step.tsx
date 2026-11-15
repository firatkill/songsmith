'use client';
import { useId } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import { LIMITS, type Action, type Draft } from './state';

export function InputStep({
  locale,
  draft,
  dispatch,
  lyricsPrice,
  busy,
  error,
  onWrite,
  onContinue,
}: {
  locale: Locale;
  draft: Draft;
  dispatch: (action: Action) => void;
  lyricsPrice: number | null;
  busy: boolean;
  error: string | null;
  onWrite: () => void;
  onContinue: () => void;
}) {
  const id = useId();
  const describing = draft.mode === 'describe';
  const value = describing ? draft.description : draft.pasted;
  const max = describing ? LIMITS.describe : LIMITS.lyrics;
  const help = `${id}-help`;
  const count = `${id}-count`;
  const errorId = `${id}-error`;
  const writes = describing && !draft.instrumental;
  return (
    <section className="create-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="visually-hidden">
        {t(locale, 'create.stepInput')}
      </h2>
      <fieldset className="create-fieldset">
        <legend>{t(locale, 'create.mode')}</legend>
        <div className="segmented-control">
          {(['describe', 'lyrics'] as const).map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name={`${id}-mode`}
                value={mode}
                checked={draft.mode === mode}
                disabled={mode === 'lyrics' && draft.instrumental}
                onChange={() => {
                  dispatch({ type: 'mode', mode });
                }}
              />
              <span>
                {t(
                  locale,
                  mode === 'describe'
                    ? 'create.modeDescribe'
                    : 'create.modeLyrics',
                )}
              </span>
            </label>
          ))}
        </div>
        {draft.instrumental ? (
          <p className="caption">{t(locale, 'create.instrumentalNoLyrics')}</p>
        ) : null}
      </fieldset>
      <label className="create-field" htmlFor={`${id}-text`}>
        <span>
          {t(
            locale,
            describing ? 'create.describeLabel' : 'create.lyricsLabel',
          )}
        </span>
        <span id={help} className="caption">
          {t(locale, describing ? 'create.describeHelp' : 'create.lyricsHelp')}
        </span>
        <textarea
          id={`${id}-text`}
          className={describing ? 'create-textarea' : 'create-textarea tall'}
          value={value}
          maxLength={max}
          placeholder={
            describing ? t(locale, 'create.describePlaceholder') : '[Verse]\n…'
          }
          aria-describedby={`${help} ${count}${error ? ` ${errorId}` : ''}`}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            dispatch({
              type: 'field',
              field: describing ? 'description' : 'pasted',
              value: event.target.value,
            });
          }}
        />
        <span id={count} className="caption create-counter">
          {t(locale, 'create.counter', { count: value.length, max })}
        </span>
      </label>
      <div className="create-row">
        <label className="toggle-row create-toggle">
          <span>
            <span className="toggle-label">
              {t(locale, 'create.instrumental')}
            </span>
            <span className="caption">
              {t(locale, 'create.instrumentalHelp')}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={draft.instrumental}
            onChange={(event) => {
              dispatch({ type: 'instrumental', value: event.target.checked });
            }}
          />
        </label>
        <label className="create-field create-language">
          <span>{t(locale, 'create.language')}</span>
          <span className="select-control">
            <select
              value={draft.language}
              onChange={(event) => {
                dispatch({
                  type: 'language',
                  value: event.target.value === 'tr' ? 'tr' : 'en',
                });
              }}
            >
              <option value="tr">{t(locale, 'web.tr')}</option>
              <option value="en">{t(locale, 'web.en')}</option>
            </select>
          </span>
        </label>
      </div>
      {error ? (
        <p id={errorId} className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="create-actions">
        {writes ? (
          <button
            type="button"
            className="primary-button create-primary"
            disabled={busy || lyricsPrice === null}
            aria-busy={busy || undefined}
            onClick={onWrite}
          >
            {busy
              ? t(locale, 'create.writing')
              : t(locale, 'create.writeLyrics', { count: lyricsPrice ?? 0 })}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button create-primary"
            onClick={onContinue}
          >
            {t(locale, 'create.continue')}
          </button>
        )}
        {writes && lyricsPrice === null ? (
          <p className="caption">{t(locale, 'create.lyricistUnavailable')}</p>
        ) : null}
      </div>
    </section>
  );
}
