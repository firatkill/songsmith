import { useApp } from '../../src/state';
import { Screen, Copy } from '../../src/ui';
export default function Page() {
  const { t } = useApp();
  return (
    <Screen>
      <Copy title testID="explore-screen">
        {t('web.explore')}
      </Copy>
      <Copy>{t('mobile.exploreEmpty')}</Copy>
    </Screen>
  );
}
