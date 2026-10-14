import { getDalatPlaces } from '@goease/catalog';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalTrips } from '../local-trip-store';
import { projectDayMap, type DayMap } from '../map-controller';
import DayMapCanvas from '../components/day-map';
import { Action, styles } from '../components/ui';

export default function TripMapScreen() {
  const params = useLocalSearchParams<{ id?: string; dayId?: string; mode?: string }>();
  return <MapSession key={`${params.id}:${params.dayId}:${params.mode}`} id={params.id ?? ''} initialDayId={params.dayId ?? ''} draftRequested={params.mode === 'draft'} />;
}
function MapSession({ id, initialDayId, draftRequested }: { id: string; initialDayId: string; draftRequested: boolean }) {
  const { state, actions } = useLocalTrips(); const [dayId, setDayId] = useState(initialDayId);
  const draft = draftRequested && state.draft?.trip.id === id ? state.draft.trip : null;
  const trip = draft ?? state.trips.find((item) => item.trip.id === id)?.trip;
  const day = trip?.days.find((item) => item.id === dayId) ?? trip?.days[0];
  let model: DayMap | null = null, projectionError = false;
  if (trip && day) { try { model = projectDayMap(trip, day.id, getDalatPlaces()); } catch { projectionError = true; } }
  const back = () => { if (router.canGoBack()) router.back(); else router.replace({ pathname: '/trips/[id]', params: { id } }); };
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
    <Stack.Screen options={{ title: 'Bản đồ theo ngày', headerBackTitle: 'Lịch trình' }} />
    <ScrollView contentContainerStyle={styles.content}>
      <Action title="Về lịch trình" secondary onPress={back} />
      {(state.loadStatus === 'idle' || state.loadStatus === 'loading') && <ActivityIndicator accessibilityLabel="Đang đọc chuyến" />}
      {state.loadStatus === 'error' && <><Text accessibilityRole="alert" style={styles.error}>{state.readError?.message}</Text><Action title="Thử đọc lại chuyến" onPress={() => { void actions.load(); }} /></>}
      {!trip && state.loadStatus === 'ready' && <Text style={styles.text}>Không tìm thấy chuyến. Chuyến có thể đã bị xóa hoặc đường dẫn không hợp lệ.</Text>}
      {trip && day && <>
        <Text accessibilityRole="header" style={styles.heading}>{trip.name}</Text>
        <Text style={styles.text}>Đang xem {draft ? 'bản nháp đã áp dụng' : 'bản đã lưu'} · Không sửa hoặc lưu chuyến tại bản đồ.</Text>
        {draftRequested && !draft && <Text style={styles.error}>Draft không còn; đang hiển thị bản đã lưu nếu có.</Text>}
        <ScrollView horizontal contentContainerStyle={{ gap: 10 }}>{trip.days.map((item, index) => <Action key={item.id} title={`${item.id === day.id ? '✓ ' : ''}Ngày ${index + 1}`} secondary={item.id !== day.id} onPress={() => setDayId(item.id)} />)}</ScrollView>
        <Text accessibilityRole="header" style={styles.heading}>{day.date}</Text>
        {projectionError && <Text accessibilityRole="alert" style={styles.error}>Không đọc được tọa độ/ngày từ dữ liệu hiện tại. Không vẽ pin thay thế; quay về lịch trình để kiểm tra.</Text>}
        {model && <>
          {model.region ? <DayMapCanvas key={`${model.dayId}:${JSON.stringify(model.pins)}`} model={model} /> : <Text style={styles.text}>{model.activityCount === 0 ? 'Ngày này chưa có hoạt động.' : 'Ngày này không có địa điểm có tọa độ để vẽ pin.'}</Text>}
          <Text accessibilityRole="header" style={styles.heading}>Địa điểm trong ngày · {model.pins.length} pin</Text>
          {model.pins.map((pin) => <View key={pin.placeId} style={styles.card}>
            <Text style={{ ...styles.text, fontWeight: '700' }}>{pin.name}</Text>
            {pin.activities.map((activity) => <Text key={activity.id} style={styles.text}>{activity.order}. {activity.name}</Text>)}
          </View>)}
          {model.unlocated.map((activity) => <View key={activity.id} style={styles.card}>
            <Text style={styles.text}>{activity.order}. {activity.name}</Text>
            <Text style={styles.text}>{activity.reason === 'custom' ? 'Hoạt động tự nhập: không có tọa độ, không vẽ pin.' : 'Không tìm thấy Place trong catalog hiện tại: không vẽ pin thay thế.'}</Text>
          </View>)}
          <Text style={styles.text}>Các hoạt động cùng Place dùng chung một pin; thứ tự ở danh sách theo lịch trình. Không vẽ tuyến, ước tính khoảng cách hoặc thời gian di chuyển.</Text>
          <Text style={styles.text}>Tọa độ từ catalog có nguồn. Giữ nguyên logo/attribution của provider trên bản đồ.</Text>
        </>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
