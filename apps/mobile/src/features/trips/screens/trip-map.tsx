import { getDalatPlaces } from '@goease/catalog';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalTrips } from '../local-trip-store';
import { projectDayMap, type DayMap } from '../map-controller';
import DayMapCanvas from '../components/day-map';
import { Action, Badge, colors, dateLabel, DayChip, Disclosure, Icon, SectionTitle, styles } from '../components/ui';

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
      {(state.loadStatus === 'idle' || state.loadStatus === 'loading') && <ActivityIndicator accessibilityLabel="Đang đọc chuyến" />}
      {state.loadStatus === 'error' && <><Text accessibilityRole="alert" style={styles.error}>{state.readError?.message}</Text><Action title="Thử đọc lại chuyến" onPress={() => { void actions.load(); }} /></>}
      {!trip && state.loadStatus === 'ready' && <Text style={styles.text}>Không tìm thấy chuyến. Chuyến có thể đã bị xóa hoặc đường dẫn không hợp lệ.</Text>}
      {trip && day && <>
        <Badge>{draft ? 'Bản nháp đã áp dụng' : 'Chuyến đã lưu'}</Badge><Text accessibilityRole="header" style={styles.heading}>{trip.name}</Text>
        <Text style={styles.text}>Nhìn lại các điểm dừng chân trong ngày của bạn.</Text>
        {draftRequested && !draft && <Text style={styles.error}>Draft không còn; đang hiển thị bản đã lưu nếu có.</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{trip.days.map((item, index) => <DayChip key={item.id} title={`Ngày ${index + 1}`} date={dateLabel(item.date).slice(0, 5)} selected={item.id === day.id} onPress={() => setDayId(item.id)} />)}</ScrollView>
        {projectionError && <Text accessibilityRole="alert" style={styles.error}>Không đọc được tọa độ/ngày từ dữ liệu hiện tại. Không vẽ pin thay thế; quay về lịch trình để kiểm tra.</Text>}
        {model && <>
          {model.region ? <DayMapCanvas key={`${model.dayId}:${JSON.stringify(model.pins)}`} model={model} /> : <Text style={styles.text}>{model.activityCount === 0 ? 'Ngày này chưa có hoạt động.' : 'Ngày này không có địa điểm có tọa độ để vẽ pin.'}</Text>}
          <SectionTitle title="Địa điểm trong ngày" subtitle={`${dateLabel(day.date)} · ${model.pins.length} điểm có tọa độ`} icon="location-outline" />
          {model.pins.map((pin, index) => <View key={pin.placeId} style={[styles.card, { flexDirection: 'row', alignItems: 'flex-start', gap: 13 }]}>
            <View style={{ backgroundColor: colors.mint, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}><Text style={[styles.label, { color: colors.tealDark }]}>{index + 1}</Text></View><View style={{ flex: 1, gap: 6 }}><Text style={styles.sectionTitle}>{pin.name}</Text>
            {pin.activities.map((activity) => <Text key={activity.id} style={styles.caption}>{activity.order}. {activity.name}</Text>)}</View>
          </View>)}
          {model.unlocated.map((activity) => <View key={activity.id} style={styles.card}>
            <View style={styles.row}><Icon name="location-outline" color={colors.muted} /><Text style={[styles.sectionTitle, { flex: 1 }]}>{activity.order}. {activity.name}</Text></View>
            <Text style={styles.caption}>{activity.reason === 'custom' ? 'Hoạt động tự nhập · Chưa có tọa độ' : 'Địa điểm không còn trong danh mục · Chưa có tọa độ'}</Text>
          </View>)}
          <Disclosure title="Thông tin bản đồ"><Text style={styles.text}>Các hoạt động cùng địa điểm dùng chung một pin; thứ tự ở danh sách theo lịch trình. Bản đồ chưa vẽ tuyến hoặc tính thời gian di chuyển.</Text><Text style={styles.caption}>Tọa độ từ danh mục có nguồn. Xem tên nhà cung cấp và thông tin ghi công ngay trên bản đồ.</Text></Disclosure>
        </>}
      </>}
      <Action title="Về lịch trình" secondary icon="arrow-back" onPress={back} />
    </ScrollView>
  </SafeAreaView>;
}
