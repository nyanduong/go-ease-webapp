import { DESTINATION, TRIP_LIMITS } from '@goease/contracts';
import { CATALOG_INFO, getDalatPlaces } from '@goease/catalog';
import { SAMPLE_LABEL } from '@goease/itinerary';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const catalogSize = getDalatPlaces().length;

export default function AboutScreen() {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Đi cùng nhau, khám phá nhiều hơn.</Text>
        <Text style={styles.text}>GoEase hướng tới việc giúp nhóm bạn lên kế hoạch du lịch tại Việt Nam, chỉnh lịch trình và theo dõi ngân sách chung.</Text>
        <Text style={styles.text}>Demo khách đã có tạo/xem/chỉnh chuyến, ngân sách nhóm và bản đồ địa điểm theo ngày, lưu trên thiết bị. Chưa có đăng nhập, đồng bộ hoặc AI online.</Text>
        <Text style={styles.text}>Demo tiếp theo: {DESTINATION.name}, 1–{TRIP_LIMITS.maxDays} ngày, tối đa {TRIP_LIMITS.maxPeople} người.</Text>
        <Text style={styles.text}>Catalog demo: {catalogSize} địa điểm. {CATALOG_INFO.label}</Text>
        <Text style={styles.text}>{SAMPLE_LABEL}</Text>
        {__DEV__ && <Link href="/storage-check" style={styles.text}>Kiểm tra lưu chuyến (dev)</Link>}
        {__DEV__ && <Link href="/catalog-check" style={styles.text}>Kiểm tra catalog API (dev)</Link>}
        {__DEV__ && <Link href="/https-check" style={styles.text}>Kiểm tra HTTPS API (dev)</Link>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 24, gap: 20, width: '100%', maxWidth: 608, alignSelf: 'center' },
  title: { fontSize: 30, lineHeight: 40, fontWeight: '700', color: '#172A23' },
  text: { fontSize: 17, lineHeight: 28, color: '#465A50' },
});
