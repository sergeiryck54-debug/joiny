import { Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { I18nProvider } from './lib/i18n';
import { colors } from './lib/theme';
import { UnreadProvider } from './lib/unread';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
  });

  // Hold the (already-shown) splash background until brand fonts are ready,
  // so text doesn't flash in the system font first.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.navy2 }} />;

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
