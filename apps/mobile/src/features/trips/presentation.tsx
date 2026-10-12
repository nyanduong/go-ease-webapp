import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TripTotals } from '@goease/contracts';
import type { ActivityForm } from './form';
import { colors, radius, space, typography } from '../../ui/theme';

export function money(value: number | null) { return value === null ? 'Chưa xác định' : `${value.toLocaleString('vi-VN')} VND`; }
export function BudgetCard({ budget, totals, fromServer }: { budget: number | null; totals: TripTotals | undefined; fromServer: boolean }) {
  return <View style={styles.budget}>
    <Text style={styles.eyebrow}>NGÂN SÁCH TỔNG CẢ NHÓM</Text><Text style={styles.amount}>{money(budget)}</Text>
    {totals && <><Text style={styles.body}>Đã biết: {money(totals.knownSubtotalVnd)} · {totals.unknownCostCount} khoản chưa biết.</Text>
      <Text style={styles.body}>{totals.estimatedTotalVnd === null ? 'Chưa có tổng ước tính hoàn chỉnh.' : `Tổng ước tính: ${money(totals.estimatedTotalVnd)}.`}</Text></>}
    {fromServer && <Text style={styles.small}>Form còn chưa hợp lệ; tổng trên là bản máy chủ trước khi chỉnh.</Text>}
  </View>;
}
export function ActivityCard({ activity, index, children }: { activity: ActivityForm; index: number; children: ReactNode }) {
  return <View style={styles.activity}>
    <View style={styles.timeRow}><Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text><Text style={styles.time}>{activity.start ? `${activity.start} – ${activity.end}` : 'Chưa chọn giờ'}</Text></View>
    <Text style={styles.title}>{activity.title}</Text><Text style={styles.body}>{activity.notes || 'Chưa có ghi chú.'}</Text>
    <Text style={styles.cost}>{activity.cost === '' ? 'Chi phí chưa có' : `${activity.cost} VND / cả nhóm`}</Text>
    <View style={styles.actions}>{children}</View>
  </View>;
}
const styles = StyleSheet.create({
  budget: { padding: space.xl, gap: space.md, borderRadius: radius.card, backgroundColor: colors.warningSurface },
  eyebrow: { ...typography.eyebrow, color: colors.ink, letterSpacing: 0.5 }, amount: { ...typography.heading, color: colors.ink, fontSize: 26, lineHeight: 34 },
  body: { ...typography.body, color: colors.muted }, small: { ...typography.small, color: colors.muted }, title: { ...typography.title, color: colors.ink },
  activity: { backgroundColor: colors.white, borderRadius: radius.card, padding: space.xl, gap: space.md, borderLeftWidth: 4, borderLeftColor: colors.teal, borderWidth: 1, borderColor: colors.line },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  number: { ...typography.small, color: colors.teal, fontWeight: '700', backgroundColor: colors.soft, padding: space.sm, borderRadius: radius.input },
  time: { ...typography.body, color: colors.warning, fontWeight: '600' }, cost: { ...typography.small, color: colors.ink }, actions: { gap: space.md },
});
