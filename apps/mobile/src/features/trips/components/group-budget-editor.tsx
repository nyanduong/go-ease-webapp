import type { Trip } from '@goease/contracts';
import { useRef, useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
import { groupForm, parseGroupForm, type GroupErrors, type GroupForm } from '../budget-controller';
import { Action, colors, SectionTitle, styles } from './ui';

export function GroupBudgetEditor({ trip, disabled, onApply, onCancel }: { trip: Trip; disabled: boolean; onApply: (trip: Trip) => void; onCancel: () => void }) {
  const [form, setForm] = useState(() => groupForm(trip)), [errors, setErrors] = useState<GroupErrors>({});
  const peopleInput = useRef<TextInput>(null), budgetInput = useRef<TextInput>(null);
  const field = (key: keyof GroupForm, label: string) => <View style={{ gap: 6 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput ref={key === 'people' ? peopleInput : budgetInput} accessibilityLabel={label} value={form[key]} editable={!disabled} keyboardType="number-pad"
      onChangeText={(value) => { setForm((old) => ({ ...old, [key]: value })); setErrors((old) => ({ ...old, [key]: undefined })); }}
      maxLength={30} style={[styles.input, errors[key] && { borderColor: colors.error }]} />
    {errors[key] && <Text accessibilityRole="alert" style={styles.error}>{errors[key]}</Text>}
  </View>;
  return <View style={styles.card}>
    <SectionTitle title="Ngân sách và số người" icon="wallet-outline" />
    {field('people', 'Số người trong nhóm (1–20)')}
    {field('budgetVnd', 'Ngân sách tổng nhóm (VND)')}
    <Text style={styles.caption}>Để trống là chưa đặt; 0 là ngân sách 0 VND. Nhập số nguyên không có dấu phân cách, tối đa 1.000.000.000 VND.</Text>
    <Text style={styles.caption}>Đổi số người không nhân hoặc chia lại chi phí hoạt động đã nhập.</Text>
    <Action title="Áp dụng thay đổi" icon="checkmark-outline" disabled={disabled} onPress={() => {
      const result = parseGroupForm(trip, form);
      if (!result.ok) { setErrors(result.errors); (result.errors.people ? peopleInput : budgetInput).current?.focus(); return; }
      Keyboard.dismiss(); onApply(result.trip);
    }} />
    <Action title="Hủy" secondary disabled={disabled} onPress={onCancel} />
  </View>;
}
