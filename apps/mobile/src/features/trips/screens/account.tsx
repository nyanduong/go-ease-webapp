import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { accountSession, accountTrips, useAccount } from '../account-session';
import { useLocalTrips } from '../local-trip-store';
import { Action, ConfirmDialog, styles } from '../components/ui';
import { AccountEditor } from '../components/account-editor';
import { AccountNewTrip } from '../components/account-new-trip';
import { randomUUID } from 'expo-crypto';
import type { Trip } from '@goease/contracts';

export default function AccountScreen() {
  const { session, trips } = useAccount();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => { if (next !== 'active') { setEmail(''); setPassword(''); } });
    if (Platform.OS !== 'web' && accountSession.snapshot().phase !== 'backend-verified') void accountSession.restore();
    return () => { sub.remove(); };
  }, []);
  if (Platform.OS === 'web') return <SafeAreaView style={styles.page}><Text style={styles.text}>Đăng nhập và lưu chuyến tài khoản hiện chạy trên Expo Go Android/iPhone với SecureStore.</Text></SafeAreaView>;
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.heading}>Tài khoản GoEase</Text>
        <Text style={styles.text}>Chuyến server thuộc tài khoản đã đăng nhập. Chuyến khách trên thiết bị được giữ riêng; chỉ nhập khi bạn xác nhận.</Text>
        {session.phase !== 'backend-verified' && <>
          <TextInput accessibilityLabel="Email GoEase" placeholder="Email GoEase" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} editable={!session.busy} maxLength={254} style={[styles.card, styles.text]} />
          <TextInput accessibilityLabel="Mật khẩu GoEase" placeholder="Mật khẩu" secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!session.busy} maxLength={256} style={[styles.card, styles.text]} />
          <Action title="Đăng nhập" disabled={session.busy} onPress={() => { const value = password; setPassword(''); void accountSession.login(email.trim(), value); }} />
          <Action title="Khôi phục phiên và bản nháp tài khoản" secondary disabled={session.busy} onPress={() => { setPassword(''); void accountSession.restore(); }} />
        </>}
        {session.busy && <><ActivityIndicator accessibilityLabel="Đang xác minh tài khoản" /><Action title="Hủy chờ / ẩn phiên" secondary onPress={() => { setPassword(''); accountSession.cancel(); }} /></>}
        <Text accessibilityLiveRegion="polite" style={styles.text}>{session.message}</Text>
        {session.userId && <Text selectable style={styles.text}>Tài khoản: {session.userId}</Text>}
        {session.phase==='backend-verified' && <Action title="Cập nhật catalog và xác minh lại phiên" secondary disabled={session.busy||trips.busy} onPress={()=>{void accountSession.restore();}} />}
        {session.phase === 'backend-verified' && !trips.ready && <Action title="Thử khôi phục lại kho bản nháp tài khoản" secondary disabled={session.busy || trips.busy} onPress={() => { void accountSession.restore(); }} />}
        <Action title="Đăng xuất / đổi tài khoản" secondary disabled={session.busy || trips.busy} onPress={() => { setEmail(''); setPassword(''); void accountSession.logout(); }} />
        {session.phase === 'backend-verified' && trips.owner && <Workspace key={trips.owner} />}
        <Text style={styles.text}>Khi hết phiên hoặc xuống nền, dữ liệu riêng được ẩn. Đăng nhập/khôi phục đúng tài khoản để mở bản nháp đã áp dụng và yêu cầu đang chờ trên thiết bị này. Chưa có đồng bộ nền; bấm tải lại để xem thay đổi từ máy khác.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
function Workspace() {
  const { trips, catalog } = useAccount(); const { state: guest } = useLocalTrips();
  const [creating, setCreating] = useState(false), [importing, setImporting] = useState<Trip | null>(null);
  const [message, setMessage] = useState('');
  const blocked = trips.busy || !trips.ready, locked = blocked || !!trips.draft || !!trips.pending;
  async function start(input: Trip) {
    try { await accountTrips.begin(input); setCreating(false); setImporting(null); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Chưa tạo được bản nháp.'); }
  }
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={styles.heading}>Chuyến trên server</Text>
    <Text accessibilityLiveRegion="polite" style={trips.conflict ? styles.error : styles.text}>{trips.message}</Text>
    {message ? <Text style={styles.error}>{message}</Text> : null}
    {trips.busy && <ActivityIndicator accessibilityLabel="Đang xử lý chuyến server" />}
    <Action title="Tải lại danh sách server" disabled={blocked} onPress={() => { void accountTrips.list(); }} />
    {!!trips.cursor && <Action title="Xem thêm chuyến server" secondary disabled={blocked} onPress={() => { void accountTrips.list(true); }} />}
    {!trips.items.length && trips.ready && <Text style={styles.text}>Danh sách hiện chưa có chuyến. Tải lại sau khi lưu để cập nhật.</Text>}
    {trips.items.map(item => <View key={item.id} style={styles.card}>
      <Text style={styles.heading}>{item.name}</Text><Text style={styles.text}>{item.startDate} · {item.durationDays} ngày · {item.people} người · v{item.version}</Text>
      <Action title={`Mở chuyến server: ${item.name}`} disabled={locked} onPress={() => { void accountTrips.read(item.id); }} />
    </View>)}
    {trips.ready && !creating && <Action title="+ Tạo chuyến mới trên tài khoản" disabled={locked} onPress={() => setCreating(true)} />}
    {creating && <AccountNewTrip disabled={locked} onCreate={start} onCancel={() => setCreating(false)} catalog={catalog.filter(p=>p.enabled).map(p=>p.entry)} />}
    {trips.ready && !trips.draft && !trips.pending && <View style={styles.card}>
      <Text style={styles.heading}>Nhập chuyến khách</Text><Text style={styles.text}>Chọn một chuyến trên máy. Bản sao có ID mới và chỉ gửi lên tài khoản khi bạn bấm Lưu server; bản khách giữ nguyên.</Text>
      {guest.loadStatus !== 'ready' && <Text style={styles.text}>Chưa đọc được chuyến khách. Quay về danh sách khách để tải lại.</Text>}
      {guest.trips.map(saved => <Action key={saved.trip.id} title={`Nhập bản sao: ${saved.trip.name}`} secondary disabled={locked || guest.loadStatus !== 'ready' || !!guest.issues.length} onPress={() => setImporting(saved.trip)} />)}
    </View>}
    {(trips.selected || trips.draft || trips.pending) && <AccountEditor key={trips.draft?.trip.id ?? trips.selected?.trip.id ?? 'pending'} />}
    <ConfirmDialog visible={!!importing} title="Nhập chuyến khách vào tài khoản này?" message={`Tạo bản sao “${importing?.name ?? ''}” cho tài khoản ${trips.owner?.slice(21)}. Chuyến khách giữ nguyên. Bạn có thể xem/sửa bản nháp trước khi gửi server.`} confirm="Tạo bản nháp tài khoản" busy={blocked} onCancel={() => setImporting(null)} onConfirm={() => { if (importing) void start({ ...importing, id: randomUUID() }); }} />
  </View>;
}
