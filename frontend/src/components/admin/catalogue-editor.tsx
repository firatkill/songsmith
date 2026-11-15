'use client';
import { useState } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import type { paths } from '@songsmith/api-client';
import { api } from '../../lib/api';
import { browserAuth } from '../../lib/auth-browser';

export type Model =
  paths['/v1/admin/catalogue']['get']['responses'][200]['content']['application/json']['models'][number];
type RowState = 'idle' | 'busy' | 'saved' | 'error';

function client(locale: Locale) {
  return api(
    locale,
    async () => (await browserAuth().getSession()).data.session?.access_token,
  );
}

export function CatalogueEditor({
  locale,
  initial,
}: {
  locale: Locale;
  initial: Model[];
}) {
  const [models, setModels] = useState(initial);
  const [ranks, setRanks] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((m) => [m.id, String(m.qualityRank)])),
  );
  const [states, setStates] = useState<Record<string, RowState>>({});

  async function patch(
    id: string,
    body: { enabled?: boolean; qualityRank?: number },
  ) {
    setStates((current) => ({ ...current, [id]: 'busy' }));
    const result = await client(locale)
      .PATCH('/v1/admin/catalogue/{id}', { params: { path: { id } }, body })
      .catch(() => ({ data: undefined, error: true }));
    if (!result.data) {
      setStates((current) => ({ ...current, [id]: 'error' }));
      return;
    }
    const updated = result.data;
    setModels((current) => current.map((m) => (m.id === id ? updated : m)));
    setRanks((current) => ({ ...current, [id]: String(updated.qualityRank) }));
    setStates((current) => ({ ...current, [id]: 'saved' }));
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">{t(locale, 'admin.model')}</th>
            <th scope="col">{t(locale, 'admin.kind')}</th>
            <th scope="col">{t(locale, 'admin.languages')}</th>
            <th scope="col">{t(locale, 'admin.status')}</th>
            <th scope="col">{t(locale, 'admin.enabled')}</th>
            <th scope="col">{t(locale, 'admin.rank')}</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            const state = states[model.id] ?? 'idle';
            const rank = ranks[model.id] ?? '';
            const rankValid = /^\d{1,4}$/.test(rank) && Number(rank) <= 1000;
            return (
              <tr key={model.id} data-testid={`model-${model.id}`}>
                <th scope="row">
                  <div className="admin-model">
                    <span className="admin-model-name">
                      {model.displayName}
                    </span>
                    {model.displayName !== model.id && (
                      <code className="caption">{model.id}</code>
                    )}
                    {model.isMock && (
                      <span className="admin-badge">
                        {t(locale, 'admin.mock')}
                      </span>
                    )}
                  </div>
                </th>
                <td>{model.kind}</td>
                <td>
                  {model.languages.length
                    ? model.languages
                        .map((l) => `${l.language} · ${l.status}`)
                        .join(', ')
                    : '—'}
                </td>
                <td>
                  <span
                    className="admin-status"
                    data-usable={model.usable}
                    data-testid={`status-${model.id}`}
                  >
                    {t(
                      locale,
                      model.usable ? 'admin.usable' : 'admin.notUsable',
                    )}
                  </span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    role="switch"
                    className="admin-switch"
                    aria-label={`${t(locale, 'admin.enabled')}: ${model.displayName}`}
                    checked={model.enabled}
                    disabled={state === 'busy'}
                    onChange={(event) => {
                      void patch(model.id, { enabled: event.target.checked });
                    }}
                  />
                </td>
                <td>
                  <form
                    className="admin-inline-form"
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (rankValid)
                        void patch(model.id, { qualityRank: Number(rank) });
                      else
                        setStates((current) => ({
                          ...current,
                          [model.id]: 'error',
                        }));
                    }}
                  >
                    <input
                      className="admin-number"
                      inputMode="numeric"
                      aria-label={`${t(locale, 'admin.rank')}: ${model.displayName}`}
                      aria-invalid={!rankValid}
                      value={rank}
                      onChange={(event) => {
                        setRanks((current) => ({
                          ...current,
                          [model.id]: event.target.value.replace(/\D/g, ''),
                        }));
                      }}
                    />
                    <button
                      className="admin-save"
                      type="submit"
                      disabled={
                        state === 'busy' || rank === String(model.qualityRank)
                      }
                    >
                      {t(locale, 'admin.save')}
                    </button>
                  </form>
                  <span className="admin-row-state" aria-live="polite">
                    {state === 'saved'
                      ? t(locale, 'admin.saved')
                      : state === 'error'
                        ? t(locale, 'admin.saveError')
                        : ''}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
