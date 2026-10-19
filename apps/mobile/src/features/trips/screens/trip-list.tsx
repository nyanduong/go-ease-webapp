import type { SavedTrip } from '@goease/trip-storage';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalTrips } from '../local-trip-store';
import { Action, Badge, colors, ConfirmDialog, dateLabel, Icon, IconButton, SectionTitle, styles } from '../components/ui';
import { BottomNav, Brand, dalatImage, DestinationCover } from '../components/brand';
import { MotionPressable } from '../components/motion';
import { budgetView } from '../budget-controller';

export default function TripListScreen() {
  const { state, actions } = useLocalTrips();
  const [deleting, setDeleting] = useState<SavedTrip | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [tab, setTab] = useState<'home' | 'trips'>('home');
  const list = useRef<FlatList<SavedTrip>>(null);
  const busy = state.loadStatus === 'loading' || state.writeStatus === 'saving' || state.writeStatus === 'deleting';
  const writable = state.loadStatus === 'ready' && !state.issues.length && !busy;
  return <SafeAreaView style={styles.page}>
    <FlatList ref={list} data={tab === 'home' ? state.trips.slice(0, 1) : state.trips} keyExtractor={(saved) => saved.trip.id} contentContainerStyle={[styles.content, { gap: 0, paddingTop: 12 }]} showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      ListHeaderComponent={<View style={{ gap: 16, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Brand /><IconButton name="person-outline" label="Mở tài khoản" onPress={() => router.push('/account')} /></View>
        {tab === 'home' && <View style={{ marginHorizontal: -16, marginTop: -4 }}>
          <DestinationCover height={255} home>
            <View style={{ maxWidth: '74%', gap: 5 }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>Xin chào,</Text><Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.6 }}>Sẵn sàng cho{'\n'}hành trình mới?</Text><Text style={{ color: '#48656A', fontSize: 12, lineHeight: 18 }}>Những chuyến đi tuyệt vời luôn bắt đầu bằng một kế hoạch tốt.</Text></View>
            <View style={{ position: 'absolute', right: 20, bottom: 58 }}><Text style={{ color: 'white', fontSize: 15, lineHeight: 20, fontStyle: 'italic', textAlign: 'right' }}>Just go.{'\n'}We’ll plan.</Text></View>
          </DestinationCover>
          <View style={{ marginHorizontal: 16, marginTop: -22 }}><Action title="Tạo chuyến đi" icon="add-circle" disabled={!writable} onPress={() => router.push('/trips/new')} /></View>
        </View>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><SectionTitle title="Chuyến đi của bạn" /></View>{tab === 'home' ? <MotionPressable accessibilityRole="button" accessibilityLabel="Xem tất cả chuyến đi" onPress={() => { setTab('trips'); list.current?.scrollToOffset({ offset: 0, animated: true }); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3 }}><Text style={styles.caption}>Xem tất cả</Text><Icon name="chevron-forward" size={14} color={colors.muted} /></MotionPressable> : <IconButton name="add" label="Tạo chuyến đi" disabled={!writable} onPress={() => router.push('/trips/new')} />}</View>
        {(state.loadStatus === 'idle' || state.loadStatus === 'loading') && <ActivityIndicator accessibilityLabel="Đang đọc chuyến" />}
        {state.loadStatus === 'error' && <><Text accessibilityRole="alert" style={styles.error}>{state.readError?.message} {state.trips.length ? 'Danh sách bên dưới là dữ liệu lần đọc trước.' : ''}</Text><Action title="Thử đọc lại" onPress={() => { void actions.load(); }} /></>}
        {!!state.issues.length && <Text accessibilityRole="alert" style={styles.error}>Có {state.issues.length} bản ghi lỗi. Các chuyến hợp lệ vẫn được giữ; tạm chặn tạo/xóa để bảo toàn dữ liệu.</Text>}
      </View>}
      ListEmptyComponent={state.loadStatus === 'ready' && !state.issues.length ? <View style={[styles.card, { alignItems: 'center', paddingVertical: 28 }]}><View style={{ padding: 16, borderRadius: 28, backgroundColor: colors.mint }}><Icon name="briefcase-outline" size={29} /></View><Text style={styles.sectionTitle}>Hành trình đầu tiên đang chờ</Text><Text style={[styles.text, { textAlign: 'center' }]}>Tạo một chuyến Đà Lạt, rồi cùng nhóm điều chỉnh theo cách của bạn.</Text><Action title="Lên kế hoạch" icon="arrow-forward" disabled={!writable} onPress={() => router.push('/trips/new')} /></View> : null}
      ListFooterComponent={<View style={{ gap: 12, marginTop: 20 }}>
        {tab === 'home' && <><SectionTitle title="Khám phá cùng GoEase" /><View style={{ flexDirection: 'row', gap: 9 }}>
          {([{ label: 'Quản lý\nngân sách', icon: 'wallet-outline', color: '#FFF0DC', ink: '#D96E16' }, { label: 'Lên kế hoạch\nchuyến đi', icon: 'location-outline', color: '#E5F4F5', ink: colors.teal }, { label: 'Lịch trình\ncủa bạn', icon: 'compass-outline', color: '#FFF4D9', ink: colors.tealDark }] as const).map((item,index) => <MotionPressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label.replace('\n',' ')} disabled={index === 1 && !writable} onPress={() => { if (index === 1) router.push('/trips/new'); else if (index === 0 && state.trips[0]) router.push({ pathname: '/trips/[id]', params: { id: state.trips[0].trip.id, view: 'budget' } }); else { setTab('trips'); list.current?.scrollToOffset({ offset: 0, animated: true }); } }} style={{ flex: 1, padding: 12, minHeight: 108, borderRadius: 12, gap: 9, backgroundColor: item.color }}><Icon name={item.icon} color={item.ink} size={27} /><Text style={{ color: colors.ink, fontSize: 12, lineHeight: 17, fontWeight: '600' }}>{item.label}</Text></MotionPressable>)}
        </View></>}
        <MotionPressable accessibilityRole="button" accessibilityLabel="Chỗ nghỉ và chuyến bay" onPress={() => router.push('/travel-services')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }}><Icon name="airplane-outline" color={colors.orange} /><View style={{ flex: 1, gap: 2 }}><Text style={styles.label}>Chỗ nghỉ & chuyến bay</Text><Text style={styles.caption}>Tham khảo trên website bên ngoài</Text></View><Icon name="chevron-forward" size={17} /></MotionPressable>
        <Text style={[styles.caption, { textAlign: 'center', marginTop: 6 }]}>Just go. We’ll plan.</Text>
      </View>}
      renderItem={({ item }) => {
        const { trip } = item;
        return <View style={[styles.card, { padding: 0, overflow: 'hidden', borderRadius: 14 }]}>
          <MotionPressable pressScale={0.99} accessibilityRole="button" accessibilityLabel={`Xem lịch trình ${trip.name}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}>
            <Image source={dalatImage} style={{ width: '100%', height: 116, backgroundColor: colors.mint }} resizeMode="cover" />
            <View style={{ position: 'absolute', top: 9, left: 10 }}><Badge warm>{trip.generationSource === 'ai' ? 'Đề xuất AI' : trip.generationSource === 'sample' ? 'Lịch trình mẫu' : 'Chưa ghi nguồn'}</Badge></View><View style={{ padding: 12, gap: 6 }}><Text numberOfLines={tab === 'home' ? 2 : undefined} accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 16, lineHeight: 22 }]}>{trip.name}</Text>
              <View style={styles.row}><Icon name="calendar-outline" size={15} /><Text style={styles.caption}>{dateLabel(trip.startDate)} · {trip.durationDays} ngày</Text><Icon name="people-outline" size={15} /><Text style={styles.caption}>{trip.people} người</Text></View>
              {tab === 'trips' && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><View style={{ flex: 1 }}><Text style={styles.caption}>Chi phí nhóm đã biết</Text><Text style={[styles.label, { color: colors.tealDark, fontSize: 14 }]}>{budgetView(trip).knownText}</Text></View><Icon name="arrow-forward-circle-outline" size={29} /></View>}
            </View>
          </MotionPressable>
          {tab === 'trips' && <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={[styles.caption, { flex: 1 }]}>{trip.days.reduce((sum, day) => sum + day.activities.length, 0)} hoạt động{budgetView(trip).summary.unknownCostCount > 0 ? ' · Có khoản chưa có giá' : ''}</Text><IconButton name="trash-outline" label={`Xóa chuyến ${trip.name}`} danger disabled={!writable} onPress={() => { setDeleteError(''); setDeleting(item); }} /></View>}
        </View>;
      }} />
    <BottomNav active={tab} onTrips={() => { setTab('trips'); list.current?.scrollToOffset({ offset: 0, animated: true }); }} onHome={() => { setTab('home'); list.current?.scrollToOffset({ offset: 0, animated: true }); }} />
    <ConfirmDialog visible={deleting !== null} title="Xóa chuyến?" message={`Xóa “${deleting?.trip.name ?? ''}” khỏi thiết bị này?`} confirm="Xóa chuyến" error={deleteError} busy={busy}
      onCancel={() => { setDeleting(null); setDeleteError(''); }} onConfirm={() => {
        if (!deleting) return;
        void actions.deleteSaved(deleting.trip.id, deleting.revision).then((ok) => {
          if (ok) setDeleting(null); else setDeleteError(actions.getSnapshot().writeError?.message ?? 'Chưa xóa được; chuyến vẫn được giữ.');
        });
      }} />
  </SafeAreaView>;
}
