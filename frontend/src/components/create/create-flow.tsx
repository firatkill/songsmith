'use client';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import { addMissingTags, parseLyrics, toSections } from '@songsmith/domain';
import { curatedGenres, type CatalogueModel } from '@songsmith/schemas';
import {
  LIMITS,
  STORAGE_KEY,
  apiSections,
  initialState,
  reducer,
  restore,
  serialise,
  type Action,
} from './state';
import { moderationParts, songRequest } from './request';
import { InputStep } from './input-step';
import { LyricsEditor, TagsStep, type Proposal } from './lyrics-step';
import { StyleStep } from './style-step';
import { Dialog, clientApi, failure, newIdempotencyKey } from './shared';

export interface CreateCatalogue {
  models: CatalogueModel[];
  lyricist: {
    available: boolean;
    prices: { lyrics: number; rewrite: number };
  } | null;
}
const curated = new Set<string>(curatedGenres);

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
export function clearCreateDraft() {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* Storage may be blocked; nothing to clear. */
  }
}

export function CreateFlow({
  locale,
  catalogue,
}: {
  locale: Locale;
  catalogue: CreateCatalogue;
}) {
  const router = useRouter();
  const id = useId();
  const [state, rawDispatch] = useReducer(reducer, locale, initialState);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ price: number } | null>(null);
  // Reused only when the same action is retried after a network failure.
  const pendingKey = useRef<{ action: string; key: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const draft = state.draft;
  const dispatch = useCallback((action: Action) => {
    setError(null);
    rawDispatch(action);
  }, []);

  useEffect(() => {
    const restored = restore(storage()?.getItem(STORAGE_KEY) ?? null);
    if (restored) rawDispatch({ type: 'load', state: restored });
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      storage()?.setItem(STORAGE_KEY, serialise(state));
    } catch {
      /* Quota or privacy mode: the flow still works without persistence. */
    }
  }, [loaded, state]);
  const refreshWallet = useCallback(() => {
    void clientApi(locale)
      .GET('/v1/wallet')
      .then((result) => {
        setWallet(result.data ? result.data.available : null);
      })
      .catch(() => {
        setWallet(null);
      });
  }, [locale]);
  // Re-read on entering the style step: credits may have changed elsewhere.
  useEffect(() => {
    if (draft.step === 'style' || draft.step === 'input') refreshWallet();
  }, [draft.step, refreshWallet]);
  useEffect(() => {
    if (loaded) heading.current?.focus();
  }, [draft.step, loaded]);

  function keyFor(action: string) {
    if (pendingKey.current?.action !== action)
      pendingKey.current = { action, key: newIdempotencyKey() };
    return pendingKey.current.key;
  }
  const lyricist = catalogue.lyricist?.available
    ? catalogue.lyricist.prices
    : null;
  const go = (step: typeof draft.step) => {
    dispatch({ type: 'step', step });
  };

  async function writeLyrics() {
    const description = draft.description.trim();
    if (!description) {
      setError(t(locale, 'create.required'));
      return;
    }
    const action = `write:${draft.language}:${description}`;
    setBusy(true);
    setError(null);
    try {
      const result = await clientApi(locale).POST('/v1/lyrics/write', {
        params: { header: { 'idempotency-key': keyFor(action) } },
        body: { language: draft.language, description },
      });
      pendingKey.current = null;
      refreshWallet();
      if (result.data) {
        const { lyrics } = result.data;
        rawDispatch({
          type: 'lyrics',
          sections: lyrics.sections,
          title: lyrics.title,
          suggestedStyle: lyrics.suggestedStyle,
        });
        rawDispatch({ type: 'step', step: 'editor' });
        return;
      }
      const mapped = failure(locale, result.error);
      if (mapped.kind === 'credits') setSheet({ price: lyricist?.lyrics ?? 0 });
      else setError(mapped.message);
    } catch {
      setError(t(locale, 'errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }

  function continueInput() {
    if (draft.mode === 'describe') {
      if (!draft.description.trim()) {
        setError(t(locale, 'create.required'));
        return;
      }
      // Describe + instrumental skips the lyrics step (FR-06).
      go('style');
      return;
    }
    const blocks = parseLyrics(draft.pasted);
    if (!blocks.some((b) => b.lines.length)) {
      setError(t(locale, 'create.required'));
      return;
    }
    if (blocks.length > LIMITS.sections) {
      setError(t(locale, 'create.tooManySections'));
      return;
    }
    const sections = toSections(blocks);
    if (sections) {
      rawDispatch({ type: 'lyrics', sections });
      go('editor');
      return;
    }
    go('tags');
  }

  async function rewrite(
    index: number,
    instruction: string,
  ): Promise<string | null> {
    const sections = apiSections(draft);
    const action = `rewrite:${String(index)}:${instruction}:${JSON.stringify(sections)}`;
    try {
      const result = await clientApi(locale).POST(
        '/v1/lyrics/rewrite-section',
        {
          params: { header: { 'idempotency-key': keyFor(action) } },
          body: {
            language: draft.language,
            sections,
            index,
            ...(instruction ? { instruction } : {}),
          },
        },
      );
      pendingKey.current = null;
      refreshWallet();
      if (result.data) {
        rawDispatch({ type: 'replace', index, section: result.data.section });
        return null;
      }
      const mapped = failure(locale, result.error);
      if (mapped.kind === 'credits') {
        setSheet({ price: lyricist?.rewrite ?? 0 });
        return null;
      }
      return mapped.message;
    } catch {
      return t(locale, 'errors.INTERNAL');
    }
  }

  async function generate(model: CatalogueModel) {
    const manual = draft.modelId === model.id;
    const body = songRequest(draft, model, manual);
    const action = `song:${JSON.stringify(body)}`;
    setBusy(true);
    setError(null);
    try {
      const result = await clientApi(locale).POST('/v1/songs', {
        params: { header: { 'idempotency-key': keyFor(action) } },
        body,
      });
      pendingKey.current = null;
      if (result.data) {
        // The draft stays until the song is ready, so Try again keeps it.
        router.push(`/${locale}/create/jobs/${result.data.jobId}`);
        return;
      }
      refreshWallet();
      const mapped = failure(locale, result.error);
      if (mapped.kind === 'credits')
        setSheet({ price: model.prices.generate ?? 0 });
      else setError(mapped.message);
      setBusy(false);
    } catch {
      setError(t(locale, 'errors.INTERNAL'));
      setBusy(false);
    }
  }

  // Derived from the pasted text, so a reload on this step shows it again.
  const proposal = useMemo((): Proposal | null => {
    if (draft.step !== 'tags') return null;
    const proposed = addMissingTags(draft.pasted);
    return {
      sections: proposed.sections,
      changed: proposed.changes.map((c) => c.index),
    };
  }, [draft.step, draft.pasted]);
  const parts = useMemo(() => moderationParts(draft, curated), [draft]);
  const stepNames = draft.instrumental
    ? (['input', 'style'] as const)
    : (['input', 'lyrics', 'style'] as const);
  const currentName =
    draft.step === 'tags' || draft.step === 'editor' ? 'lyrics' : draft.step;
  const current = stepNames.findIndex((s) => s === currentName) + 1;
  const stepLabel = {
    input: t(locale, 'create.stepInput'),
    lyrics: t(locale, 'create.stepLyrics'),
    style: t(locale, 'create.stepStyle'),
  } as const;

  return (
    <div className="create-flow" data-loaded={loaded || undefined}>
      <div className="create-head">
        <h1 ref={heading} tabIndex={-1}>
          {t(locale, 'create.title')}
        </h1>
        <p className="caption create-lead">{t(locale, 'create.lead')}</p>
        <nav aria-label={t(locale, 'create.steps')}>
          <ol className="stepper">
            {stepNames.map((name, index) => (
              <li
                key={name}
                aria-current={name === currentName ? 'step' : undefined}
                className={index + 1 < current ? 'done' : undefined}
              >
                <span className="stepper-dot" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{stepLabel[name]}</span>
              </li>
            ))}
          </ol>
          <p className="visually-hidden" aria-live="polite">
            {t(locale, 'create.stepOf', { current, total: stepNames.length })}
          </p>
        </nav>
      </div>
      {draft.step === 'input' ? (
        <InputStep
          locale={locale}
          draft={draft}
          dispatch={dispatch}
          lyricsPrice={lyricist?.lyrics ?? null}
          busy={busy}
          error={error}
          onWrite={() => void writeLyrics()}
          onContinue={continueInput}
        />
      ) : null}
      {draft.step === 'tags' && proposal ? (
        <TagsStep
          locale={locale}
          proposal={proposal}
          onAccept={() => {
            rawDispatch({ type: 'lyrics', sections: proposal.sections });
            go('editor');
          }}
          onKeep={() => {
            const sections = parseLyrics(draft.pasted)
              .filter((b) => b.lines.length)
              .map((b) => ({ tag: b.tag ?? '[Verse]', lines: b.lines }));
            rawDispatch({ type: 'lyrics', sections });
            go('editor');
          }}
          onBack={() => {
            go('input');
          }}
        />
      ) : null}
      {draft.step === 'editor' ? (
        <LyricsEditor
          locale={locale}
          draft={draft}
          dispatch={dispatch}
          canUndo={state.history.length > 0}
          rewritePrice={lyricist?.rewrite ?? null}
          onRewrite={rewrite}
          onBack={() => {
            go('input');
          }}
          onNext={() => {
            go('style');
          }}
        />
      ) : null}
      {draft.step === 'style' ? (
        <StyleStep
          locale={locale}
          draft={draft}
          dispatch={dispatch}
          models={catalogue.models}
          parts={parts}
          available={wallet}
          busy={busy}
          error={error}
          onEdit={() => {
            go(
              draft.instrumental || draft.sections.length === 0
                ? 'input'
                : 'editor',
            );
          }}
          onBack={() => {
            go(draft.instrumental ? 'input' : 'editor');
          }}
          onGenerate={(model) => void generate(model)}
          onBuy={(price) => {
            setSheet({ price });
          }}
        />
      ) : null}
      <Dialog
        open={sheet !== null}
        onClose={() => {
          setSheet(null);
        }}
        labelledBy={`${id}-buy`}
        testId="buy-sheet"
      >
        <div className="sheet-body">
          <h2 id={`${id}-buy`}>{t(locale, 'create.buyTitle')}</h2>
          <p>
            {t(locale, 'create.buyBody', {
              price: sheet?.price ?? 0,
              available: Math.max(0, wallet ?? 0),
            })}
          </p>
          <p className="notice">{t(locale, 'create.buySoon')}</p>
          <div className="create-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setSheet(null);
              }}
            >
              {t(locale, 'create.close')}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
