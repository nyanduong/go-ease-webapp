import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { getDalatCatalog } from '@goease/catalog';
import { generateSampleTrip } from '@goease/itinerary';
import { todayAtDestination, type Trip } from '@goease/contracts';
import { initialTripForm, validateTripForm, type TripFormValues } from '../create-trip-controller';
import { Action, styles } from './ui';
export function AccountNewTrip({ disabled, onCreate, onCancel }: { disabled: boolean; onCreate: (trip: Trip) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState(() => initialTripForm(new Date())), [message, setMessage] = useState('');
  const fields: [keyof TripFormValues, string][] = [['name','Tên chuyến'],['startDate','Ngày bắt đầu YYYY-MM-DD'],['durationDays','Số ngày 1–5'],['people','Số người 1–20'],['budgetVnd','Ngân sách nhóm VND, trống = chưa đặt']];
  return <View style={styles.card}>
    <Text style={styles.heading}>Chuyến mới · Đà Lạt</Text>
    {fields.map(([key, label]) => <View key={key}><Text style={styles.text}>{label}</Text><TextInput accessibilityLabel={label} value={form[key]} onChangeText={value => setForm(old => ({ ...old, [key]: value }))} editable={!disabled} autoCapitalize="none" keyboardType={key === 'name' || key === 'startDate' ? 'default' : 'number-pad'} maxLength={key === 'name' ? 80 : 30} style={[styles.card, styles.text]} /></View>)}
    {!!message && <Text style={styles.error}>{message}</Text>}
    <Action title="Tạo bản nháp mẫu để kiểm tra" disabled={disabled} onPress={() => {
      const today = todayAtDestination(new Date()), validated = validateTripForm(form, today);
      if (!validated.ok) { setMessage(Object.values(validated.errors).join('\n')); return; }
      const generated = generateSampleTrip(validated.input, getDalatCatalog(), { tripId: randomUUID(), today });
      if (!generated.ok) { setMessage(generated.message); return; } void onCreate(generated.trip);
    }} />
    <Action title="Bỏ form tạo chuyến" secondary disabled={disabled} onPress={onCancel} />
  </View>;
}
