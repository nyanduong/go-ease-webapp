import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { apiBaseUrl } from './src/lib/config';
import { createHealthClient } from './src/lib/health';
import { createHealthStore } from './src/features/health/store';
import { AuthPanel } from './src/features/auth/panel';

function HealthScreen() {
  const setup = useMemo(() => {
    try {
      const url = apiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__ ? 'development' : 'preview');
      return { url, store: createHealthStore(createHealthClient(url)) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cấu hình API không hợp lệ.';
      return { url: '', message, store: createHealthStore(async () => { throw new Error(message); }) };
    }
  }, []);
  const state = useSyncExternalStore(setup.store.subscribe, setup.store.snapshot);
  useEffect(() => { void setup.store.retry(); return setup.store.cancel; }, [setup]);
  const title = state.kind === 'loading' ? 'Đang kết nối API…' : state.kind === 'success' ? 'API đang hoạt động' : 'Chưa kết nối được API';
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>GoEase</Text>
        <Text style={styles.eyebrow}>KIỂM TRA KỸ THUẬT M0</Text>
        <Text style={styles.heading}>Nền app cho những chuyến đi</Text>
        <Text style={styles.description}>Một codebase Android và iOS. Màn kỹ thuật kiểm tra đăng nhập và kết nối API; chưa có lịch trình.</Text>
        <AuthPanel />
        <View style={styles.card} accessibilityLiveRegion="polite">
          {state.kind === 'loading' && <ActivityIndicator size="large" color="#12604b" accessibilityLabel="Đang kiểm tra kết nối" />}
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <Text style={styles.description}>{setup.message ?? (state.kind === 'success' ? 'Đã nhận phản hồi health hợp lệ từ máy chủ.' : state.kind === 'error' ? state.message : 'Đang chờ phản hồi. Không tự gửi lại vô hạn.')}</Text>
          <Text style={styles.label}>Địa chỉ API công khai</Text>
          <Text selectable style={styles.endpoint}>{setup.url || 'Chưa cấu hình'}</Text>
          {state.kind === 'success' && <Text style={styles.description}>Phạm vi: {state.health.scope}{'\n'}Thời điểm máy chủ (UTC): {state.health.timestamp}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="Kiểm tra lại kết nối API" disabled={state.kind === 'loading'}
            onPress={() => { void setup.store.retry(); }} style={({ pressed }) => [styles.button, state.kind === 'loading' && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>{state.kind === 'loading' ? 'Đang kiểm tra…' : 'Thử lại'}</Text>
          </Pressable>
        </View>
        <Text style={styles.note}>Development build phục vụ kiểm chứng native. Bản preview cuối cần HTTPS staging, mở được khi Metro đã tắt. Google login thật, AI và bản đồ cần bằng chứng riêng.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
export default function App() { return <SafeAreaProvider><HealthScreen /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7f2' },
  content: { padding: 24, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' },
  brand: { color: '#12604b', fontSize: 28, fontWeight: '800' },
  eyebrow: { color: '#47675b', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  heading: { color: '#17382d', fontSize: 30, fontWeight: '700' },
  description: { color: '#40594e', fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 16, borderWidth: 1, borderColor: '#dbe7dc' },
  title: { color: '#17382d', fontSize: 22, fontWeight: '700' },
  label: { color: '#40594e', fontSize: 13, fontWeight: '600' },
  endpoint: { color: '#17382d', fontSize: 14 },
  button: { backgroundColor: '#12604b', padding: 16, borderRadius: 12, minHeight: 52, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.55 }, pressed: { opacity: 0.8 },
  note: { color: '#47675b', fontSize: 13, lineHeight: 20 },
});
