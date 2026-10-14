import type { Trip } from '@goease/contracts';
import { Text, View } from 'react-native';
import { budgetView } from '../budget-controller';
import { styles } from './ui';

export function BudgetSummary({ trip, draft = false, dayId }: { trip: Trip; draft?: boolean; dayId?: string }) {
  const view = budgetView(trip);
  const day = view.days.find((item) => item.dayId === dayId);
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={{ ...styles.text, fontWeight: '700' }}>Ngân sách nhóm · {draft ? 'Bản nháp' : 'Đã lưu'}</Text>
    <Text style={styles.text}>Ngân sách: {view.budgetText}</Text>
    <Text style={styles.text}>Chi phí đã biết toàn chuyến: {view.knownText}</Text>
    <Text style={styles.text}>{view.completeness}</Text>
    <Text accessibilityRole={view.warning ? 'alert' : 'text'} style={view.warning ? styles.error : styles.text}>{view.difference}</Text>
    {view.summary.unknownCostCount > 0 && view.summary.remainingVnd !== null && <Text style={styles.text}>Chênh lệch chưa tính các khoản chưa có giá; không phải số tiền chắc chắn đủ cho chuyến.</Text>}
    <Text style={styles.text}>Mỗi khoản là tổng nhóm, không nhân lại với {trip.people} người.</Text>
    {day && <View style={{ gap: 8, borderTopWidth: 1, borderColor: '#CBD8CE', paddingTop: 12 }}>
      <Text style={{ ...styles.text, fontWeight: '700' }}>Chi phí ngày {day.date}: {day.knownText}</Text>
      <Text style={styles.text}>{day.completeness}</Text>
    </View>}
  </View>;
}
