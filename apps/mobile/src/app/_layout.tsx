import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QaStorageBanner } from '../features/trips/components/qa-storage-banner';
import { AccountSessionLifecycle } from '../features/trips/account-session';
import { colors } from '../features/trips/components/ui';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AccountSessionLifecycle />
      {__DEV__ && <QaStorageBanner />}
      <Stack screenOptions={{ headerTintColor: colors.tealDark, headerStyle: { backgroundColor: colors.cream }, headerShadowVisible: false, headerTitleAlign: 'center', headerTitleStyle: { fontSize: 17, fontWeight: '700', color: colors.ink }, contentStyle: { backgroundColor: colors.cream } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ title: 'Tài khoản', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="travel-services" options={{ title: 'Chỗ nghỉ & chuyến bay', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="about" options={{ title: 'Về GoEase', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="storage-check" options={{ title: 'Kiểm tra lưu chuyến', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="catalog-check" options={{ title: 'Kiểm tra catalog API', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="https-check" options={{ title: 'Kiểm tra HTTPS API', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="auth-check" options={{ title: 'Kiểm tra tài khoản GoEase', headerBackTitle: 'Quay lại' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
