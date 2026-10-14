import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, StyleSheet } from 'react-native';
import { useLocalTrips } from '@/features/trips/local-trip-store';
import type { Trip } from '@goease/contracts';

const QA_ID = 'qa-local-storage-smoke-v1';
function sample(): Trip {
  return {
    schemaVersion: 1, id: QA_ID, name: 'QA lưu chuyến — bản 1', destinationId: 'da-lat',
    timeZone: 'Asia/Ho_Chi_Minh', currency: 'VND', startDate: '2026-11-20', durationDays: 1,
    people: 4, budgetVnd: 3_000_000,
    days: [{ id: 'qa-day-1', date: '2026-11-20', activities: [{ id: 'qa-activity-1', name: 'Hoạt động kiểm thử',
      location: { kind: 'custom' }, startTime: '09:00', endTime: '10:00', costVnd: null, notes: 'Dữ liệu QA, không phải chuyến thật.' }] }],
  };
}

function StorageCheck() {
  const { state, actions } = useLocalTrips();
  const [message, setMessage] = useState('Chỉ thao tác chuyến QA riêng, không xóa các chuyến khác.');
  const saved = state.trips.find((item) => item.trip.id === QA_ID);
  const busy = state.loadStatus === 'loading' || state.writeStatus === 'saving' || state.writeStatus === 'deleting';
  const button = (label: string, action: () => void | Promise<void>) => (
    <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => {
      void Promise.resolve().then(action).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Lỗi kiểm thử'));
    }}><Text style={styles.buttonText}>{label}</Text></Pressable>
  );
  return <ScrollView contentContainerStyle={styles.page}>
    <Text accessibilityRole="header" style={styles.heading}>Kiểm tra lưu chuyến (dev)</Text>
    <Text>Đọc: {state.loadStatus} • Ghi: {state.writeStatus}</Text>
    <Text testID="storage-saved">Đã lưu: {saved ? `${saved.trip.name} • revision ${saved.revision} • giá ${String(saved.trip.days[0]?.activities[0]?.costVnd)}` : 'Chưa có chuyến QA'}</Text>
    <Text>Draft RAM: {state.draft?.trip.name ?? 'không có'}</Text>
    <Text>{message}</Text>
    <Text>{state.readError?.message ?? state.writeError?.message ?? ''}</Text>
    <Text>Bản ghi lỗi: {state.issues.length}</Text>
    {button('1. Tạo draft QA', () => { actions.beginNew(sample()); setMessage('Draft chưa được lưu.'); })}
    {button('2. Lưu draft', async () => { setMessage(await actions.saveDraft() ? 'Lưu thành công' : 'Chưa lưu; kiểm tra lỗi/draft.'); })}
    {button('3. Sửa thành bản 2', () => {
      if (!saved) throw new Error('Chưa có chuyến QA đã lưu.');
      actions.beginEdit(saved);
      actions.changeDraft({ ...saved.trip, name: 'QA lưu chuyến — bản 2', days: saved.trip.days.map((day) => ({ ...day, activities: day.activities.map((item) => ({ ...item, costVnd: 0, notes: 'Đã sửa và lưu.' })) })) });
      setMessage('Bản 2 còn là draft; bấm Lưu draft.');
    })}
    {button('Hủy draft', () => actions.cancelDraft())}
    {button('Tải lại kho', async () => { setMessage(await actions.load() ? 'Đã đọc lại kho' : 'Đọc lỗi'); })}
    {button('4. Xóa riêng chuyến QA', async () => {
      if (!saved) { setMessage('Không có chuyến QA để xóa.'); return; }
      setMessage(await actions.deleteSaved(QA_ID, saved.revision) ? 'Đã xóa chuyến QA' : 'Chưa xóa; kiểm tra lỗi.');
    })}
    <Text>Sau khi lưu: đóng hẳn Expo Go, mở lại cùng QR và vào màn này. Bản đã lưu phải còn; draft chưa lưu phải mất.</Text>
  </ScrollView>;
}

export default function StorageCheckRoute() { return __DEV__ ? <StorageCheck /> : <Redirect href="/" />; }
const styles = StyleSheet.create({ page: { padding: 24, gap: 16, paddingBottom: 50 }, heading: { fontSize: 24, fontWeight: '700' }, button: { padding: 16, minHeight: 48, backgroundColor: '#125C46', borderRadius: 10 }, buttonText: { color: 'white', fontSize: 16 } });
