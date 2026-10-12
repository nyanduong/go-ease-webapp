import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { GoogleSignInButton } from 'react-native-nitro-google-signin';
import { useNativeAuth } from './context';
import { colors, radius, space, typography } from '../../ui/theme';

export function AuthPanel() {
  const { store, state } = useNativeAuth();
  return <View style={styles.card} accessibilityLiveRegion="polite">
    <Text style={styles.title} accessibilityRole="header">{state.kind === 'signedIn' ? 'Tài khoản của bạn' : 'Đăng nhập Google'}</Text>
    <Text style={styles.text}>{state.message}</Text>
    {state.user && <Text style={styles.text}>Tài khoản: {state.user.displayName ?? 'Người dùng GoEase'}{ '\n' }Quyền máy chủ cấp: {state.user.role}</Text>}
    {state.kind === 'signedOut' && <GoogleSignInButton signInBehavior="none" disabled={false} colorScheme="light" onPress={() => store.login()} accessibilityLabel="Đăng nhập bằng Google" size="standard" />}
    {state.kind === 'signingIn' && <Pressable accessibilityRole="button" onPress={store.cancel} style={styles.button}><Text style={styles.buttonText}>Hủy đăng nhập</Text></Pressable>}
    {(state.kind === 'signedIn' || state.kind === 'cleanupRequired') && <Pressable accessibilityRole="button" onPress={() => {
      const capturedUser = state.user?.id;
      Alert.alert('Đăng xuất GoEase?', 'Bản nháp và bản gửi chưa xác nhận chỉ ở RAM, sẽ bị xóa khi đăng xuất hoàn tất. Các chuyến đã lưu trên máy chủ vẫn còn.', [
        { text: 'Ở lại', style: 'cancel' }, { text: 'Đăng xuất', style: 'destructive', onPress: () => { if (store.snapshot().user?.id === capturedUser) void store.logout(); } },
      ]);
    }} style={styles.button}><Text style={styles.buttonText}>{state.kind === 'cleanupRequired' ? 'Thử đăng xuất lại' : 'Đăng xuất GoEase'}</Text></Pressable>}
    {state.kind === 'error' && <Pressable accessibilityRole="button" onPress={() => { void store.restore(); }} style={styles.button}><Text style={styles.buttonText}>Kiểm tra phiên lại</Text></Pressable>}
    <Text style={styles.note}>Phiên được backend xác minh. Health thành công không chứng minh Google login đã đạt; OAuth thật còn cần cấu hình và tài khoản test từng nền tảng.</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.card, padding: space.xl, gap: space.lg, borderWidth: 1, borderColor: colors.line },
  title: { ...typography.title, color: colors.ink }, text: { ...typography.body, color: colors.muted },
  note: { ...typography.small, color: colors.muted }, button: { backgroundColor: colors.teal, padding: space.md, borderRadius: radius.button, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...typography.body, color: colors.white, fontWeight: '700' },
});
