import type { Trip } from '@goease/contracts';
import { Text, View } from 'react-native';
import { budgetView } from '../budget-controller';
import { Badge, colors, dateLabel, Icon, styles } from './ui';

export function BudgetSummary({ trip, draft = false, dayId }: { trip: Trip; draft?: boolean; dayId?: string }) {
  const view = budgetView(trip);
  const day = view.days.find((item) => item.dayId === dayId);
  return <View style={{ gap: 16 }}>
    <View style={[styles.notice, { gap: 10 }]}><View style={styles.row}><Icon name="wallet-outline" color="#A9661C" /><Text accessibilityRole="header" style={[styles.sectionTitle, { flex: 1 }]}>Ngân sách nhóm</Text><Badge warm>{draft ? 'Bản nháp' : 'Đã lưu'}</Badge></View><Text style={styles.caption}>Chi phí đã biết toàn chuyến</Text><Text style={[styles.heading, { color: colors.tealDark }]}>{view.knownText}</Text><Text style={styles.caption}>{view.completeness}</Text></View>
    <View style={{ gap: 12, paddingHorizontal: 4 }}><Text style={styles.label}>Ngân sách đặt ra: {view.budgetText}</Text>
    <Text accessibilityRole={view.warning ? 'alert' : 'text'} style={view.warning ? styles.error : styles.text}>{view.difference}</Text>
    {view.summary.unknownCostCount > 0 && view.summary.remainingVnd !== null && <Text style={styles.text}>Chênh lệch chưa tính các khoản chưa có giá; không phải số tiền chắc chắn đủ cho chuyến.</Text>}
    <Text style={styles.caption}>Mỗi khoản là tổng nhóm, không nhân lại với {trip.people} người.</Text></View>
    {day && <View style={[styles.card, { gap: 8 }]}>
      <Text style={styles.label}>Chi phí ngày {dateLabel(day.date)}: {day.knownText}</Text>
      <Text style={styles.text}>{day.completeness}</Text>
    </View>}
  </View>;
}
