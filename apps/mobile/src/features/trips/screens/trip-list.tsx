import { SAMPLE_LABEL } from '@goease/itinerary';
import { summarizeBudget } from '@goease/contracts';
import type { SavedTrip } from '@goease/trip-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalTrips } from '../local-trip-store';
import { Action, ConfirmDialog, styles } from '../components/ui';

export default function TripListScreen() {
  const { state, actions } = useLocalTrips();
  const [deleting, setDeleting] = useState<SavedTrip | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const busy = state.loadStatus === 'loading' || state.writeStatus === 'saving' || state.writeStatus === 'deleting';
  const writable = state.loadStatus === 'ready' && !state.issues.length && !busy;
  return <SafeAreaView style={styles.page}>
    <FlatList data={state.trips} keyExtractor={(saved) => saved.trip.id} contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={{ gap: 16 }}>
        <Text style={{ color: '#125C46', fontSize: 28, fontWeight: '800' }}>GoEase</Text>
        <Text accessibilityRole="header" style={styles.heading}>Chuyến đi của tôi</Text>
        <Text style={styles.text}>Chế độ khách · Lưu trên thiết bị này</Text>
        <Action title="+ Tạo chuyến" disabled={!writable} onPress={() => router.push('/trips/new')} />
        <Action title="Về GoEase" secondary onPress={() => router.push('/about')} />
        <Text style={styles.text}>{SAMPLE_LABEL}</Text>
        <Text style={styles.text}>Giờ chỉ là gợi ý; chưa kiểm tra giờ mở cửa, thời gian di chuyển hoặc tối ưu tuyến.</Text>
        {(state.loadStatus === 'idle' || state.loadStatus === 'loading') && <ActivityIndicator accessibilityLabel="Đang đọc chuyến" />}
        {state.loadStatus === 'error' && <><Text accessibilityRole="alert" style={styles.error}>{state.readError?.message} {state.trips.length ? 'Danh sách bên dưới là dữ liệu lần đọc trước.' : ''}</Text><Action title="Thử đọc lại" onPress={() => { void actions.load(); }} /></>}
        {!!state.issues.length && <Text accessibilityRole="alert" style={styles.error}>Có {state.issues.length} bản ghi lỗi. Các chuyến hợp lệ vẫn được giữ; tạm chặn tạo/xóa để bảo toàn dữ liệu.</Text>}
      </View>}
      ListEmptyComponent={state.loadStatus === 'ready' && !state.issues.length ? <View style={styles.card}><Text style={styles.heading}>Bạn chưa có chuyến nào</Text><Text style={styles.text}>Tạo lịch trình mẫu đầu tiên cho nhóm tại Đà Lạt.</Text></View> : null}
      renderItem={({ item }) => {
        const { trip } = item; const budget = summarizeBudget(trip);
        return <View style={styles.card}>
          <Text accessibilityRole="header" style={{ ...styles.heading, fontSize: 21 }}>{trip.name}</Text>
          <Text style={styles.text}>Đà Lạt · {trip.startDate} → {trip.days.at(-1)?.date}</Text>
          <Text style={styles.text}>{trip.durationDays} ngày · {trip.people} người · {trip.days.reduce((sum, day) => sum + day.activities.length, 0)} hoạt động</Text>
          <Text style={styles.text}>Ngân sách nhóm: {trip.budgetVnd === null ? 'Chưa đặt' : `${trip.budgetVnd.toLocaleString('vi-VN')} đ`}</Text>
          <Text style={styles.text}>Chi phí đã biết: {budget.knownCostVnd.toLocaleString('vi-VN')} đ · {budget.unknownCostCount} khoản chưa có giá</Text>
          {budget.unknownCostCount > 0 && <Text style={styles.text}>Tổng chi phí chưa đầy đủ.</Text>}
          {trip.days.some((day) => day.activities.some((activity) => activity.costVnd !== null)) && <Text style={styles.text}>Chi phí là ước tính cho nhóm, chưa phải báo giá hoặc booking.</Text>}
          {budget.overBudgetVnd !== null && budget.overBudgetVnd > 0 && <Text style={styles.error}>Tổng tham khảo đã vượt ngân sách {budget.overBudgetVnd.toLocaleString('vi-VN')} đ.</Text>}
          <Action title={`Xóa chuyến ${trip.name}`} secondary disabled={!writable} onPress={() => { setDeleteError(''); setDeleting(item); }} />
        </View>;
      }} />
    <ConfirmDialog visible={deleting !== null} title="Xóa chuyến?" message={`Xóa “${deleting?.trip.name ?? ''}” khỏi thiết bị này?`} confirm="Xóa chuyến" error={deleteError} busy={busy}
      onCancel={() => { setDeleting(null); setDeleteError(''); }} onConfirm={() => {
        if (!deleting) return;
        void actions.deleteSaved(deleting.trip.id, deleting.revision).then((ok) => {
          if (ok) setDeleting(null); else setDeleteError(actions.getSnapshot().writeError?.message ?? 'Chưa xóa được; chuyến vẫn được giữ.');
        });
      }} />
  </SafeAreaView>;
}
