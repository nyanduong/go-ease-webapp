import { Text, View } from 'react-native';
import type { DayMap } from '../map-controller';
import { styles } from './ui';

// Metro selects day-map.native.tsx on Android/iOS. Web never imports native maps.
export default function DayMapCanvas({ model }: { model: DayMap }) {
  return <View style={styles.card}><Text style={styles.text}>Bản đồ native chỉ có trên Expo Go Android/iOS. Browser hiển thị danh sách địa điểm bên dưới; không mô phỏng bản đồ hoặc tuyến.</Text><Text style={styles.text}>{model.pins.length} địa điểm có tọa độ trong ngày.</Text></View>;
}
