import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { TripSummary } from '@goease/contracts';
import { Action, TravelHero } from '../../ui/components';
import { colors, radius, space, typography } from '../../ui/theme';

export interface TripsListProps {
  trips: readonly TripSummary[]; status: 'idle' | 'loading' | 'ready' | 'error'; message: string;
  locked: boolean; resume: 'pending' | 'draft' | null; hasMore: boolean;
  onCreate: () => void; onResume: () => void; onRetry: () => void; onMore: () => void; onOpen: (id: string) => void;
}
export function TripsList(props: TripsListProps) {
  return <>
    <TravelHero onCreate={props.onCreate} disabled={props.locked} />
    {props.resume && <View style={styles.resume}><Text style={styles.title}>Hành trình còn đang mở</Text>
      <Text style={styles.body}>{props.resume === 'pending' ? 'Bản gửi đang chờ xác nhận. Tiếp tục với đúng nội dung đã gửi.' : 'Những thay đổi của bạn vẫn ở đây trong phiên app.'}</Text>
      <Action label={props.resume === 'pending' ? 'Tiếp tục bản đang gửi' : 'Tiếp tục bản đang chỉnh'} secondary onPress={props.onResume} /></View>}
    <View style={styles.sectionTitle}><Text accessibilityRole="header" style={styles.heading}>Chuyến đi của tôi</Text><Text style={styles.small}>Lịch trình đã lưu, luôn dễ tìm.</Text></View>
    <View accessibilityLiveRegion="polite" style={styles.status}>
      {props.status === 'loading' && <ActivityIndicator color={colors.teal} accessibilityLabel="Đang đọc chuyến" />}
      <Text style={styles.body}>{props.message}</Text>
      {props.status === 'error' && <Action label="Đọc chuyến lại" secondary onPress={props.onRetry} />}
      {props.status === 'ready' && props.trips.length === 0 && <Text style={styles.emptyTitle}>Chuyến đầu tiên đang chờ bạn.</Text>}
    </View>
    {props.trips.map(trip => <View style={styles.card} key={trip.id}>
      <View style={styles.cardHeading}><Text style={styles.pill}>HÀ NỘI · MẪU KỸ THUẬT</Text><Text style={styles.saved}>Đã lưu</Text></View>
      <Text style={styles.title}>{trip.title}</Text>
      <Text style={styles.body}>{trip.startDate} · {trip.durationDays} ngày · {trip.groupSize} người</Text>
      <View style={styles.budget}><Text style={styles.small}>Ngân sách cả nhóm</Text><Text style={styles.amount}>{trip.budgetVnd === null ? 'Chưa xác định' : `${trip.budgetVnd.toLocaleString('vi-VN')} VND`}</Text></View>
      <Action label={`Mở ${trip.title}`} secondary disabled={props.locked} onPress={() => props.onOpen(trip.id)} />
      <Text style={styles.small}>Bản máy chủ · phiên bản {trip.version}</Text>
    </View>)}
    {props.hasMore && <Action label="Đọc thêm chuyến" secondary disabled={props.status === 'loading'} onPress={props.onMore} />}
  </>;
}
const styles = StyleSheet.create({
  sectionTitle: { gap: space.xs, marginTop: space.sm }, heading: { ...typography.title, color: colors.ink, fontSize: 24, lineHeight: 32 },
  title: { ...typography.title, color: colors.ink }, body: { ...typography.body, color: colors.muted }, small: { ...typography.small, color: colors.muted },
  resume: { backgroundColor: colors.warningSurface, borderRadius: radius.card, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: colors.warning },
  status: { gap: space.md }, emptyTitle: { ...typography.title, color: colors.teal, paddingVertical: space.lg },
  card: { backgroundColor: colors.white, borderRadius: radius.card, padding: space.xl, gap: space.md, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderLeftColor: colors.teal },
  cardHeading: { gap: space.sm, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  pill: { ...typography.eyebrow, color: colors.teal, letterSpacing: 0.4 }, saved: { ...typography.small, color: colors.teal },
  budget: { backgroundColor: colors.cream, padding: space.md, gap: space.xs, borderRadius: radius.input }, amount: { ...typography.title, color: colors.ink },
});
