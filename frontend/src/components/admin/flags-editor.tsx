'use client';
import { useState } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import type { paths } from '@songsmith/api-client';
import { api } from '../../lib/api';
import { browserAuth } from '../../lib/auth-browser';

export type Flag =
  paths['/v1/admin/flags']['get']['responses'][200]['content']['application/json']['flags'][number];
type RowState = 'idle' | 'busy' | 'saved' | 'error' | 'invalid';

function show(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function FlagsEditor({
  locale,
  initial,
}: {
  locale: Locale;
  initial: Flag[];
}) {
  const [flags, setFlags] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((flag) => [flag.key, show(flag.value)])),
  );
  const [states, setStates] = useState<Record<string, RowState>>({});

  async function save(key: string, value: unknown) {
    setStates((current) => ({ ...current, [key]: 'busy' }));
    const result = await api(
      locale,
      async () => (await browserAuth().getSession()).data.session?.access_token,
    )
      .PUT('/v1/admin/flags/{key}', {
        params: { path: { key } },
        body: { value },
      })
      .catch(() => ({ data: undefined, error: true }));
    if (!result.data) {
      setStates((current) => ({ ...current, [key]: 'error' }));
      return;
    }
    const updated = result.data;
    setFlags((current) => current.map((f) => (f.key === key ? updated : f)));
    setDrafts((current) => ({ ...current, [key]: show(updated.value) }));
    setStates((current) => ({ ...current, [key]: 'saved' }));
  }

  function message(key: string) {
    const state = states[key] ?? 'idle';
    return state === 'saved'
      ? t(locale, 'admin.saved')
      : state === 'error'
        ? t(locale, 'admin.saveError')
        : state === 'invalid'
          ? t(locale, 'admin.invalidJson')
          : '';
  }

  const switches = flags.filter((flag) => flag.key.startsWith('kill_switch:'));
  const others = flags.filter((flag) => !flag.key.startsWith('kill_switch:'));

  return (
    <>
      <section className="admin-section" aria-labelledby="kill-switches">
        <h2 id="kill-switches">{t(locale, 'admin.killSwitches')}</h2>
        <p className="caption">{t(locale, 'admin.killSwitchesHelp')}</p>
        <div className="auth-group admin-group">
          {switches.map((flag) => (
            <label
              key={flag.key}
              className="toggle-row"
              data-testid={`flag-${flag.key}`}
            >
              <span>
                <span className="toggle-label">{flag.description}</span>
                <code className="caption">{flag.key}</code>
                <span className="admin-row-state" aria-live="polite">
                  {message(flag.key)}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={flag.description}
                checked={flag.value === true}
                disabled={states[flag.key] === 'busy'}
                onChange={(event) => {
                  void save(flag.key, event.target.checked);
                }}
              />
            </label>
          ))}
        </div>
      </section>
      <section className="admin-section" aria-labelledby="other-flags">
        <h2 id="other-flags">{t(locale, 'admin.otherFlags')}</h2>
        <ul className="admin-flag-list">
          {others.map((flag) => {
            const draft = drafts[flag.key] ?? '';
            const id = `flag-input-${flag.key}`;
            return (
              <li key={flag.key} data-testid={`flag-${flag.key}`}>
                <div className="admin-flag-head">
                  <label className="toggle-label" htmlFor={id}>
                    {flag.description}
                  </label>
                  {flag.placeholder && (
                    <span className="admin-badge">
                      {t(locale, 'admin.placeholder')}
                    </span>
                  )}
                  {flag.public && (
                    <span className="admin-badge">
                      {t(locale, 'admin.public')}
                    </span>
                  )}
                </div>
                <code className="caption">{flag.key}</code>
                <form
                  className="admin-inline-form"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    let value: unknown;
                    if (flag.type === 'number') value = Number(draft);
                    else if (flag.type === 'boolean') value = draft === 'true';
                    else
                      try {
                        value = JSON.parse(draft);
                      } catch {
                        setStates((current) => ({
                          ...current,
                          [flag.key]: 'invalid',
                        }));
                        return;
                      }
                    void save(flag.key, value);
                  }}
                >
                  {flag.type === 'json' ? (
                    <textarea
                      id={id}
                      className="admin-json"
                      rows={2}
                      spellCheck={false}
                      value={draft}
                      onChange={(event) => {
                        setDrafts((current) => ({
                          ...current,
                          [flag.key]: event.target.value,
                        }));
                      }}
                    />
                  ) : (
                    <input
                      id={id}
                      className="admin-number"
                      inputMode={flag.type === 'number' ? 'numeric' : 'text'}
                      value={draft}
                      onChange={(event) => {
                        setDrafts((current) => ({
                          ...current,
                          [flag.key]: event.target.value,
                        }));
                      }}
                    />
                  )}
                  <button
                    className="admin-save"
                    type="submit"
                    disabled={
                      states[flag.key] === 'busy' || draft === show(flag.value)
                    }
                  >
                    {t(locale, 'admin.save')}
                  </button>
                </form>
                <span className="caption">
                  {t(locale, 'admin.default', {
                    value: show(flag.defaultValue),
                  })}
                </span>
                <span className="admin-row-state" aria-live="polite">
                  {message(flag.key)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
