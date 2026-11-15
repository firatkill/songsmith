import { useApp } from '../../src/state';
import { Screen, Copy, LinkButton } from '../../src/ui';
export default function Refused() {
  const { t, restart } = useApp();
  return (
    <Screen>
      <Copy title>{t('web.refusalTitle')}</Copy>
      <Copy>{t('web.refusal')}</Copy>
      <LinkButton title={t('ui.backSignIn')} onPress={restart} />
    </Screen>
  );
}
