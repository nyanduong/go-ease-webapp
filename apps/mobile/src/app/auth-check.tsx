import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Platform, ScrollView, Text, TextInput } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createAuthPilot, type AuthPilotState } from '@/features/trips/auth-pilot-controller';
import { Action, styles } from '@/features/trips/components/ui';
import { ServerTripPilot } from '@/features/trips/components/server-trip-pilot';

function AuthCheck() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [state, setState] = useState<AuthPilotState>({ busy: false, phase: 'signed-out', userId: null, message: 'Bấm Khôi phục để kiểm tra credential đã lưu, hoặc đăng nhập user thử.' });
  const mounted = useRef(false);
  const pilot = useRef<ReturnType<typeof createAuthPilot> | null>(null);
  if (pilot.current == null) {
    const storageKey = `goease.auth-pilot.${process.env.EXPO_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? 'unconfigured'}.refresh`;
    const nativeOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
    const native = () => { if (Platform.OS === 'web') throw new Error('Native SecureStore required'); };
    pilot.current = createAuthPilot({
      url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      storage: {
        async get() { native(); return SecureStore.getItemAsync(storageKey, nativeOptions); },
        async set(value) { native(); await SecureStore.setItemAsync(storageKey, value, nativeOptions); },
        async remove() { native(); await SecureStore.deleteItemAsync(storageKey, nativeOptions); },
      },
      onChange: (next) => { if (mounted.current) setState(next); },
    });
  }
  useFocusEffect(useCallback(() => {
    mounted.current = true; setState(pilot.current!.snapshot());
    const clear = () => { setEmail(''); setPassword(''); pilot.current!.cancel(); };
    const subscription = AppState.addEventListener('change', (next) => { if (next !== 'active') clear(); });
    const timer = setInterval(() => { if (mounted.current) setState(pilot.current!.snapshot()); }, 1000);
    return () => { clear(); mounted.current = false; subscription.remove(); clearInterval(timer); };
  }, []));
  if (Platform.OS === 'web') return <SafeAreaView style={styles.page}><Text style={styles.text}>Pilot credential storage chỉ chạy trên Expo Go Android/iPhone. Không dùng localStorage hoặc AsyncStorage thay SecureStore.</Text></SafeAreaView>;
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.heading}>Kiểm tra tài khoản GoEase (dev)</Text>
    <Text style={styles.text}>Dùng hai user thử Supabase, khác tài khoản Expo và tài khoản quản trị. Email/mật khẩu chỉ gửi trực tiếp tới project Supabase qua HTTPS; không gửi mật khẩu tới backend GoEase.</Text>
    <Text style={styles.text}>Project: {process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'Chưa cấu hình'}</Text>
    <TextInput accessibilityLabel="Email user thử GoEase" placeholder="Email user thử GoEase" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} value={email} onChangeText={setEmail} editable={!state.busy} style={styles.input} />
    <TextInput accessibilityLabel="Mật khẩu user thử GoEase" placeholder="Mật khẩu user thử GoEase" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={256} value={password} onChangeText={setPassword} editable={!state.busy} style={styles.input} />
    <Action title="Đăng nhập user thử" disabled={state.busy} onPress={() => { const submitted = password; setPassword(''); void pilot.current!.login(email.trim(), submitted); }} />
    <Action title="Khôi phục / refresh và xác minh" secondary disabled={state.busy} onPress={() => { setPassword(''); void pilot.current!.restore(); }} />
    <Action title="Đăng xuất phiên này" secondary disabled={state.busy} onPress={() => { setEmail(''); setPassword(''); void pilot.current!.logout(); }} />
    {state.busy && <Action title="Hủy Auth" secondary onPress={() => { setPassword(''); pilot.current!.cancel(); }} />}
    <Action title="Xác minh qua backend GoEase" disabled={state.busy || !state.userId || !process.env.EXPO_PUBLIC_AUTH_API_BASE_URL} onPress={() => { void pilot.current!.verifyBackend(process.env.EXPO_PUBLIC_AUTH_API_BASE_URL); }} />
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.phase} · {state.message}</Text>
    {state.userId && <Text selectable style={styles.text}>UUID đã xác minh: {state.userId}</Text>}
    {state.userId && state.phase === 'backend-verified' && <ServerTripPilot key={state.userId} identity={state.userId} verified busy={state.busy} onRequest={(operation) => pilot.current!.serverTrips(operation)} />}
    <Text style={styles.text}>Chỉ refresh credential được lưu trong SecureStore; access token ở RAM. Rời màn/xuống nền sẽ bỏ phiên RAM. Đây là pilot, không đăng nhập sản phẩm hoặc gắn chuyến khách vào user. Nút backend cần HTTPS auth riêng được cấp phép; mã phiên AI và QR Metro không dùng thay thế.</Text>
  </ScrollView></SafeAreaView>;
}
export default function AuthCheckRoute() { return __DEV__ ? <AuthCheck /> : <Redirect href="/" />; }
