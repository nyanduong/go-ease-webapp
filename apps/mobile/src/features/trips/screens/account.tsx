import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { accountSession, accountTrips, useAccount } from '../account-session';
import { useLocalTrips } from '../local-trip-store';
import { Action, Badge, ConfirmDialog, dateLabel, Disclosure, Icon, SectionTitle, styles } from '../components/ui';
import { Brand } from '../components/brand';
import { AccountEditor } from '../components/account-editor';
import { AccountNewTrip } from '../components/account-new-trip';
import { randomUUID } from 'expo-crypto';
import type { Trip } from '@goease/contracts';
import { useKeyboardScroll } from '../components/use-keyboard-scroll';

export default function AccountScreen() {
  const { session, trips } = useAccount();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const scroll = useRef<ScrollView>(null);
  useKeyboardScroll(scroll);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => { if (next !== 'active') { setEmail(''); setPassword(''); } });
    if (Platform.OS !== 'web' && accountSession.snapshot().phase !== 'backend-verified') void accountSession.restore();
    return () => { sub.remove(); };
  }, []);
  if (Platform.OS === 'web') return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}><ScrollView contentContainerStyle={styles.content}><Brand slogan /><View style={[styles.card, { paddingVertical: 28, alignItems: 'center' }]}><Icon name="phone-portrait-outline" size={36} /><Text style={styles.sectionTitle}>Tài khoản trên điện thoại</Text><Text style={[styles.text, { textAlign: 'center' }]}>Mở GoEase trong Expo Go trên Android hoặc iPhone để đăng nhập và lưu chuyến vào tài khoản. Phiên đăng nhập được bảo vệ bằng SecureStore.</Text></View><View style={styles.notice}><Text style={styles.text}>Bạn vẫn có thể tạo và chỉnh sửa chuyến khách trên trình duyệt. Các chuyến này được lưu riêng trên thiết bị.</Text></View></ScrollView></SafeAreaView>;
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Brand slogan />
        <View style={{ gap: 7 }}><Text accessibilityRole="header" style={styles.heading}>{session.phase === 'backend-verified' ? 'Góc hành trình của bạn' : 'Chào mừng bạn trở lại'}</Text><Text style={styles.text}>Đăng nhập để quản lý chuyến của tài khoản. Chuyến khách trên máy vẫn được giữ riêng.</Text></View>
        {session.phase !== 'backend-verified' && <View style={styles.card}>
          <SectionTitle title="Đăng nhập GoEase" icon="person-circle-outline" />
          <View style={{ gap: 7 }}><Text style={styles.label}>Email</Text><TextInput accessibilityLabel="Email GoEase" placeholder="ban@example.com" placeholderTextColor="#8A9899" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} editable={!session.busy} maxLength={254} style={styles.input} /></View>
          <View style={{ gap: 7 }}><Text style={styles.label}>Mật khẩu</Text><TextInput accessibilityLabel="Mật khẩu GoEase" placeholder="Nhập mật khẩu" placeholderTextColor="#8A9899" secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!session.busy} maxLength={256} style={styles.input} /></View>
          <Action title="Đăng nhập" icon="arrow-forward" disabled={session.busy} onPress={() => { const value = password; setPassword(''); void accountSession.login(email.trim(), value); }} />
          <Action title="Khôi phục phiên" secondary disabled={session.busy} onPress={() => { setPassword(''); void accountSession.restore(); }} />
        </View>}
        {session.busy && <><ActivityIndicator accessibilityLabel="Đang xác minh tài khoản" /><Action title="Hủy chờ / ẩn phiên" secondary onPress={() => { setPassword(''); accountSession.cancel(); }} /></>}
        {!!session.message && <View style={styles.notice}><Text accessibilityLiveRegion="polite" style={styles.text}>{session.message}</Text></View>}
        {session.userId && <View style={styles.card}><Badge>Phiên tài khoản</Badge><Text selectable style={styles.caption}>ID: {session.userId}</Text>
          {session.phase==='backend-verified' && <Action title="Làm mới phiên và danh mục" icon="refresh-outline" secondary disabled={session.busy||trips.busy} onPress={()=>{void accountSession.restore();}} />}
          {session.phase === 'backend-verified' && !trips.ready && <Action title="Khôi phục bản nháp" secondary disabled={session.busy || trips.busy} onPress={() => { void accountSession.restore(); }} />}
          <Action title="Đăng xuất" icon="log-out-outline" secondary disabled={session.busy || trips.busy} onPress={() => { setEmail(''); setPassword(''); void accountSession.logout(); }} />
        </View>}
        {session.phase === 'backend-verified' && trips.owner && <Workspace key={trips.owner} />}
        <Disclosure title="Phiên và dữ liệu của bạn"><Text style={styles.text}>Khi hết phiên hoặc app xuống nền, dữ liệu riêng được ẩn. Đăng nhập hoặc khôi phục đúng tài khoản để mở bản nháp đã áp dụng và yêu cầu đang chờ.</Text><Text style={styles.caption}>Chưa có đồng bộ nền; bấm tải lại để xem thay đổi từ máy khác.</Text>{!session.userId && <Action title="Xóa phiên trên máy" secondary disabled={session.busy || trips.busy} onPress={() => { setEmail(''); setPassword(''); void accountSession.logout(); }} />}</Disclosure>
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
    <SectionTitle title="Chuyến của tài khoản" subtitle="Lưu và quản lý qua máy chủ GoEase" icon="cloud-outline" />
    <Text accessibilityLiveRegion="polite" style={trips.conflict ? styles.error : styles.text}>{trips.message}</Text>
    {message ? <Text style={styles.error}>{message}</Text> : null}
    {trips.busy && <ActivityIndicator accessibilityLabel="Đang xử lý chuyến server" />}
    <Action title="Tải lại danh sách" icon="refresh-outline" secondary disabled={blocked} onPress={() => { void accountTrips.list(); }} />
    {!!trips.cursor && <Action title="Xem thêm chuyến" secondary disabled={blocked} onPress={() => { void accountTrips.list(true); }} />}
    {!trips.items.length && trips.ready && <Text style={styles.text}>Danh sách hiện chưa có chuyến. Tải lại sau khi lưu để cập nhật.</Text>}
    {trips.items.map(item => <View key={item.id} style={styles.card}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Icon name="briefcase-outline" /><Badge>Phiên bản {item.version}</Badge></View><Text style={[styles.sectionTitle, { fontSize: 21, lineHeight: 28 }]}>{item.name}</Text><Text style={styles.caption}>{dateLabel(item.startDate)} · {item.durationDays} ngày · {item.people} người</Text>
      <Action title="Xem lịch trình" accessibilityLabel={`Mở chuyến tài khoản: ${item.name}`} icon="arrow-forward" disabled={locked} onPress={() => { void accountTrips.read(item.id); }} />
    </View>)}
    {trips.ready && !creating && <Action title="Tạo chuyến mới" icon="add-circle-outline" disabled={locked} onPress={() => setCreating(true)} />}
    {creating && <AccountNewTrip disabled={locked} onCreate={start} onCancel={() => setCreating(false)} catalog={catalog.filter(p=>p.enabled).map(p=>p.entry)} />}
    {trips.ready && !trips.draft && !trips.pending && <Disclosure title="Nhập chuyến từ thiết bị" subtitle={`${guest.trips.length} chuyến khách trên máy`}>
      <Text style={styles.text}>Tạo bản sao của chuyến khách và xem lại trước khi lưu vào tài khoản. Chuyến gốc trên máy vẫn giữ nguyên.</Text>
      {guest.loadStatus !== 'ready' && <Text style={styles.text}>Chưa đọc được chuyến khách. Quay về danh sách khách để tải lại.</Text>}
      {guest.trips.map(saved => <Action key={saved.trip.id} title={`Nhập bản sao: ${saved.trip.name}`} secondary disabled={locked || guest.loadStatus !== 'ready' || !!guest.issues.length} onPress={() => setImporting(saved.trip)} />)}
    </Disclosure>}
    {(trips.selected || trips.draft || trips.pending) && <AccountEditor key={trips.draft?.trip.id ?? trips.selected?.trip.id ?? 'pending'} />}
    <ConfirmDialog visible={!!importing} title="Nhập chuyến khách vào tài khoản này?" message={`Tạo bản sao “${importing?.name ?? ''}” cho tài khoản ${trips.owner?.slice(21)}. Chuyến khách giữ nguyên. Bạn có thể xem/sửa bản nháp trước khi gửi server.`} confirm="Tạo bản nháp tài khoản" busy={blocked} onCancel={() => setImporting(null)} onConfirm={() => { if (importing) void start({ ...importing, id: randomUUID() }); }} />
  </View>;
}
