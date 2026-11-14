import { Redirect } from 'expo-router';
import { useApp } from '../src/state';
export default function Index() {
  const { stage } = useApp();
  return (
    <Redirect
      href={stage === 'ready' ? '/(tabs)/create' : `/(auth)/${stage}`}
    />
  );
}
