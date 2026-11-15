'use client';
import { useEffect, useId, useState } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import {
  LIMITS,
  SECTION_TAGS,
  sectionProblem,
  type Action,
  type Draft,
  type SectionTag,
} from './state';
import { Dialog } from './shared';

export interface Proposal {
  sections: Array<{ tag: SectionTag; lines: string[] }>;
  changed: number[];
}

// FR-04: the proposed tags next to the user's untouched words.
export function TagsStep({
  locale,
  proposal,
  onAccept,
  onKeep,
  onBack,
}: {
  locale: Locale;
  proposal: Proposal;
  onAccept: () => void;
  onKeep: () => void;
  onBack: () => void;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="create-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t(locale, 'create.tagsTitle')}</h2>
      <p className="caption">{t(locale, 'create.tagsHelp')}</p>
      <ol className="tag-proposal">
        {proposal.sections.map((section, index) => {
          const added = proposal.changed.includes(index);
          return (
            <li key={index} className={added ? 'tag-added' : undefined}>
              <span className="tag-name">
                {section.tag}
                {added ? (
                  <span className="status-chip">
                    {t(locale, 'create.tagAdded')}
                  </span>
                ) : null}
              </span>
              <span className="tag-lines">{section.lines.join('\n')}</span>
            </li>
          );
        })}
      </ol>
      <p className="caption">{t(locale, 'create.wordsUnchanged')}</p>
      {confirming ? (
        <p className="notice" role="status">
          {t(locale, 'create.keepConfirm')}
        </p>
      ) : null}
      <div className="create-actions">
        <button
          type="button"
          className="primary-button create-primary"
          onClick={onAccept}
        >
          {t(locale, 'create.addTags')}
        </button>
        {confirming ? (
          <button type="button" className="secondary" onClick={onKeep}>
            {t(locale, 'create.keepConfirmButton')}
          </button>
        ) : (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t(locale, 'create.keepAsIs')}
          </button>
        )}
        <button type="button" className="link-button" onClick={onBack}>
          {t(locale, 'create.back')}
        </button>
      </div>
    </section>
  );
}

const problemKey = {
  empty: 'create.sectionEmpty',
  lineTooLong: 'create.lineTooLong',
  tooManyLines: 'create.tooManyLines',
} as const;

export function LyricsEditor({
  locale,
  draft,
  dispatch,
  canUndo,
  rewritePrice,
  onRewrite,
  onBack,
  onNext,
}: {
  locale: Locale;
  draft: Draft;
  dispatch: (action: Action) => void;
  canUndo: boolean;
  rewritePrice: number | null;
  // Resolves with an error message to show in the dialog, or null to close it.
  onRewrite: (index: number, instruction: string) => Promise<string | null>;
  onBack: () => void;
  onNext: () => void;
}) {
  const id = useId();
  const [rewriting, setRewriting] = useState<number | null>(null);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const problems = draft.sections.map(sectionProblem);
  const valid = draft.sections.length > 0 && problems.every((p) => p === null);
  // Ctrl/Cmd+Z outside a text field undoes the last editor change; inside a
  // field the browser's own undo applies.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('textarea, input, select') || target.isContentEditable)
      )
        return;
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z'
      ) {
        event.preventDefault();
        dispatch({ type: 'undo' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [dispatch]);
  return (
    <section className="create-panel" aria-labelledby={`${id}-title`}>
      <div className="create-panel-head">
        <div>
          <h2 id={`${id}-title`}>{t(locale, 'create.editorTitle')}</h2>
          <p className="caption">{t(locale, 'create.editorHelp')}</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={!canUndo}
          aria-keyshortcuts="Control+Z Meta+Z"
          onClick={() => {
            dispatch({ type: 'undo' });
          }}
        >
          {t(locale, 'create.undo')}
        </button>
      </div>
      <ol className="sections">
        {draft.sections.map((section, index) => {
          const n = index + 1;
          const problem = problems[index];
          const errorId = `${id}-${section.key}-error`;
          return (
            <li
              key={section.key}
              className="section-block"
              data-testid={`section-${String(n)}`}
            >
              <div className="section-head">
                <span className="section-number">
                  {t(locale, 'create.section', { index: n })}
                </span>
                <label className="section-tag">
                  <span className="visually-hidden">
                    {t(locale, 'create.sectionTag')} {n}
                  </span>
                  <span className="select-control">
                    <select
                      value={section.tag}
                      onChange={(event) => {
                        const tag = SECTION_TAGS.find(
                          (x) => x === event.target.value,
                        );
                        if (tag) dispatch({ type: 'editTag', index, tag });
                      }}
                    >
                      {SECTION_TAGS.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                <div className="section-tools">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t(locale, 'create.moveUp', { index: n })}
                    disabled={index === 0}
                    onClick={() => {
                      dispatch({ type: 'move', index, by: -1 });
                    }}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t(locale, 'create.moveDown', { index: n })}
                    disabled={index === draft.sections.length - 1}
                    onClick={() => {
                      dispatch({ type: 'move', index, by: 1 });
                    }}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t(locale, 'create.remove', { index: n })}
                    onClick={() => {
                      dispatch({ type: 'remove', index });
                    }}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              </div>
              <label
                className="visually-hidden"
                htmlFor={`${id}-${section.key}`}
              >
                {t(locale, 'create.sectionLines', { index: n })}
              </label>
              <textarea
                id={`${id}-${section.key}`}
                className="section-text"
                value={section.text}
                rows={Math.min(
                  12,
                  Math.max(3, section.text.split('\n').length + 1),
                )}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? errorId : undefined}
                onChange={(event) => {
                  dispatch({
                    type: 'editText',
                    index,
                    text: event.target.value,
                  });
                }}
              />
              {problem ? (
                <p id={errorId} className="field-error">
                  {t(locale, problemKey[problem])}
                </p>
              ) : null}
              <div className="section-foot">
                <button
                  type="button"
                  className="link-button"
                  disabled={!valid || rewritePrice === null}
                  onClick={() => {
                    setInstruction('');
                    setRewriteError(null);
                    setRewriting(index);
                  }}
                >
                  {t(locale, 'create.rewriteSection', { index: n })}
                </button>
                <button
                  type="button"
                  className="link-button"
                  disabled={draft.sections.length >= LIMITS.sections}
                  onClick={() => {
                    dispatch({ type: 'add', after: index });
                  }}
                >
                  {t(locale, 'create.addSection')}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {draft.sections.length === 0 ? (
        <div className="create-actions">
          <p className="caption">{t(locale, 'create.noSections')}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              dispatch({ type: 'add', after: -1 });
            }}
          >
            {t(locale, 'create.addSection')}
          </button>
        </div>
      ) : null}
      {!valid && draft.sections.length > 0 ? (
        <p className="caption">{t(locale, 'create.fixSections')}</p>
      ) : null}
      <div className="create-actions">
        <button
          type="button"
          className="primary-button create-primary"
          disabled={!valid}
          onClick={onNext}
        >
          {t(locale, 'create.toStyle')}
        </button>
        <button type="button" className="link-button" onClick={onBack}>
          {t(locale, 'create.back')}
        </button>
      </div>
      <Dialog
        open={rewriting !== null}
        onClose={() => {
          if (!busy) setRewriting(null);
        }}
        labelledBy={`${id}-rewrite`}
        testId="rewrite-dialog"
      >
        <form
          className="sheet-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (rewriting === null) return;
            setBusy(true);
            setRewriteError(null);
            void onRewrite(rewriting, instruction.trim()).then((message) => {
              setBusy(false);
              if (message === null) setRewriting(null);
              else setRewriteError(message);
            });
          }}
        >
          <h2 id={`${id}-rewrite`}>{t(locale, 'create.rewriteTitle')}</h2>
          <p className="caption">{t(locale, 'create.rewriteHelp')}</p>
          <label className="create-field">
            <span>{t(locale, 'create.rewriteInstruction')}</span>
            <input
              value={instruction}
              maxLength={LIMITS.instruction}
              onChange={(event) => {
                setInstruction(event.target.value);
              }}
            />
          </label>
          {rewriteError ? (
            <p className="alert" role="alert">
              {rewriteError}
            </p>
          ) : null}
          <div className="create-actions">
            <button
              type="submit"
              className="primary-button create-primary"
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy
                ? t(locale, 'create.rewriting')
                : t(locale, 'create.rewriteSubmit', {
                    count: rewritePrice ?? 0,
                  })}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setRewriting(null);
              }}
            >
              {t(locale, 'common.cancel')}
            </button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
