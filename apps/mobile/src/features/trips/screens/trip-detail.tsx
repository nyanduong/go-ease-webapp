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
import { Action, ConfirmDialog, styles } from '../components/ui';
import { BudgetSummary } from '../components/budget-summary';
import { GroupBudgetEditor } from '../components/group-budget-editor';
import { formatVnd } from '../budget-controller';
import { AiPlanner } from '../components/ai-planner';

type ActivityDraft = { id: string; dayId: string; editingId?: string; initial: ActivityForm };
type Confirmation = 'leave' | 'cancel' | 'form' | { deleteId: string } | null;
export default function TripDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; newDraft?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  return <TripDetailSession key={id} id={id} newDraft={params.newDraft === '1'} />;
}
function TripDetailSession({ id, newDraft }: { id: string; newDraft: boolean }) {
  const { state, actions } = useLocalTrips();
  const editor = useMemo(() => createTripEditor(localTripStore), []);
  const places = useMemo(() => getDalatPlaces(), []);
  const [dayId, setDayId] = useState(''), [editing, setEditing] = useState(() => newDraft && editor.adoptNew(id));
  const [form, setForm] = useState<ActivityDraft | null>(null), [moving, setMoving] = useState<string | null>(null);
  const [groupEditing, setGroupEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation>(null), [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false), savingRef = useRef(false);
  const [aiBusy, setAiBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const saved = state.trips.find((item) => item.trip.id === id);
  const trip = editing && editor.owns() ? state.draft!.trip : saved?.trip;
  const day = trip?.days.find((item) => item.id === dayId) ?? trip?.days[0];
  const busy = saving || aiBusy || state.loadStatus === 'loading' || state.writeStatus === 'saving' || state.writeStatus === 'deleting';
  const leave = useCallback(() => { if (!editor.cancel()) return; if (router.canGoBack()) router.back(); else router.replace('/'); }, [editor]);
  const requestLeave = useCallback(() => {
    if (savingRef.current || busy) return;
    if (editor.dirty() || form || groupEditing) setConfirm('leave'); else leave();
  }, [editor, form, groupEditing, leave, setConfirm, busy]);
  useFocusEffect(useCallback(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => { requestLeave(); return true; }); return () => listener.remove(); }, [requestLeave]));
  const mutate = (action: () => void, successMessage = 'Đã thay đổi draft. Bấm Lưu chuyến để ghi lên máy.') => {
    try { action(); setMessage(successMessage); }
    catch { setMessage('Không áp dụng được: kiểm tra ngày/hoạt động còn tồn tại, tối đa 12 hoạt động/ngày và tổng chi phí không quá 1 tỷ VND. Dữ liệu trước đó được giữ.'); }
  };
  const apply = (activity: Activity) => {
    if (!trip || !form) return;
    mutate(() => { editor.change(putActivity(trip, form.dayId, activity, form.editingId)); setForm(null); scroll.current?.scrollTo({ y: 0, animated: true }); });
  };
  const overlaps = day ? findTimeOverlaps(day) : [];
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
    <Stack.Screen options={{ title: 'Lịch trình', headerBackVisible: false, gestureEnabled: false, headerLeft: () => <Action title="Danh sách" secondary disabled={busy} onPress={requestLeave} /> }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {(state.loadStatus === 'idle' || state.loadStatus === 'loading') && <ActivityIndicator accessibilityLabel="Đang đọc chuyến" />}
        {state.loadStatus === 'error' && <><Text style={styles.error}>{state.readError?.message}</Text><Action title="Thử đọc lại" disabled={busy} onPress={() => { void actions.load(); }} /></>}
        {!!state.issues.length && <Text style={styles.error}>Kho có bản ghi lỗi; tạm chặn ghi để giữ dữ liệu.</Text>}
        {!trip && state.loadStatus === 'ready' && <Text style={styles.text}>Không tìm thấy chuyến. Có thể chuyến đã bị xóa hoặc đường dẫn không hợp lệ.</Text>}
        {trip && day && <>
          <Text accessibilityRole="header" style={styles.heading}>{trip.name}</Text>
          <Text style={styles.text}>Đà Lạt · {trip.durationDays} ngày · {trip.people} người</Text>
          <Text style={styles.text}>{tripSourceLabel(trip)}</Text>
          <Text style={styles.text}>Giờ chỉ là gợi ý, chưa tối ưu tuyến hoặc tính thời gian di chuyển. Chi phí là ước tính tổng nhóm.</Text>
          <BudgetSummary trip={trip} draft={editing && editor.owns()} dayId={day.id} />
          {!editing ? <Action title="Chỉnh sửa lịch trình" disabled={busy || state.loadStatus !== 'ready' || !!state.issues.length || !!state.draft} onPress={() => {
            mutate(() => { editor.begin(saved!); setEditing(true); }, 'Đang chỉnh draft; chưa ghi lên máy.');
          }} /> : <>
            <Text style={styles.text}>Chế độ chỉnh sửa · {editor.dirty() || form || groupEditing ? 'Có nội dung chưa lưu' : 'Chưa thay đổi'}</Text>
            <Action title={saving ? 'Đang lưu…' : 'Lưu chuyến'} disabled={busy || !!form || groupEditing || !!state.issues.length} onPress={() => {
              if (savingRef.current) return; savingRef.current = true; setSaving(true);
              void editor.save().then((result) => { setMessage(result.message); if (result.ok) { setEditing(false); setMoving(null); } }).finally(() => { savingRef.current = false; setSaving(false); });
            }} />
            {(form || groupEditing) && <Text style={styles.text}>Áp dụng hoặc bỏ form đang mở trước khi lưu chuyến.</Text>}
            <Action title="Hủy chỉnh sửa" secondary disabled={busy} onPress={() => {
              if (editor.dirty() || form || groupEditing) setConfirm('cancel'); else { editor.cancel(); setEditing(false); setMoving(null); setMessage('Đã hủy chỉnh sửa.'); if (!saved) router.replace('/'); }
            }} />
          </>}
          {state.draft && !editor.owns() && <Text style={styles.error}>Có draft khác chưa xử lý. Quay lại màn đang chỉnh để lưu hoặc hủy.</Text>}
          {__DEV__ && editing && editor.owns() && <AiPlanner input={aiTripInput(trip)} target={trip} disabled={!!form || groupEditing || saving} onBusy={setAiBusy} onApply={(updated) => editor.change(updated)} />}
          {message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
          <Action title="Xem bản đồ ngày đang chọn" secondary disabled={busy || !!form || groupEditing} onPress={() => router.push({ pathname: '/trips/[id]/map', params: { id, dayId: day.id, mode: editing && editor.owns() ? 'draft' : 'saved' } })} />
          {editing && !form && !groupEditing && <Action title="Đổi ngân sách / số người" secondary disabled={busy} onPress={() => { setMoving(null); setGroupEditing(true); }} />}
          {groupEditing && <GroupBudgetEditor trip={trip} disabled={busy} onApply={(updated) => mutate(() => { editor.change(updated); setGroupEditing(false); })} onCancel={() => setConfirm('form')} />}
          <ScrollView horizontal contentContainerStyle={{ gap: 10 }}>
            {trip.days.map((item, index) => <Action key={item.id} title={`${item.id === day.id ? '✓ ' : ''}Ngày ${index + 1}`} secondary={item.id !== day.id} disabled={busy || !!form || groupEditing} onPress={() => { setDayId(item.id); setMoving(null); }} />)}
          </ScrollView>
          <Text accessibilityRole="header" style={styles.heading}>{day.date}</Text>
          {overlaps.map(({ activityIds }) => <Text key={activityIds.join('-')} accessibilityRole="alert" style={styles.error}>Trùng giờ: {day.activities.find((item) => item.id === activityIds[0])?.name} và {day.activities.find((item) => item.id === activityIds[1])?.name}. Bạn có thể giữ hoặc sửa giờ.</Text>)}
          {!day.activities.length && <Text style={styles.text}>Ngày này chưa có hoạt động.</Text>}
          {form ? <ActivityEditor key={form.id} initial={form.initial} activityId={form.id} places={places} disabled={busy} onApply={apply} onCancel={() => setConfirm('form')} /> : !groupEditing && <>
            {editing && <Action title="+ Thêm hoạt động" disabled={busy || day.activities.length >= 12} onPress={() => { setMoving(null); setForm({ id: randomUUID(), dayId: day.id, initial: activityForm() }); }} />}
            {editing && day.activities.length >= 12 && <Text style={styles.text}>Ngày đã đủ 12 hoạt động. Xóa hoặc chuyển một hoạt động trước khi thêm.</Text>}
            {day.activities.map((activity, index) => <View key={activity.id} style={styles.card}>
              <Text accessibilityRole="header" style={styles.heading}>{index + 1}. {activity.name}</Text>
              <Text style={styles.text}>{activity.startTime === null ? 'Chưa đặt giờ' : `${activity.startTime} → ${activity.endTime}`}</Text>
              <Text style={styles.text}>{activity.location.kind === 'catalog' ? `Địa điểm: ${places.find((place) => activity.location.kind === 'catalog' && place.id === activity.location.placeId)?.name ?? 'Không có trong danh mục hiện tại'}` : 'Tự nhập · Không có tọa độ'}</Text>
              <Text style={styles.text}>Chi phí nhóm: {activity.costVnd === null ? 'Chưa biết' : formatVnd(activity.costVnd)}</Text>
              {!!activity.notes && <Text style={styles.text}>{activity.notes}</Text>}
              {editing && <>
                <Action title={`Sửa: ${activity.name}`} secondary disabled={busy} onPress={() => { setMoving(null); setForm({ id: activity.id, editingId: activity.id, dayId: day.id, initial: activityForm(activity) }); scroll.current?.scrollTo({ y: 0, animated: true }); }} />
                <Action title="Đưa lên" secondary disabled={busy || index === 0} onPress={() => mutate(() => editor.change(moveActivity(trip, activity.id, day.id, index - 1)))} />
                <Action title="Đưa xuống" secondary disabled={busy || index === day.activities.length - 1} onPress={() => mutate(() => editor.change(moveActivity(trip, activity.id, day.id, index + 1)))} />
                <Action title="Chuyển ngày" secondary disabled={busy || trip.days.length === 1} onPress={() => setMoving(moving === activity.id ? null : activity.id)} />
                {moving === activity.id && trip.days.filter((item) => item.id !== day.id).map((target) => <Action key={target.id} title={`Chuyển đến ${target.date}`} secondary disabled={busy || target.activities.length >= 12} onPress={() => mutate(() => { editor.change(moveActivity(trip, activity.id, target.id)); setDayId(target.id); setMoving(null); })} />)}
                <Action title={`Xóa hoạt động: ${activity.name}`} secondary disabled={busy} onPress={() => setConfirm({ deleteId: activity.id })} />
              </>}
            </View>)}
          </>}
        </>}
        {!trip && <Action title="Về danh sách" secondary disabled={busy} onPress={requestLeave} />}
      </ScrollView>
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
