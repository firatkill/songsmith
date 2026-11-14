import { Stack } from 'expo-router';
import { useApp } from '../../src/state';
export default function Layout() {
  const { stage } = useApp();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {(['sign-in', 'age-gate', 'consent', 'refused'] as const).map((name) => (
        <Stack.Protected key={name} guard={stage === name}>
          <Stack.Screen name={name} />
        </Stack.Protected>
      ))}
    </Stack>
  );
}
