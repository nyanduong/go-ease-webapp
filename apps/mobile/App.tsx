import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { apiBaseUrl } from './src/lib/config';
import { createHealthClient } from './src/lib/health';
import { createHealthStore } from './src/features/health/store';
import { AuthPanel } from './src/features/auth/panel';
import { NativeAuthProvider } from './src/features/auth/context';
import { MapsPanel } from './src/features/maps/panel';
import { TripsPanel } from './src/features/trips/panel';
import { colors, radius, space, typography } from './src/ui/theme';

function HealthScreen({ onBack }: { onBack: () => void }) {
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
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>GoEase</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Về chuyến đi" onPress={onBack} style={styles.button}><Text style={styles.buttonText}>Về chuyến đi</Text></Pressable>
        <Text style={styles.eyebrow}>KIỂM TRA KỸ THUẬT M0</Text>
        <Text style={styles.heading}>Nền app cho những chuyến đi</Text>
        <Text style={styles.description}>Một codebase Android và iOS. Màn này kiểm tra đăng nhập và kết nối API; lịch trình ở mục Chuyến đi.</Text>
        <AuthPanel />
        <View style={styles.card} accessibilityLiveRegion="polite">
          {state.kind === 'loading' && <ActivityIndicator size="large" color={colors.teal} accessibilityLabel="Đang kiểm tra kết nối" />}
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
        <MapsPanel />
        <Text style={styles.note}>Development build phục vụ kiểm chứng native. Bản preview cuối cần HTTPS staging, mở được khi Metro đã tắt. Google login thật, AI và bản đồ cần bằng chứng riêng.</Text>
      </ScrollView>
    </View>
  );
}
function AppScreens() {
  const [technical, setTechnical] = useState(false);
  useEffect(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (!technical) return false; setTechnical(false); return true; }); return () => subscription.remove(); }, [technical]);
  // Keep the trip RAM bucket mounted while visiting technical checks.
  return <SafeAreaView style={styles.safe}><View style={[styles.safe, technical && { display: 'none' }]}><TripsPanel active={!technical} onTechnical={() => setTechnical(true)} /></View>{technical && <HealthScreen onBack={() => setTechnical(false)} />}</SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><NativeAuthProvider><AppScreens /></NativeAuthProvider></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: space.xl, gap: space.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  brand: { color: colors.teal, fontSize: 28, fontWeight: '800' },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  heading: { color: colors.ink, fontSize: 30, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: colors.white, borderRadius: radius.card, padding: space.xl, gap: space.lg, borderWidth: 1, borderColor: colors.line },
  title: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  endpoint: { color: colors.ink, fontSize: 14 },
  button: { backgroundColor: colors.teal, padding: 16, borderRadius: radius.button, minHeight: 52, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.55 }, pressed: { backgroundColor: colors.tealPressed },
  note: { color: colors.muted, ...typography.small },
});
