import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GoogleSignInButton } from 'react-native-nitro-google-signin';
import { apiBaseUrl } from '../../lib/config';
import { createNativeAuthClient } from './client';
import { googleConfig } from './google';
import { nativeGoogleProvider, sessionVault } from './runtime';
import { createNativeAuthStore } from './store';

export function AuthPanel() {
  const store = useMemo(() => {
    try {
      const config = googleConfig(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, Platform.OS);
      const url = apiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__ ? 'development' : 'preview');
      return createNativeAuthStore(createNativeAuthClient(url), nativeGoogleProvider(config), sessionVault);
    } catch {
      // A blocked store never calls any of these dependencies.
      return createNativeAuthStore(createNativeAuthClient(''), { credential: async () => { throw new Error(); }, signOut: async () => {} }, sessionVault, true);
    }
  }, []);
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    void store.restore();
    const subscription = AppState.addEventListener('change', value => { if (value === 'active') void store.restore(); });
    return () => { subscription.remove(); store.dispose(); };
  }, [store]);
  return <View style={styles.card} accessibilityLiveRegion="polite">
    <Text style={styles.title} accessibilityRole="header">Đăng nhập Google</Text>
    <Text style={styles.text}>{state.message}</Text>
    {state.user && <Text style={styles.text}>Tài khoản: {state.user.displayName ?? 'Người dùng GoEase'}{ '\n' }Quyền máy chủ cấp: {state.user.role}</Text>}
    {state.kind === 'signedOut' && <GoogleSignInButton signInBehavior="none" disabled={false} colorScheme="light" onPress={() => store.login()} accessibilityLabel="Đăng nhập bằng Google" size="standard" />}
    {state.kind === 'signingIn' && <Pressable accessibilityRole="button" onPress={store.cancel} style={styles.button}><Text style={styles.buttonText}>Hủy đăng nhập</Text></Pressable>}
    {(state.kind === 'signedIn' || state.kind === 'cleanupRequired') && <Pressable accessibilityRole="button" onPress={() => { void store.logout(); }} style={styles.button}><Text style={styles.buttonText}>{state.kind === 'cleanupRequired' ? 'Thử đăng xuất lại' : 'Đăng xuất GoEase'}</Text></Pressable>}
    {state.kind === 'error' && <Pressable accessibilityRole="button" onPress={() => { void store.restore(); }} style={styles.button}><Text style={styles.buttonText}>Kiểm tra phiên lại</Text></Pressable>}
    <Text style={styles.note}>Phiên được backend xác minh. Health thành công không chứng minh Google login đã đạt; OAuth thật còn cần cấu hình và tài khoản test từng nền tảng.</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 16, borderWidth: 1, borderColor: '#dbe7dc' },
  title: { color: '#17382d', fontSize: 22, fontWeight: '700' }, text: { color: '#40594e', fontSize: 16, lineHeight: 24 },
  note: { color: '#47675b', fontSize: 13, lineHeight: 20 }, button: { backgroundColor: '#12604b', padding: 16, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
