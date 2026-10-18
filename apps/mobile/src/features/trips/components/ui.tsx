import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotionPressable, settle } from './motion';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  cream: '#FFF8EF', paper: '#FFFCF7', ink: '#123E4B', teal: '#00858C', tealDark: '#006F78',
  muted: '#60757B', line: '#E9E1D5', mint: '#E8F3F1', orange: '#F58220', sand: '#FFF0D9',
  error: '#A63730', white: '#FFFFFF', primaryText: '#FFFFFF',
};
export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 21, color = colors.teal }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} accessible={false} aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />;
}
export function Action({ title, onPress, disabled = false, secondary = false, icon, compact = false, accessibilityLabel, tone = 'orange' }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; icon?: IconName; compact?: boolean; accessibilityLabel?: string; tone?: 'orange' | 'teal';
}) {
  const body = <>{icon && <Icon name={icon} size={19} color={secondary ? colors.tealDark : colors.primaryText} />}<Text style={[styles.buttonText, secondary && { color: colors.tealDark }]}>{title}</Text></>;
  return <MotionPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ borderRadius: 28, overflow: 'hidden', minWidth: 0, minHeight: compact ? 44 : 50, flexShrink: 1, opacity: disabled ? 0.45 : 1 }}>
    {secondary ? <View style={[styles.button, styles.secondary, compact && styles.compactButton]}>{body}</View>
      : <LinearGradient colors={tone === 'teal' ? ['#008D91', '#007D84', '#006F78'] : ['#FFA62C', '#FA8B16', '#F3790B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.button, compact && styles.compactButton]}>{body}</LinearGradient>}
  </MotionPressable>;
}
export function IconButton({ name, label, onPress, disabled = false, danger = false }: { name: IconName; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <MotionPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: danger ? '#FFF0E9' : colors.mint, opacity: disabled ? 0.35 : 1 }}>
    <Icon name={name} color={danger ? colors.error : colors.tealDark} />
  </MotionPressable>;
}
export function Badge({ children, warm = false }: { children: ReactNode; warm?: boolean }) {
  return <View style={{ alignSelf: 'flex-start', backgroundColor: warm ? colors.sand : colors.mint, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 12, maxWidth: '100%' }}><Text style={{ color: warm ? '#975211' : colors.tealDark, fontSize: 12, lineHeight: 18, fontWeight: '600', flexShrink: 1 }}>{children}</Text></View>;
}
export function SectionTitle({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: IconName }) {
  return <View style={{ gap: 5 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>{icon && <Icon name={icon} />}<Text accessibilityRole="header" style={[styles.sectionTitle, { flex: 1 }]}>{title}</Text></View>{subtitle && <Text style={styles.caption}>{subtitle}</Text>}</View>;
}
export function Disclosure({ title, children, subtitle }: { title: string; children: ReactNode; subtitle?: string }) {
  const [open, setOpen] = useState(false);
  const rotation = useSharedValue(0);
  useEffect(() => { rotation.set(withSpring(open ? 180 : 0, settle)); }, [open, rotation]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return <View style={styles.card}>
    <MotionPressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 44 }}>
      <View style={{ flex: 1, gap: 3 }}><Text style={styles.sectionTitle}>{title}</Text>{subtitle && <Text style={styles.caption}>{subtitle}</Text>}</View><Animated.View style={chevron}><Icon name="chevron-down" size={18} /></Animated.View>
    </MotionPressable>
    <View style={{ display: open ? 'flex' : 'none', gap: 14 }}>{children}</View>
  </View>;
}
export function DayChip({ title, date, selected, disabled, onPress }: { title: string; date: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return <MotionPressable accessibilityRole="button" accessibilityLabel={`${title}, ${date}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={{ minWidth: 87, minHeight: 48, borderRadius: 22, paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.tealDark : '#F0F1ED', opacity: disabled ? 0.45 : 1, gap: 3 }}>
    <Text style={{ color: selected ? 'white' : colors.ink, fontSize: 14, fontWeight: '700' }}>{title}</Text><Text style={{ color: selected ? '#E1F4F1' : colors.muted, fontSize: 12 }}>{date}</Text>
  </MotionPressable>;
}
export function dateLabel(value: string) {
  const parts = value.split('-'); return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}
export function ConfirmDialog({ visible, title, message, confirm, onConfirm, onCancel, busy = false, error }: {
  visible: boolean; title: string; message: string; confirm: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; error?: string;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}>
    <SafeAreaView style={styles.overlay}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}><View style={styles.dialog} accessibilityViewIsModal>
      <Text accessibilityRole="header" style={styles.heading}>{title}</Text><Text style={styles.text}>{message}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Action title={busy ? 'Đang xử lý…' : confirm} disabled={busy} onPress={onConfirm} />
      <Action title="Ở lại" secondary disabled={busy} onPress={onCancel} />
    </View></ScrollView></SafeAreaView>
  </Modal>;
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 16, gap: 14, paddingBottom: 24 },
  heading: { fontSize: 23, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: colors.ink, flexShrink: 1 },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  text: { fontSize: 14, lineHeight: 21, color: colors.muted, flexShrink: 1 },
  caption: { fontSize: 12, lineHeight: 19, color: colors.muted, flexShrink: 1 },
  label: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: colors.ink },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.paper, fontSize: 14, color: colors.ink, minWidth: 0 },
  button: { minHeight: 50, paddingVertical: 13, paddingHorizontal: 20, flexDirection: 'row', gap: 9, borderRadius: 28, justifyContent: 'center', alignItems: 'center', minWidth: 0 },
  compactButton: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 16 },
  secondary: { backgroundColor: colors.mint },
  buttonText: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: colors.primaryText, textAlign: 'center', flexShrink: 1 },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 12 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  divider: { height: 1, backgroundColor: colors.line },
  error: { color: colors.error, fontSize: 14, lineHeight: 22, flexShrink: 1 },
  notice: { padding: 15, backgroundColor: colors.sand, borderRadius: 16, gap: 6 },
  footer: { padding: 16, paddingTop: 12, gap: 9, backgroundColor: colors.cream, borderTopWidth: 1, borderTopColor: colors.line, width: '100%', maxWidth: 640, alignSelf: 'center' },
  overlay: { flex: 1, padding: 24, backgroundColor: '#123E4B99', justifyContent: 'center' },
  dialog: { width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: colors.cream, borderRadius: 26, padding: 24, gap: 18 },
});
