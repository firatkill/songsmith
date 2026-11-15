import { useState } from 'react';
import { Platform } from 'react-native';
import { consentVersions, type ConsentKind } from '../../src/validation';
import { useApp } from '../../src/state';
import { api } from '../../src/api';
import { errorCode, errorMessage } from '../../src/errors';
import {
  Screen,
  Copy,
  PrimaryButton,
  ErrorNotice,
  Group,
  ToggleRow,
  LinkButton,
} from '../../src/ui';
import { missingConsents } from '../../src/ui/logic';
const kinds: ConsentKind[] = [
  'terms',
  'privacy',
  'ai_disclosure',
  'marketing',
  'analytics',
];
export default function Consent() {
  const { t, locale, refresh } = useApp();
  const [selected, setSelected] = useState<Record<ConsentKind, boolean>>({
    terms: false,
    privacy: false,
    ai_disclosure: false,
    marketing: false,
    analytics: false,
  });
  const [expanded, setExpanded] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const missing = missingConsents(selected);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    setAttempted(true);
    if (missing.length) {
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (const kind of kinds) {
        const result = await api(locale).POST('/v1/me/consents', {
          body: {
            kind,
            version: consentVersions[kind],
            granted: selected[kind],
            source: Platform.OS === 'ios' ? 'ios' : 'android',
          },
        });
        if (result.error) {
          if (
            ['UNAUTHENTICATED', 'NOT_ADULT'].includes(errorCode(result.error))
          )
            await refresh();
          else setError(errorMessage(locale, result.error));
          return;
        }
      }
      await refresh();
    } catch {
      setError(t('errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      footer={
        <>
          <ErrorNotice
            message={attempted && missing.length ? t('ui.consentError') : error}
          />
          <PrimaryButton
            testID="submit-consent"
            title={t('ui.accept')}
            busy={busy}
            onPress={() => {
              void submit();
            }}
          />
        </>
      }
    >
      <Copy title>{t('web.consentTitle')}</Copy>
      <Copy>{t('ui.consentHelp')}</Copy>
      <LinkButton
        title={t('ui.disclosure')}
        expanded={expanded}
        onPress={() => {
          setExpanded(!expanded);
        }}
      />
      {expanded && (
        <>
          <Copy variant="caption">{t('web.provisional')}</Copy>
          <Copy variant="caption">{t('web.disclosure')}</Copy>
        </>
      )}
      <Group required>
        {kinds.slice(0, 3).map((kind) => (
          <ToggleRow
            key={kind}
            testID={`consent-${kind}`}
            label={t(`ui.${kind}`)}
            caption={t('ui.required')}
            value={selected[kind]}
            invalid={attempted && !selected[kind]}
            onChange={() => {
              if (!busy) setSelected({ ...selected, [kind]: !selected[kind] });
            }}
          />
        ))}
      </Group>
      <Copy variant="overline">{t('ui.optional')}</Copy>
      <Group>
        {kinds.slice(3).map((kind) => (
          <ToggleRow
            key={kind}
            testID={`consent-${kind}`}
            label={t(`ui.${kind}`)}
            value={selected[kind]}
            invalid={false}
            onChange={() => {
              if (!busy) setSelected({ ...selected, [kind]: !selected[kind] });
            }}
          />
        ))}
      </Group>
    </Screen>
  );
}
