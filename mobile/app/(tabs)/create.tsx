import { useApp } from '../../src/state';
import { Screen, Copy, EmptyState } from '../../src/ui';
export default function Page() {
  const { t } = useApp();
  return (
    <Screen>
      <Copy title testID="create-screen">
        {t('web.create')}
      </Copy>
      <EmptyState
        icon="musical-note"
        title={t('mobile.createTitle')}
        body={t('mobile.createEmpty')}
      />
    </Screen>
  );
}
