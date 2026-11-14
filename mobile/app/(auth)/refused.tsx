import { useApp } from '../../src/state';
import { Screen, Copy, Button } from '../../src/ui';
export default function Refused() {
  const { t, restart } = useApp();
  return (
    <Screen>
      <Copy title>{t('web.refusalTitle')}</Copy>
      <Copy>{t('web.refusal')}</Copy>
      <Button title={t('web.back')} onPress={restart} />
    </Screen>
  );
}
