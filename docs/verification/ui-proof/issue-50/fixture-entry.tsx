import { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SAMPLE_DESTINATION, type TripSummary } from '@goease/contracts';
import { TripsList, type TripsListProps } from './src/features/trips/list';
import { Brand, PhotoCredit } from './src/ui/components';
import { colors } from './src/ui/theme';

const trip: TripSummary = {
  id: '550e8400-e29b-41d4-a716-446655440050', title: 'Cuối tuần cùng nhau',
  destinationCode: SAMPLE_DESTINATION, isSample: true, startDate: '2026-10-17',
  durationDays: 2, groupSize: 4, budgetVnd: 6000000, version: 1,
  createdAt: '2026-10-12T03:00:00.000Z', updatedAt: '2026-10-12T03:00:00.000Z',
};
const scenarios = ['Đã lưu', 'Rỗng', 'Lỗi', 'Đang đọc', 'Bản nháp', 'Đang gửi'] as const;
function UiProof() {
  const [scenario, setScenario] = useState(0);
  const [notice, setNotice] = useState('Không gọi API; không đăng nhập.');
  const status: TripsListProps['status'] = scenario === 2 ? 'error' : scenario === 3 ? 'loading' : 'ready';
  const message = status === 'error' ? 'Không đọc được chuyến. Bạn có thể thử lại.'
    : status === 'loading' ? 'Đang đọc chuyến…' : scenario === 1 ? 'Bạn chưa có chuyến đi đã lưu.' : 'Đã đọc 1 chuyến mẫu.';
  const action = (name: string) => setNotice(`Fixture nhận thao tác: ${name}.`);
  return <SafeAreaProvider><StatusBar barStyle="dark-content" /><SafeAreaView style={styles.screen}>
    <View style={styles.fixture}><View style={styles.fixtureCopy}><Text style={styles.fixtureTitle}>KIỂM TRA THÀNH PHẦN NATIVE · {scenarios[scenario]}</Text><Text style={styles.fixtureText}>{notice}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Đổi ca kiểm thử" onPress={() => { setScenario((scenario + 1) % scenarios.length); setNotice('Không gọi API; không đăng nhập.'); }} style={styles.fixtureButton}><Text style={styles.fixtureText}>Đổi ca</Text></Pressable></View>
    <View style={styles.header}><Brand /><Text style={styles.headerTitle}>Chuyến đi</Text></View>
    <ScrollView contentContainerStyle={styles.content}>
      <TripsList trips={scenario === 1 || scenario === 3 ? [] : [trip]} status={status} message={message}
        locked={scenario === 3 || scenario === 5} resume={scenario === 4 ? 'draft' : scenario === 5 ? 'pending' : null} hasMore={false}
        onCreate={() => action('Tạo chuyến mẫu')} onResume={() => action('Tiếp tục bản đang chỉnh/gửi')}
        onRetry={() => action('Đọc chuyến lại')} onMore={() => action('Đọc thêm chuyến')} onOpen={() => action('Mở chuyến mẫu')} />
      <PhotoCredit />
    </ScrollView>
  </SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  content: { padding: 16, gap: 20, paddingBottom: 32 },
  fixture: { backgroundColor: '#EAF4F3', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fixtureCopy: { flex: 1, paddingVertical: 6 }, fixtureTitle: { color: colors.teal, fontSize: 10, fontWeight: '700' },
  fixtureText: { color: colors.ink, fontSize: 11 }, fixtureButton: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' },
});
registerRootComponent(UiProof);
