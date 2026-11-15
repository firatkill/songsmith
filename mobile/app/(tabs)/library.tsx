import { useApp } from '../../src/state';
import { Screen, Copy, EmptyState } from '../../src/ui';
export default function Page() {
  const { t } = useApp();
  return (
    <Screen>
      <Copy title testID="library-screen">
        {t('web.library')}
      </Copy>
      <EmptyState
        icon="albums-outline"
        title={t('mobile.libraryTitle')}
        body={t('mobile.libraryEmpty')}
      />
    </Screen>
  );
}
