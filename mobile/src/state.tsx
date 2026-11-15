import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import {
  formatMessage,
  type Locale,
  type MessageKey,
  type MessageValues,
} from '@songsmith/i18n';
import { meResponseSchema, errorResponseSchema, type z } from './validation';
import { auth } from './auth/client';
import { gateStage, type Stage } from './auth/gate';
import { api } from './api';
import { selectLocale } from './i18n';
import { parseAppearance, type Appearance } from '@songsmith/ui-tokens';
type Me = z.infer<typeof meResponseSchema>;
interface State {
  appearance: Appearance;
  appearanceReady: boolean;
  setAppearance: (value: Appearance) => Promise<void>;
  email: string;
  locale: Locale;
  t: (key: MessageKey, values?: MessageValues) => string;
  setLocale: (locale: Locale) => Promise<void>;
  stage: Stage;
  me: Me | null;
  loading: boolean;
  initialized: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  refuse: () => Promise<void>;
  signOut: () => Promise<void>;
  restart: () => void;
}
const Context = createContext<State | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(
    selectLocale(null, getLocales()[0].languageCode ?? null),
  );
  const [appearance, updateAppearance] = useState<Appearance>('system');
  const [appearanceReady, setAppearanceReady] = useState(false);
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('sign-in');
  const [me, setMe] = useState<Me | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refused = useRef(false);
  const generation = useRef(0);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  async function refresh() {
    const current = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const { data, error: sessionError } = await auth.getSession();
      if (sessionError) throw sessionError;
      let next: Me | null = null;
      let signedIn = Boolean(data.session);
      if (signedIn) {
        const result = await api(localeRef.current).GET('/v1/me');
        if (result.error) {
          const parsed = errorResponseSchema.parse(result.error);
          if (current !== generation.current) return;
          if (parsed.error.code === 'UNAUTHENTICATED') {
            await auth.signOut({ scope: 'local' });
            signedIn = false;
          } else if (parsed.error.code === 'NOT_ADULT') {
            setInitialized(true);
            setStage('age-gate');
            return;
          } else if (parsed.error.code === 'CONSENT_REQUIRED') {
            setInitialized(true);
            setStage('consent');
            return;
          } else throw new Error(parsed.error.code);
        } else next = meResponseSchema.parse(result.data);
      }
      if (current !== generation.current) return;
      setInitialized(true);
      setEmail(data.session?.user.email ?? '');
      setMe(next);
      setStage(gateStage(signedIn, next, refused.current));
    } catch {
      if (current === generation.current) setError(true);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void SecureStore.getItemAsync('songsmith.appearance')
      .then((saved) => {
        updateAppearance(parseAppearance(saved));
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setAppearanceReady(true);
      });
    void SecureStore.getItemAsync('songsmith.locale')
      .then((saved) => {
        updateLocale(selectLocale(saved, getLocales()[0].languageCode ?? null));
      })
      .catch(() => {
        setError(true);
      });
    // Supabase callbacks must not await auth methods while its internal lock is held.
    const { data } = auth.onAuthStateChange(() => {
      setTimeout(() => {
        void refresh();
      }, 0);
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void auth.startAutoRefresh();
        void refresh();
      } else void auth.stopAutoRefresh();
    });
    void auth.startAutoRefresh();
    void refresh();
    return () => {
      generation.current++;
      data.subscription.unsubscribe();
      subscription.remove();
      void auth.stopAutoRefresh();
    };
  }, []);
  async function signOut() {
    const result = await auth.signOut({ scope: 'local' });
    if (result.error) throw result.error;
    setEmail('');
    setMe(null);
    setStage(refused.current ? 'refused' : 'sign-in');
  }
  return (
    <Context.Provider
      value={{
        appearance,
        appearanceReady,
        email,
        setAppearance: async (value) => {
          await SecureStore.setItemAsync('songsmith.appearance', value);
          updateAppearance(value);
        },
        locale,
        t: (key, values) => formatMessage(locale, key, values),
        stage,
        me,
        loading,
        initialized,
        error,
        refresh,
        setLocale: async (value) => {
          await SecureStore.setItemAsync('songsmith.locale', value);
          updateLocale(value);
        },
        signOut,
        refuse: async () => {
          refused.current = true;
          setStage('refused');
          await signOut();
        },
        restart: () => {
          refused.current = false;
          setStage('sign-in');
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const state = useContext(Context);
  if (!state) throw new Error('Missing app provider');
  return state;
}
