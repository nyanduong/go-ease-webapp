import type { Place } from '@goease/contracts';
import { useRef, useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
import { parseActivityForm, type ActivityErrors, type ActivityForm } from '../edit-trip-controller';
import { Action, styles } from './ui';

export function ActivityEditor({ initial, activityId, places, disabled, onApply, onCancel }: {
  initial: ActivityForm; activityId: string; places: Place[]; disabled: boolean;
  onApply: (activity: import('@goease/contracts').Activity) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState(initial), [errors, setErrors] = useState<ActivityErrors>({});
  const [choosePlace, setChoosePlace] = useState(false);
  const inputs = useRef<Partial<Record<keyof ActivityForm, TextInput | null>>>({});
  const field = (key: 'name' | 'startTime' | 'endTime' | 'costVnd' | 'notes', label: string, hint: string) => <View style={{ gap: 6 }}>
    <Text style={styles.text}>{label}</Text>
    <TextInput ref={(input) => { inputs.current[key] = input; }} accessibilityLabel={label} value={form[key]} placeholder={hint}
      editable={!disabled} autoCapitalize="none" multiline={key === 'notes'}
      keyboardType={key === 'costVnd' ? 'number-pad' : 'default'}
      onChangeText={(value) => { setForm((old) => ({ ...old, [key]: value })); setErrors((old) => ({ ...old, [key]: undefined })); }}
      style={{ minHeight: key === 'notes' ? 110 : 50, padding: 12, borderWidth: 1, borderColor: errors[key] ? '#9E2929' : '#9DAEA3', borderRadius: 10, fontSize: 17, color: '#172A23', backgroundColor: 'white', textAlignVertical: 'top' }} />
    {errors[key] && <Text accessibilityRole="alert" style={styles.error}>{errors[key]}</Text>}
  </View>;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Thông tin hoạt động</Text>
    <Action title={form.kind === 'catalog' ? '✓ Địa điểm từ danh mục' : 'Chọn địa điểm từ danh mục'} secondary disabled={disabled} onPress={() => { setForm((old) => ({ ...old, kind: 'catalog' })); setChoosePlace(true); }} />
    <Action title={form.kind === 'custom' ? '✓ Hoạt động tự nhập' : 'Chuyển sang tự nhập'} secondary disabled={disabled} onPress={() => { setForm((old) => ({ ...old, kind: 'custom', placeId: '' })); setChoosePlace(false); }} />
    {form.kind === 'custom' ? <Text style={styles.text}>Hoạt động tự nhập không có tọa độ hoặc pin bản đồ.</Text> : <>
      <Text style={styles.text}>Địa điểm: {places.find((place) => place.id === form.placeId)?.name ?? 'Chưa chọn'}</Text>
      <Action title={choosePlace ? 'Thu gọn danh mục' : 'Đổi địa điểm'} secondary disabled={disabled} onPress={() => { Keyboard.dismiss(); setChoosePlace(!choosePlace); }} />
      {choosePlace && places.map((place) => <Action key={place.id} title={place.name} secondary disabled={disabled} onPress={() => {
        setForm((old) => ({ ...old, placeId: place.id, name: place.name, costVnd: '' })); setErrors({}); setChoosePlace(false);
      }} />)}
      {errors.placeId && <Text accessibilityRole="alert" style={styles.error}>{errors.placeId}</Text>}
    </>}
    {field('name', 'Tên hoạt động', 'Ví dụ: Ăn trưa cùng nhóm')}
    {field('startTime', 'Giờ bắt đầu (HH:mm)', '09:00')}
    {field('endTime', 'Giờ kết thúc (HH:mm)', '10:00')}
    <Text style={styles.text}>Để trống cả hai nếu chưa đặt giờ. Giờ gợi ý theo Đà Lạt, chưa tính di chuyển hoặc kiểm tra giờ mở cửa.</Text>
    {field('costVnd', 'Chi phí tổng nhóm (VND)', 'Để trống nếu chưa biết')}
    <Text style={styles.text}>0 là miễn phí; để trống là chưa biết. Giá nhập chỉ là ước tính, không phải báo giá.</Text>
    {field('notes', 'Ghi chú', 'Tối đa 500 ký tự')}
    {errors.placeId && <Text accessibilityRole="alert" style={styles.error}>{errors.placeId} Mở danh mục phía trên để chọn.</Text>}
    <Action title="Áp dụng vào draft" disabled={disabled} onPress={() => {
      const result = parseActivityForm(form, activityId, places);
      if (!result.ok) { setErrors(result.errors); const first = (['name', 'startTime', 'endTime', 'costVnd', 'notes'] as const).find((key) => result.errors[key]); if (first) inputs.current[first]?.focus(); return; }
      Keyboard.dismiss(); onApply(result.activity);
    }} />
    <Action title="Bỏ form hoạt động" secondary disabled={disabled} onPress={onCancel} />
  </View>;
}
