import { useApp } from '../../src/state';
import { Screen, Copy, EmptyState } from '../../src/ui';
export default function Page() {
  const { t } = useApp();
  return (
    <Screen>
      <Copy title testID="explore-screen">
        {t('web.explore')}
      </Copy>
      <EmptyState
        icon="compass-outline"
        title={t('mobile.exploreTitle')}
        body={t('mobile.exploreEmpty')}
      />
    </Screen>
  );
}
