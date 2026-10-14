import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function Action({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && { opacity: 0.55 }]}>
    <Text style={[styles.buttonText, secondary && { color: '#125C46' }]}>{title}</Text>
  </Pressable>;
}
export function ConfirmDialog({ visible, title, message, confirm, onConfirm, onCancel, busy = false, error }: {
  visible: boolean; title: string; message: string; confirm: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; error?: string;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}>
    <View style={styles.overlay}><View style={styles.dialog} accessibilityViewIsModal>
      <Text accessibilityRole="header" style={styles.heading}>{title}</Text><Text style={styles.text}>{message}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Action title={busy ? 'Đang xử lý…' : confirm} disabled={busy} onPress={onConfirm} />
      <Action title="Ở lại / Hủy" secondary disabled={busy} onPress={onCancel} />
    </View></View>
  </Modal>;
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8F5' }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 24, gap: 18, paddingBottom: 48 },
  heading: { fontSize: 26, lineHeight: 34, fontWeight: '700', color: '#172A23' }, text: { fontSize: 16, lineHeight: 24, color: '#465A50' },
  button: { minHeight: 48, padding: 15, borderRadius: 12, backgroundColor: '#125C46', justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: '#E2EEE7' }, buttonText: { fontSize: 16, fontWeight: '600', color: 'white' },
  card: { backgroundColor: 'white', borderRadius: 18, padding: 20, gap: 12, marginBottom: 16 }, error: { color: '#9E2929', fontSize: 15, lineHeight: 22 },
  overlay: { flex: 1, padding: 24, backgroundColor: '#00000080', justifyContent: 'center' }, dialog: { backgroundColor: 'white', borderRadius: 18, padding: 24, gap: 18 },
});
