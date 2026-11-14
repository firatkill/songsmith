import { useApp } from '../../src/state';
import { Screen, Copy } from '../../src/ui';
export default function Page() {
  const { t } = useApp();
  return (
    <Screen>
      <Copy title testID="library-screen">
        {t('web.library')}
      </Copy>
      <Copy>{t('mobile.libraryEmpty')}</Copy>
    </Screen>
  );
}
