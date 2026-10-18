import { Text, View } from 'react-native';
import type { DayMap } from '../map-controller';
import { Icon, styles } from './ui';

// Metro selects day-map.native.tsx on Android/iOS. Web never imports native maps.
export default function DayMapCanvas({ model }: { model: DayMap }) {
  return <View style={[styles.card, { alignItems: 'center', paddingVertical: 28 }]}><Icon name="map-outline" size={36} /><Text style={styles.sectionTitle}>Bản đồ trên điện thoại</Text><Text style={[styles.text, { textAlign: 'center' }]}>Mở bằng Expo Go Android hoặc iOS để xem bản đồ. Trên trình duyệt, bạn có thể xem danh sách địa điểm bên dưới.</Text><Text style={styles.caption}>{model.pins.length} địa điểm có tọa độ trong ngày.</Text></View>;
}
