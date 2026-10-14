import { Component, useEffect, useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { DayMap } from '../map-controller';
import { Action, styles } from './ui';

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Text accessibilityRole="alert" style={styles.error}>Không mở được view bản đồ. Danh sách địa điểm vẫn ở bên dưới; hãy thử tải lại bản đồ.</Text> : this.props.children; }
}
function NativeMap({ model }: { model: DayMap }) {
  const [ready, setReady] = useState(false), [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 20000); return () => clearTimeout(timer); }, []);
  if (!model.region) return null;
  return <View style={{ gap: 10 }}>
    {!ready && <Text accessibilityRole={slow ? 'alert' : 'text'} style={slow ? styles.error : styles.text}>{slow ? 'Chưa xác nhận bản đồ sẵn sàng. Kiểm tra mạng và thử tải lại; danh sách địa điểm vẫn dùng được.' : 'Đang mở bản đồ…'}</Text>}
    <MapView accessibilityLabel={`Bản đồ ${model.date}, ${model.pins.length} địa điểm`} style={{ width: '100%', height: 360 }} initialRegion={model.region}
      onMapReady={() => setReady(true)} showsUserLocation={false} showsMyLocationButton={false} toolbarEnabled={false}>
      {model.pins.map((pin) => <Marker key={pin.placeId} identifier={pin.placeId} coordinate={pin.coordinates} title={pin.name}
        description={pin.activities.map((activity) => `${activity.order}. ${activity.name}`).join(' · ')} />)}
    </MapView>
    <Text style={styles.text}>Nếu nền bản đồ trống hoặc không tải ô bản đồ, kiểm tra mạng và thử tải lại. Danh sách bên dưới không phụ thuộc nền bản đồ.</Text>
  </View>;
}
export default function DayMapCanvas({ model }: { model: DayMap }) {
  const [attempt, setAttempt] = useState(0);
  return <View style={{ gap: 12 }}>
    <Text style={styles.text}>Provider: {Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps'}. Pin lấy từ catalog demo; không phải vị trí hiện tại hoặc tuyến di chuyển.</Text>
    <MapBoundary key={attempt}><NativeMap model={model} /></MapBoundary>
    <Action title="Tải lại bản đồ / vừa khung pin" secondary onPress={() => setAttempt((value) => value + 1)} />
  </View>;
}
