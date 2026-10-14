import { DESTINATION, TRIP_LIMITS } from '@goease/contracts';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AboutScreen() {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Đi cùng nhau, khám phá nhiều hơn.</Text>
        <Text style={styles.text}>GoEase hướng tới việc giúp nhóm bạn lên kế hoạch du lịch tại Việt Nam, chỉnh lịch trình và theo dõi ngân sách chung.</Text>
        <Text style={styles.text}>Bản này có màn chào và điều hướng để team bắt đầu xây dựng. Chưa có đăng nhập, AI, bản đồ hay dữ liệu chuyến được lưu.</Text>
        <Text style={styles.text}>Demo tiếp theo: {DESTINATION.name}, 1–{TRIP_LIMITS.maxDays} ngày, tối đa {TRIP_LIMITS.maxPeople} người.</Text>
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
