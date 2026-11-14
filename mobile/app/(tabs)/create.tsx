import { useApp } from '../../src/state';
import { Screen, Copy } from '../../src/ui';
export default function Page() {
  const { t } = useApp();
  return (
    <Screen>
      <Copy title testID="create-screen">
        {t('web.create')}
      </Copy>
      <Copy>{t('mobile.createEmpty')}</Copy>
    </Screen>
  );
}
