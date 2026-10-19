import { getDalatPlaces } from '@goease/catalog';
import { findTimeOverlaps, type Activity } from '@goease/contracts';
import { aiTripInput, tripSourceLabel } from '../ai-trip-controller';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { activityForm, createTripEditor, moveActivity, putActivity, removeActivity, type ActivityForm } from '../edit-trip-controller';
import { localTripStore, useLocalTrips } from '../local-trip-store';
import { ActivityEditor } from '../components/activity-editor';
import { Action, Badge, colors, ConfirmDialog, dateLabel, DayChip, Icon, IconButton, SectionTitle, styles } from '../components/ui';
import { DestinationCover } from '../components/brand';
import { BudgetSummary } from '../components/budget-summary';
import { GroupBudgetEditor } from '../components/group-budget-editor';
import { formatVnd } from '../budget-controller';
import { AiPlanner } from '../components/ai-planner';
import { MotionPressable } from '../components/motion';
import { useKeyboardScroll } from '../components/use-keyboard-scroll';

type ActivityDraft = { id: string; dayId: string; editingId?: string; initial: ActivityForm };
type Confirmation = 'leave' | 'cancel' | 'form' | { deleteId: string } | null;
export default function TripDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; newDraft?: string; view?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  return <TripDetailSession key={id} id={id} newDraft={params.newDraft === '1'} initialTab={params.view === 'budget' ? 'budget' : 'itinerary'} />;
}
function TripDetailSession({ id, newDraft, initialTab }: { id: string; newDraft: boolean; initialTab: 'itinerary' | 'budget' }) {
  const { state, actions } = useLocalTrips();
  const [editor] = useState(() => createTripEditor(localTripStore));
  const places = useMemo(() => getDalatPlaces(), []);
  const [dayId, setDayId] = useState(''), [editing, setEditing] = useState(() => newDraft && editor.adoptNew(id));
  const [form, setForm] = useState<ActivityDraft | null>(null), [moving, setMoving] = useState<string | null>(null);
  const [groupEditing, setGroupEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation>(null), [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false), savingRef = useRef(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [tab, setTab] = useState<'itinerary' | 'budget' | 'info'>(initialTab);
  const scroll = useRef<ScrollView>(null);
  useKeyboardScroll(scroll);
  const saved = state.trips.find((item) => item.trip.id === id);
  const trip = editing && editor.owns() ? state.draft!.trip : saved?.trip;
  const day = trip?.days.find((item) => item.id === dayId) ?? trip?.days[0];
  const busy = saving || aiBusy || state.loadStatus === 'loading' || state.writeStatus === 'saving' || state.writeStatus === 'deleting';
  const leave = useCallback(() => { if (!editor.cancel()) return; if (router.canGoBack()) router.back(); else router.replace('/'); }, [editor]);
  const requestLeave = useCallback(() => {
    if (savingRef.current || busy) return;
    if (editor.dirty() || form || groupEditing) setConfirm('leave'); else leave();
  }, [editor, form, groupEditing, leave, setConfirm, busy]);
  useFocusEffect(useCallback(() => { if (Platform.OS === 'web') return; const listener = BackHandler.addEventListener('hardwareBackPress', () => { requestLeave(); return true; }); return () => listener.remove(); }, [requestLeave]));
  const mutate = (action: () => void, successMessage = 'Đã cập nhật bản nháp. Bấm Lưu chuyến để giữ thay đổi.') => {
    try { action(); setMessage(successMessage); }
    catch { setMessage('Không áp dụng được: kiểm tra ngày/hoạt động còn tồn tại, tối đa 12 hoạt động/ngày và tổng chi phí không quá 1 tỷ VND. Dữ liệu trước đó được giữ.'); }
  };
  const apply = (activity: Activity) => {
    if (!trip || !form) return;
    mutate(() => { editor.change(putActivity(trip, form.dayId, activity, form.editingId)); setForm(null); scroll.current?.scrollTo({ y: 0, animated: true }); });
  };
  const overlaps = day ? findTimeOverlaps(day) : [];
  const saveEdit = () => {
    if (savingRef.current) return; savingRef.current = true; setSaving(true);
    void editor.save().then((result) => { setMessage(result.message); if (result.ok) { setEditing(false); setMoving(null); } }).finally(() => { savingRef.current = false; setSaving(false); });
  };
  const cancelEdit = () => {
    if (editor.dirty() || form || groupEditing) setConfirm('cancel');
    else { editor.cancel(); setEditing(false); setMoving(null); setMessage('Đã hủy chỉnh sửa.'); if (!saved) router.replace('/'); }
  };
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
    <Stack.Screen options={{ title: 'Lịch trình chuyến đi', headerTitle: trip ? () => <View style={{ alignItems: 'center', maxWidth: 240 }}><Text accessibilityLabel={trip.name} numberOfLines={2} style={{ color: colors.ink, fontSize: 15, lineHeight: 19, fontWeight: '700', textAlign: 'center' }}>{trip.name}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>{dateLabel(trip.startDate)} · {trip.people} người</Text></View> : undefined, headerBackVisible: false, gestureEnabled: false, headerLeft: () => <IconButton name="chevron-back" label="Về danh sách chuyến" disabled={busy} onPress={requestLeave} /> }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {(state.loadStatus === 'idle' || state.loadStatus === 'loading') && <ActivityIndicator accessibilityLabel="Đang đọc chuyến" />}
        {state.loadStatus === 'error' && <><Text style={styles.error}>{state.readError?.message}</Text><Action title="Thử đọc lại" disabled={busy} onPress={() => { void actions.load(); }} /></>}
        {!!state.issues.length && <Text style={styles.error}>Kho có bản ghi lỗi; tạm chặn ghi để giữ dữ liệu.</Text>}
        {!trip && state.loadStatus === 'ready' && <Text style={styles.text}>Không tìm thấy chuyến. Có thể chuyến đã bị xóa hoặc đường dẫn không hợp lệ.</Text>}
        {trip && day && <>
          <View style={{ marginHorizontal: -16, marginTop: -16 }}><DestinationCover height={150}><Text style={{ color: 'white', fontSize: 21, lineHeight: 27, fontStyle: 'italic' }}>Những khoảnh khắc{'\n'}đáng nhớ</Text>{editing && <Badge warm>Đang chỉnh sửa · Chưa lưu</Badge>}</DestinationCover></View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line }}>
            {([{ key: 'itinerary', title: 'Lịch trình' }, { key: 'budget', title: 'Ngân sách' }, { key: 'info', title: 'Thông tin' }] as const).map(item => <MotionPressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key, disabled: busy || !!form || groupEditing }} disabled={busy || !!form || groupEditing} onPress={() => { setTab(item.key); setMoving(null); }} style={{ flex: 1, minHeight: 40, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: tab === item.key ? colors.teal : 'transparent', paddingHorizontal: 4 }}><Text style={{ color: tab === item.key ? colors.tealDark : colors.muted, fontSize: 13, lineHeight: 19, fontWeight: tab === item.key ? '700' : '500', textAlign: 'center' }}>{item.title}</Text></MotionPressable>)}
          </View>
          {state.draft && !editor.owns() && <Text style={styles.error}>Có draft khác chưa xử lý. Quay lại màn đang chỉnh để lưu hoặc hủy.</Text>}
          {tab === 'info' && <View style={styles.card}><SectionTitle title="Thông tin hành trình" icon="information-circle-outline" /><Badge>{tripSourceLabel(trip)}</Badge><Text style={styles.text}>Đà Lạt · {dateLabel(trip.startDate)} đến {dateLabel(trip.days.at(-1)!.date)}</Text><Text style={styles.text}>{trip.people} người · {trip.durationDays} ngày · {editing ? 'Bản nháp chưa lưu' : 'Đã lưu trên thiết bị'}</Text><Text style={styles.caption}>Giờ chỉ là gợi ý, chưa kiểm tra giờ mở cửa, tối ưu tuyến hoặc tính thời gian di chuyển. Chi phí là ước tính tổng nhóm; hãy kiểm tra lại trước khi đi.</Text></View>}
          {__DEV__ && editing && editor.owns() && <AiPlanner input={aiTripInput(trip)} target={trip} disabled={!!form || groupEditing || saving} onBusy={setAiBusy} onApply={(updated) => editor.change(updated)} />}
          {message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
          {tab === 'budget' && !groupEditing && <><BudgetSummary trip={trip} draft={editing && editor.owns()} dayId={day.id} />{editing && !form && <Action title="Điều chỉnh ngân sách" icon="options-outline" secondary disabled={busy} onPress={() => { setMoving(null); setGroupEditing(true); }} />}</>}
          {groupEditing && <View onLayout={event => scroll.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true })}><GroupBudgetEditor trip={trip} disabled={busy} onApply={(updated) => mutate(() => { editor.change(updated); setGroupEditing(false); })} onCancel={() => setConfirm('form')} /></View>}
          {tab === 'itinerary' && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
            {trip.days.map((item, index) => <DayChip key={item.id} title={`Ngày ${index + 1}`} date={dateLabel(item.date).slice(0, 5)} selected={item.id === day.id} disabled={busy || !!form || groupEditing} onPress={() => { setDayId(item.id); setMoving(null); }} />)}
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1 }}><Text style={styles.caption}>{dateLabel(day.date)} · {day.activities.length} hoạt động</Text></View><IconButton name="map-outline" label="Xem bản đồ ngày đang chọn" disabled={busy || !!form || groupEditing} onPress={() => router.push({ pathname: '/trips/[id]/map', params: { id, dayId: day.id, mode: editing && editor.owns() ? 'draft' : 'saved' } })} /></View>
          {overlaps.map(({ activityIds }) => <Text key={activityIds.join('-')} accessibilityRole="alert" style={styles.error}>Trùng giờ: {day.activities.find((item) => item.id === activityIds[0])?.name} và {day.activities.find((item) => item.id === activityIds[1])?.name}. Bạn có thể giữ hoặc sửa giờ.</Text>)}
          {!day.activities.length && <Text style={styles.text}>Ngày này chưa có hoạt động.</Text>}
          {form ? <View key={form.id} onLayout={event => scroll.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true })}><ActivityEditor initial={form.initial} activityId={form.id} places={places} disabled={busy} onApply={apply} onCancel={() => setConfirm('form')} /></View> : !groupEditing && <>
            {editing && <Action title="Thêm hoạt động" icon="add-outline" secondary disabled={busy || day.activities.length >= 12} onPress={() => { setMoving(null); setForm({ id: randomUUID(), dayId: day.id, initial: activityForm() }); }} />}
            {editing && day.activities.length >= 12 && <Text style={styles.text}>Ngày đã đủ 12 hoạt động. Xóa hoặc chuyển một hoạt động trước khi thêm.</Text>}
            {day.activities.map((activity, index) => <View key={activity.id} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 45, alignItems: 'center', gap: 9, paddingTop: 6 }}><Text style={{ fontSize: 12, lineHeight: 18, fontWeight: '700', color: colors.tealDark }}>{activity.startTime ?? '—'}</Text><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.teal, borderWidth: 2, borderColor: '#B8DCD8' }} />{index < day.activities.length - 1 && <View style={{ width: 1, flex: 1, minHeight: 24, backgroundColor: '#CBE1DD' }} />}</View>
              <View style={[editing ? styles.card : { borderBottomWidth: 1, borderBottomColor: colors.line }, { flex: 1, minWidth: 0, padding: editing ? 12 : 0, paddingBottom: 12, gap: 5 }]}>
              <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}><View style={{ width: 43, height: 48, borderRadius: 8, backgroundColor: index % 2 === 0 ? colors.mint : colors.sand, alignItems: 'center', justifyContent: 'center' }}><Icon name={activity.location.kind === 'catalog' ? 'location-outline' : 'sparkles-outline'} size={23} color={index % 2 === 0 ? colors.tealDark : '#C17229'} /></View><View style={{ flex: 1, gap: 3 }}><Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{activity.name}</Text><Text style={styles.caption}>{activity.startTime === null ? 'Chưa đặt giờ' : `${activity.startTime} – ${activity.endTime}`} · {activity.costVnd === null ? 'Chưa có giá' : activity.costVnd === 0 ? 'Miễn phí' : formatVnd(activity.costVnd)}</Text></View></View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}><Icon name={activity.location.kind === 'catalog' ? 'location-outline' : 'create-outline'} size={14} /><Text style={[styles.caption, { flex: 1 }]}>{activity.location.kind === 'catalog' ? places.find((place) => activity.location.kind === 'catalog' && place.id === activity.location.placeId)?.name ?? 'Không có trong danh mục hiện tại' : 'Tự nhập · Không có tọa độ'}</Text></View>
              {!!activity.notes && (editing ? <Text style={styles.caption}>{activity.notes}</Text> : <ActivityNote name={activity.name} notes={activity.notes} />)}
              {editing && <>
                <View style={styles.row}>
                  <IconButton name="create-outline" label={`Sửa: ${activity.name}`} disabled={busy} onPress={() => { setMoving(null); setForm({ id: activity.id, editingId: activity.id, dayId: day.id, initial: activityForm(activity) }); }} />
                  <IconButton name="arrow-up-outline" label={`Đưa lên: ${activity.name}`} disabled={busy || index === 0} onPress={() => mutate(() => editor.change(moveActivity(trip, activity.id, day.id, index - 1)))} />
                  <IconButton name="arrow-down-outline" label={`Đưa xuống: ${activity.name}`} disabled={busy || index === day.activities.length - 1} onPress={() => mutate(() => editor.change(moveActivity(trip, activity.id, day.id, index + 1)))} />
                  <IconButton name="swap-horizontal-outline" label={`Chuyển ngày: ${activity.name}`} disabled={busy || trip.days.length === 1} onPress={() => setMoving(moving === activity.id ? null : activity.id)} />
                  <IconButton name="trash-outline" label={`Xóa hoạt động: ${activity.name}`} danger disabled={busy} onPress={() => setConfirm({ deleteId: activity.id })} />
                </View>
                {moving === activity.id && trip.days.filter((item) => item.id !== day.id).map((target) => <Action key={target.id} title={`Chuyển đến ${dateLabel(target.date)}`} compact secondary disabled={busy || target.activities.length >= 12} onPress={() => mutate(() => { editor.change(moveActivity(trip, activity.id, target.id)); setDayId(target.id); setMoving(null); })} />)}
              </>}
              </View>
            </View>)}
          </>}
          <View style={styles.notice}><Text style={styles.caption}>Giờ và chi phí chỉ là gợi ý. Bạn có thể điều chỉnh lịch trình cho phù hợp với nhóm.</Text></View>
          </>}
        </>}
        {!trip && <Action title="Về danh sách" secondary disabled={busy} onPress={requestLeave} />}
      </ScrollView>
      {trip && !form && !groupEditing && <View style={styles.footer}>
        <MotionPressable accessibilityRole="button" accessibilityLabel="Xem ngân sách nhóm" disabled={busy} onPress={() => setTab('budget')} style={{ minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.sand, flexDirection: 'row', gap: 9, alignItems: 'center' }}><Icon name="wallet-outline" color="#D77C20" /><Text style={[styles.caption, { flex: 1 }]}>Ngân sách nhóm</Text><Text style={[styles.label, { color: colors.tealDark }]}>{trip.budgetVnd === null ? 'Chưa đặt' : formatVnd(trip.budgetVnd)}</Text><Icon name="chevron-forward" size={16} /></MotionPressable>
        {editing ? <><Text style={[styles.caption, { textAlign: 'center' }]}>{editor.dirty() ? 'Có thay đổi chưa lưu' : 'Đang chỉnh sửa bản nháp'}</Text><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><IconButton name="close" label="Hủy chỉnh sửa" disabled={busy} onPress={cancelEdit} /><View style={{ flex: 1 }}><Action tone="teal" title={saving ? 'Đang lưu…' : 'Lưu chuyến đi'} icon="checkmark-outline" disabled={busy || !!state.issues.length} onPress={saveEdit} /></View></View></>
          : <Action tone="teal" title="Chỉnh sửa lịch trình" icon="create-outline" disabled={busy || state.loadStatus !== 'ready' || !!state.issues.length || !!state.draft} onPress={() => mutate(() => { editor.begin(saved!); setEditing(true); }, 'Đang chỉnh bản nháp; thay đổi chưa được lưu.')} />}
      </View>}
    </KeyboardAvoidingView>
    <ConfirmDialog visible={confirm !== null} busy={busy} title={typeof confirm === 'object' && confirm ? 'Xóa hoạt động khỏi draft?' : 'Bỏ nội dung chưa lưu?'}
      message="Chỉ tác động đến bản đang chỉnh. Chuyến trên máy chỉ thay đổi khi bấm Lưu chuyến." confirm={typeof confirm === 'object' && confirm ? 'Xóa hoạt động' : 'Bỏ thay đổi'}
      onCancel={() => setConfirm(null)} onConfirm={() => {
        const action = confirm; setConfirm(null);
        if (action === 'leave') leave();
        else if (action === 'cancel') { editor.cancel(); setEditing(false); setForm(null); setGroupEditing(false); setMoving(null); setMessage('Đã hủy; chuyến đã lưu được giữ nguyên.'); if (!saved) router.replace('/'); }
        else if (action === 'form') { setForm(null); setGroupEditing(false); }
        else if (action && trip) mutate(() => editor.change(removeActivity(trip, action.deleteId)));
      }} />
  </SafeAreaView>;
}

function ActivityNote({ name, notes }: { name: string; notes: string }) {
  const [expanded, setExpanded] = useState(false);
  return <MotionPressable accessibilityRole="button" accessibilityLabel={`Ghi chú: ${name}`} accessibilityHint="Chạm để mở hoặc thu gọn ghi chú" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 5, minHeight: 32 }}>
    <Text numberOfLines={expanded ? undefined : 1} style={[styles.caption, { flex: 1 }]}>{notes}</Text><Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
  </MotionPressable>;
}
