'use client';
import { useState } from 'react';
import { formatMessage as t, type Locale } from '@songsmith/i18n';
import type { Appearance } from '@songsmith/ui-tokens';
import { appearanceAttribute, appearanceCookie } from '../lib/appearance';
export function AppearanceSetting({
  locale,
  initial,
}: {
  locale: Locale;
  initial: Appearance;
}) {
  const [preference, setPreference] = useState(initial);
  return (
    <fieldset className="appearance-setting">
      <legend>{t(locale, 'ui.appearance')}</legend>
      <div className="segmented-control">
        {(['system', 'light', 'dark'] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="appearance"
              value={value}
              checked={preference === value}
              onChange={() => {
                document.cookie = appearanceCookie(
                  value,
                  location.protocol === 'https:',
                );
                const theme = appearanceAttribute(value);
                if (theme) document.documentElement.dataset.theme = theme;
                else delete document.documentElement.dataset.theme;
                setPreference(value);
              }}
            />
            <span>{t(locale, `ui.${value}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
