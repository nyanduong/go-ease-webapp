import { useSyncExternalStore } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { qaStorageControls } from '../local-trip-store';
import { Action, styles } from './ui';

export function QaStorageBanner() {
  const status = useSyncExternalStore(qaStorageControls.subscribe, qaStorageControls.getSnapshot, qaStorageControls.getSnapshot);
  if (!__DEV__ || (!status.readArmed && !status.writeArmed && !status.failures)) return null;
  return <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFF1CC' }}><ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ padding: 8, gap: 6 }}>
    <Text style={styles.text}>QA DEV · Lỗi chờ: {status.readArmed ? 'đọc ' : ''}{status.writeArmed ? 'ghi' : ''} · Đã chặn {status.failures} lần ({status.lastFailure || 'chưa có'}). Không ghi/xóa byte kho khi gây lỗi.</Text>
    <Action title="Tắt và xóa trạng thái lỗi QA" secondary onPress={() => qaStorageControls.reset()} />
  </ScrollView></SafeAreaView>;
}
