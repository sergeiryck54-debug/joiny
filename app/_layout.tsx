import { Stack } from 'expo-router';
import { I18nProvider } from './lib/i18n';
import { UnreadProvider } from './lib/unread';

export default function RootLayout() {
  return (
    <I18nProvider>
      <UnreadProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </UnreadProvider>
    </I18nProvider>
  );
}
