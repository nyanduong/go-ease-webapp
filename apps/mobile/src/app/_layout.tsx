import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QaStorageBanner } from '../features/trips/components/qa-storage-banner';
import { AccountSessionLifecycle } from '../features/trips/account-session';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AccountSessionLifecycle />
      {__DEV__ && <QaStorageBanner />}
      <Stack screenOptions={{ headerTintColor: '#125C46', contentStyle: { backgroundColor: '#F6F8F5' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ title: 'Tài khoản và chuyến server', headerBackTitle: 'Chuyến khách' }} />
        <Stack.Screen name="about" options={{ title: 'Về GoEase', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="storage-check" options={{ title: 'Kiểm tra lưu chuyến', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="catalog-check" options={{ title: 'Kiểm tra catalog API', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="https-check" options={{ title: 'Kiểm tra HTTPS API', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="auth-check" options={{ title: 'Kiểm tra tài khoản GoEase', headerBackTitle: 'Quay lại' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
