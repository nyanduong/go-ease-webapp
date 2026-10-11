import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { calculateTripTotals, calculateTripWarnings } from '@goease/contracts';
import { apiBaseUrl } from '../../lib/config';
import { useNativeAuth } from '../auth/context';
import { AuthPanel } from '../auth/panel';
import { MapsPanel } from '../maps/panel';
import { createTripsClient } from './client';
import { copyForm, emptyActivity, updateBody, type ActivityForm, type CreateForm } from './form';
import { createTripsStore } from './store';
import { tripMapActivities } from './map';

function Action({ label, onPress, disabled = false, secondary = false, selected }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}
function Field({ label, value, onChange, numeric = false, multiline = false, editable = true, hint }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; multiline?: boolean; editable?: boolean; hint?: string | undefined }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={editable}
    inputMode={numeric ? 'numeric' : 'text'} multiline={multiline} autoCorrect={false} style={[styles.input, multiline && styles.multiline, !editable && styles.disabled]} />{hint && <Text style={styles.small}>{hint}</Text>}</View>;
}
function money(value: number | null) { return value === null ? 'Chưa xác định' : `${value.toLocaleString('vi-VN')} VND`; }
export function TripsPanel({ onTechnical, active = true }: { onTechnical: () => void; active?: boolean }) {
  const { store: auth, state: session } = useNativeAuth();
  const store = useMemo(() => {
    let url = ''; try { url = apiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__ ? 'development' : 'preview'); } catch { /* Client gives fixed configuration error. */ }
    return createTripsStore(createTripsClient(url), auth, randomUUID);
  }, [auth]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  const [editor, setEditor] = useState<{ ownerId: string; tripId: string; day: number; index: number; form: ActivityForm } | null>(null), [editorError, setEditorError] = useState('');
  useEffect(() => store.connect(), [store]);
  useEffect(() => { setEditor(null); }, [state.saved?.id]);
  const locked = state.pending !== null || state.mutation === 'sending' || state.mutation === 'refreshing';
  const visible = state.available && session.kind === 'signedIn' && Boolean(session.user) && state.ownerId === session.user!.id.toLowerCase();
  const editorVisible = visible && editor !== null && editor.ownerId === state.ownerId && editor.tripId === state.saved?.id;
  function back() { if (editor) { setEditor(null); return true; } if (state.screen === 'map') { store.show('detail'); return true; } if (state.screen !== 'list') { store.show('list'); return true; } return false; }
  useEffect(() => { if (!active) return; const subscription = BackHandler.addEventListener('hardwareBackPress', back); return () => subscription.remove(); });
  const draft = state.draft, saved = state.saved, day = draft?.days[state.selectedDay - 1];
  let preview: ReturnType<typeof updateBody> | undefined, previewError = '';
  try { if (draft && saved) preview = updateBody(draft, saved.version); } catch { previewError = 'Chưa thể lưu: tên phải có 1–160 ký tự, nhóm 1–50 người, tiền là số nguyên 0–1.000.000.000.000 hoặc để trống, giờ đi theo cặp HH:mm tăng dần.'; }
  const totals = preview ? calculateTripTotals(preview.days) : saved?.totals, warnings = preview ? calculateTripWarnings(preview.days, preview.budgetVnd) : undefined;
  const mapActivities = saved && draft ? tripMapActivities(saved, draft, state.selectedDay) : [];
  function confirmDiscard(run: () => void) {
    if (state.pending) { Alert.alert('Đang chờ xác nhận', 'Thử lại bản gửi đã khóa trước khi mở chuyến khác. Không tạo key mới.'); return; }
    if (state.dirty) Alert.alert('Bỏ thay đổi chưa lưu?', 'Bản đang chỉnh chỉ ở RAM của phiên app. Mở bản máy chủ sẽ thay nội dung này.', [{ text: 'Giữ bản nháp', style: 'cancel' }, { text: 'Mở bản máy chủ', style: 'destructive', onPress: run }]);
    else run();
  }
  function editActivity(index: number) { if (!day || !saved || !state.ownerId || locked) return; setEditorError(''); setEditor({ ownerId: state.ownerId, tripId: saved.id, day: state.selectedDay, index, form: copyForm(index < 0 ? emptyActivity() : day.activities[index]!) }); }
  function applyActivity() {
    if (!editorVisible || !editor || !draft || !saved || locked) return;
    const next = copyForm(draft), activities = next.days[editor.day - 1]!.activities;
    if (editor.index < 0) { if (activities.length >= 50) { setEditorError('Tối đa 50 hoạt động mỗi ngày.'); return; } activities.push(editor.form); }
    else activities[editor.index] = editor.form;
    try { updateBody(next, saved.version); store.edit(next, editor.ownerId, editor.tripId); setEditor(null); }
    catch (error) { setEditorError(error instanceof Error ? error.message : 'Kiểm tra hoạt động.'); }
  }
  function moveActivity(index: number, targetDay: number, direction?: number) {
    if (!draft || locked) return;
    const next = copyForm(draft), source = next.days[state.selectedDay - 1]!.activities, target = next.days[targetDay - 1]!.activities;
    if (direction !== undefined) { const other = index + direction; if (other < 0 || other >= source.length) return; [source[index], source[other]] = [source[other]!, source[index]!]; }
    else { if (target.length >= 50) return; target.push(source.splice(index, 1)[0]!); }
    store.edit(next, state.ownerId, saved?.id);
  }
  const formField = (key: keyof CreateForm, label: string, hint?: string, numeric = false) => <Field label={label} value={state.create[key]} onChange={value => store.setCreate({ ...state.create, [key]: value }, state.ownerId)} hint={hint} numeric={numeric} editable={!locked} />;
  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}>{visible && state.screen !== 'list' ? <Action label={Platform.OS === 'ios' ? 'Chuyến đi' : 'Quay lại'} secondary onPress={() => { back(); }} /> : <Text style={styles.brand}>GoEase</Text>}<Text style={styles.headerTitle}>{visible ? state.screen === 'create' ? 'Tạo chuyến' : state.screen === 'list' ? 'Chuyến đi' : 'Lịch trình' : 'Đi cùng nhau, dễ hơn'}</Text></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!visible ? <><Text style={styles.heading}>Một chuyến đi.{ '\n' }Nhiều điều để nhớ.</Text><Text style={styles.text}>Gom lịch trình, địa điểm và ngân sách cả nhóm vào một nơi. Chuyến riêng chỉ tài khoản của bạn quản lý.</Text><AuthPanel />
        <Text style={styles.small}>Đang kiểm tra phiên sẽ ẩn lịch trình và dừng request. Bản nháp RAM chỉ hiện lại khi máy chủ xác minh cùng tài khoản.</Text></> : <>
        {state.screen === 'list' && <><Text style={styles.eyebrow}>CÙNG NHAU LÊN ĐƯỜNG</Text><Text style={styles.heading}>Chuyến đi của tôi</Text><AuthPanel />
          <Action label="Tạo chuyến mẫu" disabled={locked} onPress={() => confirmDiscard(() => store.create())} />
          {(state.saved && state.dirty || state.pending) && <Action label={state.pending ? 'Tiếp tục bản đang gửi' : 'Tiếp tục bản đang chỉnh'} secondary onPress={() => store.show('detail')} />}
          <Text accessibilityLiveRegion="polite" style={styles.text}>{state.listMessage}</Text>
          {state.listStatus === 'error' && <Action label="Đọc chuyến lại" secondary onPress={() => { void store.list(); }} />}
          {state.trips.map(trip => <View style={styles.card} key={trip.id}><Text style={styles.pill}>Hà Nội · mẫu kỹ thuật</Text><Text style={styles.title}>{trip.title}</Text><Text style={styles.text}>{trip.startDate} · {trip.durationDays} ngày · {trip.groupSize} người</Text><Text style={styles.small}>{money(trip.budgetVnd)} / cả nhóm · phiên bản {trip.version}</Text>
            <Action label={`Mở ${trip.title}`} secondary disabled={locked} onPress={() => confirmDiscard(() => { void store.open(trip.id, true); })} /></View>)}
          {state.nextCursor && <Action label="Đọc thêm chuyến" secondary disabled={state.listStatus === 'loading'} onPress={() => { void store.list(true); }} />}
        </>}
        {state.screen === 'create' && <><Text style={styles.pill}>Hà Nội · bộ dữ liệu thử, chưa chốt điểm đến mở thử</Text><Text style={styles.heading}>Mình đi đâu nhỉ?</Text>
          {formField('title', 'Tên chuyến đi')}{formField('startDate', 'Ngày khởi hành · YYYY-MM-DD', 'Ngày thực từ 2000 đến 2099; ngày cuối cũng phải nằm trong khoảng này.')}
          {formField('durationDays', 'Số ngày · 1–5', undefined, true)}{formField('groupSize', 'Số người · 1–50', undefined, true)}
          {formField('budgetVnd', 'Ngân sách cả nhóm · VND', 'Để trống nếu chưa biết. 0 nghĩa là đã biết miễn phí.', true)}
          <Action label="Tạo lịch trình mẫu" disabled={locked} onPress={() => { void store.submitCreate(); }} />
          <Text style={styles.small}>Mẫu từ dữ liệu có nguồn, chưa phải AI, giá hoặc booking đã xác nhận.</Text></>}
        {(state.screen === 'detail' || state.screen === 'map') && <>
          {state.detailStatus === 'loading' ? <Text style={styles.text}>Đang mở chuyến…</Text> : state.detailStatus === 'error' ? <View><Text style={styles.text}>{state.message}</Text>{state.detailId && <Action label="Mở bản máy chủ lại" secondary onPress={() => confirmDiscard(() => { void store.open(state.detailId!, true); })} />}</View> : saved && draft && <>
            <Text style={styles.pill}>Hà Nội · lịch trình mẫu</Text><Text style={styles.heading}>{draft.title || 'Lịch trình'}</Text><Text style={styles.small}>{saved.startDate} · {saved.durationDays} ngày · {saved.timeZone}. Ngày và số ngày cố định sau khi tạo.</Text>
            <View style={styles.tabs}>{saved.days.map(item => <Action key={item.id} label={`Ngày ${item.dayNumber} · ${item.date}`} selected={item.dayNumber === state.selectedDay} secondary={item.dayNumber !== state.selectedDay} onPress={() => store.selectDay(item.dayNumber)} />)}</View>
            {state.screen === 'map' ? active && <MapsPanel activities={mapActivities} dayLabel={`Ngày ${state.selectedDay}`} /> : <>
              <View style={styles.card}><Text style={styles.title}>Ngân sách tổng cả nhóm</Text><Text style={styles.text}>{money(preview?.budgetVnd ?? (draft.budgetVnd === '' ? null : saved.budgetVnd))}</Text>
                {totals && <Text style={styles.text}>Đã biết: {money(totals.knownSubtotalVnd)} · {totals.unknownCostCount} khoản chưa biết.{totals.estimatedTotalVnd === null ? ' Chưa có tổng ước tính hoàn chỉnh.' : ` Tổng ước tính: ${money(totals.estimatedTotalVnd)}.`}</Text>}
                {!preview && <Text style={styles.small}>Form còn chưa hợp lệ; tổng trên là bản máy chủ trước khi chỉnh.</Text>}</View>
              <Field label="Tên chuyến" value={draft.title} editable={!locked} onChange={value => store.edit({ ...draft, title: value }, state.ownerId, saved.id)} />
              <Field label="Số người" value={draft.groupSize} numeric editable={!locked} onChange={value => store.edit({ ...draft, groupSize: value }, state.ownerId, saved.id)} hint="Số nguyên từ 1 đến 50; đổi số người không nhân lại các khoản chi phí." />
              <Field label="Ngân sách nhóm · VND" value={draft.budgetVnd} numeric editable={!locked} onChange={value => store.edit({ ...draft, budgetVnd: value }, state.ownerId, saved.id)} hint="Không nhân lại chi phí khi đổi số người. Trống khác 0." />
              {previewError !== '' && <Text accessibilityLiveRegion="polite" style={styles.warning}>{previewError}</Text>}
              {warnings?.map((warning, index) => <Text key={index} style={styles.warning}>{warning.code === 'BUDGET_EXCEEDED' ? 'Chi phí đã biết vượt ngân sách nhóm.' : `Ngày ${warning.dayNumber}: có giờ hoạt động chồng nhau. Có thể lưu và chỉnh lại.`}</Text>)}
              <Text style={styles.title}>Nhịp đi ngày {state.selectedDay}</Text>{day?.activities.length === 0 && <Text style={styles.text}>Ngày này còn để ngỏ. Thêm hoạt động hoặc để nhóm tự khám phá.</Text>}
              {day?.activities.map((activity, index) => <View style={styles.card} key={activity.id ?? `new-${index}`}><Text style={styles.small}>{activity.start ? `${activity.start} – ${activity.end}` : 'Chưa chọn giờ'}</Text><Text style={styles.title}>{activity.title}</Text><Text style={styles.text}>{activity.notes || 'Chưa có ghi chú.'}</Text><Text style={styles.small}>{activity.cost === '' ? 'Chi phí chưa có' : `${activity.cost} VND / cả nhóm`}</Text>
                <Action label={`Sửa hoạt động ${index + 1}`} secondary disabled={locked} onPress={() => editActivity(index)} />
                <View style={styles.tabs}><Action label={`Lên ${index + 1}`} secondary disabled={locked || index === 0} onPress={() => moveActivity(index, state.selectedDay, -1)} /><Action label={`Xuống ${index + 1}`} secondary disabled={locked || index === day.activities.length - 1} onPress={() => moveActivity(index, state.selectedDay, 1)} />
                  {saved.durationDays > 1 && <Action label={`Sang ngày ${state.selectedDay % saved.durationDays + 1}`} secondary disabled={locked || (draft.days[state.selectedDay % saved.durationDays]?.activities.length ?? 50) >= 50} onPress={() => moveActivity(index, state.selectedDay % saved.durationDays + 1)} />}</View>
                <Action label={`Xóa hoạt động ${index + 1}`} secondary disabled={locked} onPress={() => Alert.alert('Xóa khỏi bản nháp?', 'Chỉ áp dụng trên máy chủ khi lưu chuyến.', [{ text: 'Giữ', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => { const next = copyForm(draft); next.days[state.selectedDay - 1]!.activities.splice(index, 1); store.edit(next, state.ownerId, saved.id); } }])} /></View>)}
              <Action label="Thêm hoạt động" secondary disabled={locked || (day?.activities.length ?? 50) >= 50} onPress={() => editActivity(-1)} />
              <Action label="Mở bản máy chủ" secondary disabled={locked} onPress={() => confirmDiscard(() => { void store.open(saved.id, true); })} />
            </>}
          </>}
        </>}
        <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
        {state.pending && <View style={styles.warningCard}><Text style={styles.title}>{state.mutation === 'sending' || state.mutation === 'refreshing' ? 'Đang chờ máy chủ' : 'Chưa xác nhận đồng bộ'}</Text><Text style={styles.text}>Bản gửi bất biến được giữ trong RAM. Không sửa hoặc tạo key mới khi chưa rõ kết quả.</Text>
          {state.mutation === 'sending' || state.mutation === 'refreshing' ? <Action label="Dừng chờ kết quả" secondary onPress={store.cancelRequest} /> : <Action label={state.pending.acknowledgedId ? 'Đọc lại bản hiện tại' : 'Thử lại đúng bản gửi'} onPress={() => { void store.retry(); }} />}</View>}
      </>}
      <Action label="Kiểm tra kỹ thuật" secondary onPress={onTechnical} />
      <Text style={styles.small}>Bản chưa lưu chỉ ở phiên app, không bảo đảm qua OS kill. Bản đã lưu được đọc lại từ server khi đăng nhập và mở chuyến.</Text>
    </ScrollView>
    {visible && saved && state.detailStatus === 'ready' && state.detailId === saved.id && (state.screen === 'detail' || state.screen === 'map') && <View style={styles.footer}><Text style={styles.small}>{locked ? 'Bản gửi đang khóa' : state.dirty ? 'Có thay đổi chưa lưu' : `Bản máy chủ v${saved.version}`}</Text><View style={styles.tabs}><Action label="Chuyến đi" secondary onPress={() => store.show('list')} /><Action label={state.screen === 'map' ? 'Lịch trình' : 'Bản đồ ngày'} secondary onPress={() => store.show(state.screen === 'map' ? 'detail' : 'map')} /><Action label="Lưu chuyến" disabled={locked || !state.dirty || !preview} onPress={() => { void store.save(); }} /></View></View>}
    <Modal visible={active && editorVisible} transparent animationType="slide" onRequestClose={() => setEditor(null)} accessibilityViewIsModal>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.modal}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
        <Text accessibilityRole="header" style={styles.title}>{editor?.index === -1 ? 'Thêm hoạt động' : 'Chỉnh hoạt động'}</Text><Text style={styles.small}>Cập nhật bản nháp trước; lưu chuyến để gửi máy chủ.</Text>
        {editorVisible && editor && <>{(['title', 'start', 'end', 'cost', 'notes'] as const).map(key => <Field key={key} label={{ title: 'Tên hoạt động', start: 'Bắt đầu · HH:mm', end: 'Kết thúc · HH:mm', cost: 'Chi phí nhóm · VND', notes: 'Ghi chú' }[key]} value={editor.form[key]} multiline={key === 'notes'} numeric={key === 'cost'}
          onChange={value => setEditor({ ...editor, form: { ...editor.form, [key]: value } })} hint={key === 'cost' ? 'Trống là chưa biết; 0 là miễn phí.' : key === 'end' ? '24:00 chỉ được dùng làm giờ kết thúc.' : undefined} />)}</>}
        {editorError !== '' && <Text accessibilityLiveRegion="polite" style={styles.warning}>{editorError}</Text>}
        <Action label="Cập nhật bản nháp" onPress={applyActivity} disabled={locked} /><Action label="Hủy chỉnh hoạt động" secondary onPress={() => setEditor(null)} />
      </ScrollView></View></KeyboardAvoidingView>
    </Modal>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, header: { paddingHorizontal: 17, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderColor: '#dbe3db' },
  brand: { color: '#145c4c', fontSize: 27, fontWeight: '800' }, headerTitle: { color: '#1e332d', fontWeight: '700', flexShrink: 1 },
  content: { padding: 18, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center', paddingBottom: 32 }, heading: { color: '#1e332d', fontSize: 28, fontWeight: '700' },
  eyebrow: { color: '#62766d', fontSize: 12, fontWeight: '700' }, title: { color: '#1e332d', fontSize: 19, fontWeight: '700' }, text: { color: '#40594e', fontSize: 15, lineHeight: 23 }, small: { color: '#62766d', fontSize: 13, lineHeight: 20 },
  pill: { color: '#145c4c', fontSize: 13, fontWeight: '600' }, card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#dbe3db', padding: 17, gap: 12 },
  field: { gap: 7 }, label: { color: '#1e332d', fontWeight: '600', fontSize: 15 }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#bdcbc0', borderRadius: 10, padding: 13, minHeight: Platform.OS === 'ios' ? 44 : 48, color: '#1e332d', fontSize: 16 }, multiline: { minHeight: 110, textAlignVertical: 'top' },
  button: { backgroundColor: '#145c4c', borderRadius: 12, minHeight: Platform.OS === 'ios' ? 44 : 48, padding: 13, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#fff', fontSize: 14, fontWeight: '700', flexShrink: 1 }, secondary: { backgroundColor: '#edf2eb', borderWidth: 1, borderColor: '#dbe3db' }, secondaryText: { color: '#145c4c' }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.75 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, footer: { padding: 12, borderTopWidth: 1, borderColor: '#dbe3db', backgroundColor: '#fff', gap: 8 }, warning: { color: '#9c3530', fontSize: 14, lineHeight: 22 }, warningCard: { backgroundColor: '#f4e7c9', borderRadius: 15, padding: 15, gap: 12 },
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 18 }, modal: { maxHeight: '92%', backgroundColor: '#f3f4ef', borderRadius: 20 }, modalContent: { padding: 20, gap: 14 },
});
