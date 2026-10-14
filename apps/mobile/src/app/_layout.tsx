import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QaStorageBanner } from '../features/trips/components/qa-storage-banner';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {__DEV__ && <QaStorageBanner />}
      <Stack screenOptions={{ headerTintColor: '#125C46', contentStyle: { backgroundColor: '#F6F8F5' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="about" options={{ title: 'Về GoEase', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="storage-check" options={{ title: 'Kiểm tra lưu chuyến', headerBackTitle: 'Quay lại' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
