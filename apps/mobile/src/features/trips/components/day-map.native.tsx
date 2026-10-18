import { Component, useEffect, useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { DayMap } from '../map-controller';
import { Action, colors, styles } from './ui';

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Text accessibilityRole="alert" style={styles.error}>Không mở được view bản đồ. Danh sách địa điểm vẫn ở bên dưới; hãy thử tải lại bản đồ.</Text> : this.props.children; }
}
function NativeMap({ model }: { model: DayMap }) {
  const [ready, setReady] = useState(false), [loaded, setLoaded] = useState(false), [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 20000); return () => clearTimeout(timer); }, []);
  if (!model.region) return null;
  return <View style={{ gap: 10 }}>
    {!loaded && <Text accessibilityRole={slow ? 'alert' : 'text'} style={slow ? styles.error : styles.text}>{slow ? 'Chưa tải được nền bản đồ. Kiểm tra mạng hoặc cấu hình dịch vụ bản đồ; danh sách địa điểm bên dưới vẫn dùng được.' : ready ? 'Đang tải nền bản đồ…' : 'Đang mở bản đồ…'}</Text>}
    <View style={{ borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}><MapView accessibilityLabel={`Bản đồ ${model.date}, ${model.pins.length} địa điểm`} style={{ width: '100%', height: 340 }} initialRegion={model.region}
      onMapReady={() => { setReady(true); if (Platform.OS !== 'android') setLoaded(true); }} onMapLoaded={() => setLoaded(true)} showsUserLocation={false} showsMyLocationButton={false} toolbarEnabled={false}>
      {model.pins.map((pin) => <Marker key={pin.placeId} identifier={pin.placeId} coordinate={pin.coordinates} title={pin.name}
        description={pin.activities.map((activity) => `${activity.order}. ${activity.name}`).join(' · ')} />)}
    </MapView></View>
    <Text style={styles.caption}>Nếu nền bản đồ chưa tải được, bạn vẫn có thể xem danh sách địa điểm bên dưới.</Text>
  </View>;
}
export default function DayMapCanvas({ model }: { model: DayMap }) {
  const [attempt, setAttempt] = useState(0);
  return <View style={{ gap: 12 }}>
    <Text style={styles.caption}>{Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps'} · Địa điểm từ danh mục · Không sử dụng vị trí hiện tại</Text>
    <MapBoundary key={attempt}><NativeMap model={model} /></MapBoundary>
    <Action title="Tải lại bản đồ" icon="refresh-outline" secondary onPress={() => setAttempt((value) => value + 1)} />
  </View>;
}
