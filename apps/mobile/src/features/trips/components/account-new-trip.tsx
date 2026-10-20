import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { generateSampleTrip } from '@goease/itinerary';
import { todayAtDestination, type Trip, type CatalogEntry } from '@goease/contracts';
import { initialTripForm, validateTripForm, type TripFormField } from '../create-trip-controller';
import { Action, SectionTitle, styles } from './ui';
export function AccountNewTrip({ disabled, onCreate, onCancel, catalog }: { disabled: boolean; onCreate: (trip: Trip) => Promise<void>; onCancel: () => void; catalog: CatalogEntry[] }) {
  const [form, setForm] = useState(() => initialTripForm(new Date())), [message, setMessage] = useState('');
  const fields: [TripFormField, string][] = [['name','Tên chuyến'],['startDate','Ngày bắt đầu YYYY-MM-DD'],['durationDays','Số ngày 1–5'],['people','Số người 1–20'],['budgetVnd','Ngân sách nhóm VND, trống = chưa đặt']];
  return <View style={styles.card}>
    <SectionTitle title="Chuyến mới · Đà Lạt" icon="add-circle-outline" />
    {fields.map(([key, label]) => <View key={key} style={{ gap: 7 }}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={form[key]} onChangeText={value => setForm(old => ({ ...old, [key]: value }))} editable={!disabled} autoCapitalize="none" keyboardType={key === 'name' || key === 'startDate' ? 'default' : 'number-pad'} maxLength={key === 'name' ? 80 : 30} style={styles.input} /></View>)}
    {!!message && <Text style={styles.error}>{message}</Text>}
    <Action title="Tạo lịch trình mẫu" icon="arrow-forward" disabled={disabled} onPress={() => {
      const today = todayAtDestination(new Date()), validated = validateTripForm(form, today);
      if (!validated.ok) { setMessage(Object.values(validated.errors).join('\n')); return; }
      const generated = generateSampleTrip(validated.input, catalog, { tripId: randomUUID(), today });
      if (!generated.ok) { setMessage(generated.message); return; } void onCreate(generated.trip);
    }} />
    <Action title="Hủy" secondary disabled={disabled} onPress={onCancel} />
  </View>;
}
