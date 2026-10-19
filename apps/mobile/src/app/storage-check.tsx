import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, Platform, useWindowDimensions } from 'react-native';
import Constants from 'expo-constants';
import { qaStorageControls, useLocalTrips } from '@/features/trips/local-trip-store';
import type { Trip } from '@goease/contracts';
import { Action, styles } from '@/features/trips/components/ui';

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
  const { fontScale } = useWindowDimensions();
  const model = Platform.OS === 'ios' ? Constants.platform?.ios?.model ?? Constants.platform?.ios?.platform ?? 'chưa có' : Platform.OS === 'android' ? Platform.constants.Model : 'browser';
  useEffect(() => {
    if (__DEV__) console.info('[GoEase QA runtime]', JSON.stringify({ os: Platform.OS, version: String(Platform.Version), expoGo: Constants.expoVersion, model, fontScale }));
  }, [fontScale, model]);
  const [message, setMessage] = useState('Chỉ thao tác chuyến QA riêng, không xóa các chuyến khác.');
  const saved = state.trips.find((item) => item.trip.id === QA_ID);
  const busy = state.loadStatus === 'loading' || state.writeStatus === 'saving' || state.writeStatus === 'deleting';
  const button = (label: string, action: () => void | Promise<void>) => (
    <Action title={label} secondary disabled={busy} onPress={() => {
      void Promise.resolve().then(action).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Lỗi kiểm thử'));
    }} />
  );
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.heading}>Kiểm tra lưu chuyến (dev)</Text>
    <Text>Thiết bị: {Platform.OS} {String(Platform.Version)} • {model} • Expo Go {Constants.expoVersion ?? 'không có'} • fontScale {fontScale.toFixed(2)}</Text>
    <Text>Lỗi QA một lần, xảy ra trước I/O thật. Không sửa/xóa kho. Retry sau lỗi dùng lại AsyncStorage thật. Chỉ dành dev; flags mất khi đóng hẳn app.</Text>
    {button('QA: Gây lỗi đọc kế tiếp', () => { qaStorageControls.arm('read'); setMessage('Đã arm lỗi đọc. Bấm Tải lại kho hoặc quay lại luồng sản phẩm cần đọc.'); })}
    {button('QA: Gây lỗi ghi kế tiếp', () => { qaStorageControls.arm('write'); setMessage('Đã arm lỗi ghi. Quay về tạo/sửa/xóa chuyến và kiểm tra lỗi + retry.'); })}
    {button('QA: Tắt lỗi có kiểm soát', () => { qaStorageControls.reset(); setMessage('Đã tắt lỗi QA; kho dữ liệu không thay đổi.'); })}
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
