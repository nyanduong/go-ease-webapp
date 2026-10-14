import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { getDalatPlaces } from '@goease/catalog';
import { findTimeOverlaps, type Trip } from '@goease/contracts';
import { accountTrips, useAccount } from '../account-session';
import { activityForm, putActivity, removeActivity, moveActivity, type ActivityForm } from '../edit-trip-controller';
import { ActivityEditor } from './activity-editor';
import { GroupBudgetEditor } from './group-budget-editor';
import { BudgetSummary } from './budget-summary';
import { Action, ConfirmDialog, styles } from './ui';
import { formatVnd } from '../budget-controller';
import { projectDayMap } from '../map-controller';
import DayMapCanvas from './day-map';

export function AccountEditor() {
  const { trips, catalog } = useAccount(); const draft = trips.draft, trip = draft?.trip ?? trips.selected?.trip;
  const [dayId, setDayId] = useState(''), [form, setForm] = useState<{ id: string; editingId?: string; dayId: string; initial: ActivityForm } | null>(null);
  const [group, setGroup] = useState(false), [map, setMap] = useState(false), [message, setMessage] = useState('');
  const [nameDirty, setNameDirty] = useState(false);
  const [confirm, setConfirm] = useState<'save' | 'discard' | 'delete' | 'rebase' | 'latest' | { remove: string } | null>(null);
  const day = trip?.days.find(day => day.id === dayId) ?? trip?.days[0];
  const busy = trips.busy || !trips.ready, locked = busy || !!trips.pending;
  const originalLocation = form?.editingId ? trip?.days.flatMap(d=>d.activities).find(a=>a.id===form.editingId)?.location : undefined;
  const places = catalog.filter(p=>p.enabled||(originalLocation?.kind==='catalog'&&originalLocation.placeId===p.entry.id)).map(p=>{const {id,name,destinationId,coordinates,sources}=p.entry;return {id,name,destinationId,coordinates,sources};});
  async function change(input: Trip) { try { await accountTrips.change(input); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Không áp dụng được thay đổi.'); } }
  function mutate(work: () => Trip) { try { void change(work()); return true; } catch { setMessage('Kiểm tra ngày, tối đa 12 hoạt động/ngày và giới hạn chi phí. Bản nháp trước đó giữ nguyên.'); return false; } }
  const id = draft?.trip.id ?? (trips.pending?.kind === 'create' ? trips.pending.trip.id : trips.pending?.id) ?? trip?.id;
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={styles.heading}>Lịch trình tài khoản</Text>
    {trips.pending && <><Text style={styles.error}>Có yêu cầu chưa xác nhận. Không sửa payload hoặc tạo mutationId mới. Bản nháp đã áp dụng giữ trên thiết bị theo user.</Text><Action title="Thử lại đúng yêu cầu đã gửi" disabled={busy} onPress={() => { void accountTrips.retry(); }} /></>}
    {!trips.durable && <Action title="Thử ghi lại trạng thái bản nháp trên thiết bị" secondary disabled={busy} onPress={() => { void accountTrips.checkpoint(); }} />}
    {id && <Action title="Đọc bản server để đối chiếu" secondary disabled={busy} onPress={() => { void accountTrips.read(id); }} />}
    {trips.latest && <View style={styles.card}>
      <Text style={styles.heading}>Bản server hiện tại · v{trips.latest.version}</Text><Text style={styles.text}>{trips.latest.trip.name} · {trips.latest.trip.days.reduce((n, d) => n + d.activities.length, 0)} hoạt động</Text>
      <BudgetSummary trip={trips.latest.trip} />
      <Text style={styles.text}>Bản nháp vẫn giữ nguyên bên dưới. Có thể bỏ bản nháp để dùng server, hoặc chủ động lưu toàn bộ bản nháp trên version mới sau khi kiểm tra. Không tự gộp dữ liệu.</Text>
      <Action title="Bỏ bản nháp, dùng bản server mới" secondary disabled={locked} onPress={() => setConfirm('latest')} />
      {draft && trips.latest.trip.id === draft.trip.id && draft.baseVersion !== null && <Action title="Giữ toàn bộ bản nháp trên version mới" disabled={locked || !!form || group || nameDirty} onPress={() => setConfirm('rebase')} />}
    </View>}
    {trip && day && <>
      <Text style={styles.heading}>{trip.name}</Text><Text style={styles.text}>{draft ? 'Bản nháp riêng · chưa lưu server' : `Bản server đã đọc · v${trips.selected?.version}`} · {trip.durationDays} ngày</Text>
      <BudgetSummary trip={trip} draft={!!draft} dayId={day.id} />
      {!draft && trips.selected && <><Action title="Chỉnh sửa chuyến server" disabled={locked} onPress={() => { if (trips.selected) void accountTrips.begin(trips.selected.trip, trips.selected.version); }} /><Action title="Xóa chuyến server" secondary disabled={locked} onPress={() => setConfirm('delete')} /></>}
      {draft && <>
        <TripName key={`${draft.trip.id}:${draft.baseVersion}`} initial={draft.trip.name} disabled={locked || !!form || group} onDirty={setNameDirty} onApply={name => { void change({ ...draft.trip, name }); }} />
        <Action title="Lưu bản nháp lên server" disabled={locked || !!form || group || nameDirty || trips.conflict} onPress={() => setConfirm('save')} />
        <Action title="Bỏ bản nháp tài khoản" secondary disabled={locked} onPress={() => setConfirm('discard')} />
        <Text style={styles.text}>Áp dụng form hoạt động/ngân sách trước khi chuyển app hoặc đóng màn. Chỉ nội dung đã áp dụng được lưu thành bản nháp riêng trên thiết bị.</Text>
        {!trips.durable && <Text style={styles.error}>Chưa xác nhận lưu bản nháp trên máy. Giữ màn này, kiểm tra storage/kết nối và thử lại.</Text>}
      </>}
      {!!message && <Text style={styles.error}>{message}</Text>}
      <ScrollView horizontal contentContainerStyle={{ gap: 10 }}>{trip.days.map((d, index) => <Action key={d.id} title={`${day.id === d.id ? '✓ ' : ''}Ngày ${index + 1}`} secondary={day.id !== d.id} disabled={busy || !!form || group} onPress={() => { setDayId(d.id); setMap(false); }} />)}</ScrollView>
      <Text style={styles.heading}>{day.date}</Text>
      {findTimeOverlaps(day).length > 0 && <Text style={styles.error}>Có hoạt động trùng giờ. Kiểm tra giờ trước khi đi.</Text>}
      <Action title={map ? 'Ẩn bản đồ ngày' : 'Xem bản đồ ngày'} secondary disabled={busy || !!form || group} onPress={() => setMap(!map)} />
      {map && <AccountMap trip={trip} dayId={day.id} places={catalog.map(p=>{const {id,name,destinationId,coordinates,sources}=p.entry;return {id,name,destinationId,coordinates,sources};})} />}
      {draft && !form && !group && <><Action title="Đổi ngân sách / số người" secondary disabled={locked} onPress={() => setGroup(true)} /><Action title="+ Thêm hoạt động vào bản nháp" disabled={locked || day.activities.length >= 12} onPress={() => setForm({ id: randomUUID(), dayId: day.id, initial: activityForm() })} /></>}
      {group && <GroupBudgetEditor trip={trip} disabled={locked} onApply={input => { void change(input); setGroup(false); }} onCancel={() => setGroup(false)} />}
      {form && <ActivityEditor key={form.id} initial={form.initial} activityId={form.id} places={places} disabled={locked} onApply={activity => { if (mutate(() => putActivity(trip, form.dayId, activity, form.editingId))) setForm(null); }} onCancel={() => setForm(null)} />}
      {!form && !group && day.activities.map((activity, index) => <View key={activity.id} style={styles.card}>
        <Text style={styles.heading}>{index + 1}. {activity.name}</Text><Text style={styles.text}>{activity.startTime ?? 'Chưa đặt giờ'} {activity.endTime ? `→ ${activity.endTime}` : ''}</Text>
        <Text style={styles.text}>Chi phí nhóm: {activity.costVnd === null ? 'Chưa biết' : formatVnd(activity.costVnd)}</Text><Text style={styles.text}>{activity.notes}</Text>
        {draft && <><Action title={`Sửa ${activity.name}`} secondary disabled={locked} onPress={() => setForm({ id: activity.id, editingId: activity.id, dayId: day.id, initial: activityForm(activity) })} />
          <Action title="Đưa lên" secondary disabled={locked || index === 0} onPress={() => mutate(() => moveActivity(trip, activity.id, day.id, index - 1))} />
          <Action title="Đưa xuống" secondary disabled={locked || index === day.activities.length - 1} onPress={() => mutate(() => moveActivity(trip, activity.id, day.id, index + 1))} />
          {trip.days.filter(d => d.id !== day.id).map(target => <Action key={target.id} title={`Chuyển đến ${target.date}`} secondary disabled={locked || target.activities.length >= 12} onPress={() => mutate(() => moveActivity(trip, activity.id, target.id))} />)}
          <Action title={`Xóa hoạt động ${activity.name}`} secondary disabled={locked} onPress={() => setConfirm({ remove: activity.id })} /></>}
      </View>)}
    </>}
    <ConfirmDialog visible={!!confirm} title="Xác nhận thay đổi chuyến tài khoản" message={confirm === 'rebase' ? 'Bạn chọn giữ TOÀN BỘ bản nháp thay cho bản server đã đọc. Thay đổi của máy khác có thể bị thay thế khi bạn bấm Lưu tiếp theo. Không tự gộp; nếu server lại đổi, app vẫn báo conflict.' : confirm === 'delete' ? 'Xóa bản server của tài khoản này? Bản khách trên máy giữ nguyên.' : confirm === 'save' ? 'Gửi bản nháp này lên server của tài khoản hiện tại?' : 'Bỏ nội dung đang chỉnh hoặc áp dụng lựa chọn đã chọn? Bản khách giữ nguyên.'} confirm="Xác nhận" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => {
      const selected = confirm; setConfirm(null);
      void (async () => { try {
        if (selected === 'save') await accountTrips.save();
        else if (selected === 'discard') { await accountTrips.discard(); setForm(null); setGroup(false); setNameDirty(false); }
        else if (selected === 'delete' && trips.selected) await accountTrips.remove(trips.selected);
        else if (selected === 'rebase') await accountTrips.rebase();
        else if (selected === 'latest') { await accountTrips.useLatest(); setForm(null); setGroup(false); setNameDirty(false); }
        else if (selected && typeof selected === 'object' && trip) mutate(() => removeActivity(trip, selected.remove));
      } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Chưa áp dụng được.'); } })();
    }} />
  </View>;
}
function AccountMap({ trip, dayId, places }: { trip: Trip; dayId: string; places: ReturnType<typeof getDalatPlaces> }) {
  let model: ReturnType<typeof projectDayMap> | null = null;
  try { model = projectDayMap(trip, dayId, places); } catch { /* Projection failure is shown below. */ }
  if (!model) return <Text style={styles.error}>Không đọc được tọa độ/ngày; không vẽ pin thay thế.</Text>;
  return model.region ? <DayMapCanvas key={`${model.dayId}:${JSON.stringify(model.pins)}`} model={model} /> : <Text style={styles.text}>Ngày này không có địa điểm có tọa độ.</Text>;
}
function TripName({ initial, disabled, onApply, onDirty }: { initial: string; disabled: boolean; onApply: (name: string) => void; onDirty: (dirty: boolean) => void }) {
  const [name, setName] = useState(initial), [error, setError] = useState('');
  return <View><TextInput accessibilityLabel="Tên bản nháp chuyến tài khoản" value={name} maxLength={80} editable={!disabled} onChangeText={value => { setName(value); onDirty(value !== initial); }} style={[styles.card, styles.text]} />
    {!!error && <Text style={styles.error}>{error}</Text>}<Action title="Áp dụng tên vào bản nháp" disabled={disabled} onPress={() => { if (!name.trim()) { setError('Tên chuyến từ 1 đến 80 ký tự.'); return; } setError(''); onApply(name.trim()); onDirty(false); }} /></View>;
}
