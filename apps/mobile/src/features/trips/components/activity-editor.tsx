import type { Place } from '@goease/contracts';
import { useRef, useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
import { parseActivityForm, type ActivityErrors, type ActivityForm } from '../edit-trip-controller';
import { Action, colors, SectionTitle, styles } from './ui';

export function ActivityEditor({ initial, activityId, places, disabled, onApply, onCancel }: {
  initial: ActivityForm; activityId: string; places: Place[]; disabled: boolean;
  onApply: (activity: import('@goease/contracts').Activity) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState(initial), [errors, setErrors] = useState<ActivityErrors>({});
  const [choosePlace, setChoosePlace] = useState(false);
  const inputs = useRef<Partial<Record<keyof ActivityForm, TextInput | null>>>({});
  const field = (key: 'name' | 'startTime' | 'endTime' | 'costVnd' | 'notes', label: string, hint: string) => <View style={{ gap: 6 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput ref={(input) => { inputs.current[key] = input; }} accessibilityLabel={label} value={form[key]} placeholder={hint}
      editable={!disabled} autoCapitalize="none" multiline={key === 'notes'}
      keyboardType={key === 'costVnd' ? 'number-pad' : 'default'}
      onChangeText={(value) => { setForm((old) => ({ ...old, [key]: value })); setErrors((old) => ({ ...old, [key]: undefined })); }}
      maxLength={key === 'notes' ? 500 : key === 'name' ? 120 : 30} placeholderTextColor="#8A9899"
      style={[styles.input, { minHeight: key === 'notes' ? 110 : 50, textAlignVertical: key === 'notes' ? 'top' : 'center' }, errors[key] && { borderColor: colors.error }]} />
    {errors[key] && <Text accessibilityRole="alert" style={styles.error}>{errors[key]}</Text>}
  </View>;
  return <View style={styles.card}>
    <SectionTitle title="Thông tin hoạt động" icon="create-outline" />
    <View style={styles.row}><Action title="Danh mục" icon={form.kind === 'catalog' ? 'checkmark-circle-outline' : 'location-outline'} secondary compact disabled={disabled} onPress={() => { setForm((old) => ({ ...old, kind: 'catalog' })); setChoosePlace(true); }} />
    <Action title="Tự nhập" icon={form.kind === 'custom' ? 'checkmark-circle-outline' : 'create-outline'} secondary compact disabled={disabled} onPress={() => { setForm((old) => ({ ...old, kind: 'custom', placeId: '' })); setChoosePlace(false); }} /></View>
    {form.kind === 'custom' ? <Text style={styles.text}>Hoạt động tự nhập không có tọa độ hoặc pin bản đồ.</Text> : <>
      <Text style={styles.text}>Địa điểm: {places.find((place) => place.id === form.placeId)?.name ?? 'Chưa chọn'}</Text>
      <Action title={choosePlace ? 'Thu gọn danh mục' : 'Đổi địa điểm'} secondary disabled={disabled} onPress={() => { Keyboard.dismiss(); setChoosePlace(!choosePlace); }} />
      {choosePlace && places.map((place) => <Action key={place.id} title={place.name} secondary disabled={disabled} onPress={() => {
        setForm((old) => ({ ...old, placeId: place.id, name: place.name, costVnd: '' })); setErrors({}); setChoosePlace(false);
      }} />)}
      {errors.placeId && <Text accessibilityRole="alert" style={styles.error}>{errors.placeId}</Text>}
    </>}
    {field('name', 'Tên hoạt động', 'Ví dụ: Ăn trưa cùng nhóm')}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><View style={{ flex: 1, minWidth: 115 }}>{field('startTime', 'Giờ bắt đầu', '09:00')}</View><View style={{ flex: 1, minWidth: 115 }}>{field('endTime', 'Giờ kết thúc', '10:00')}</View></View>
    <Text style={styles.caption}>Giờ dạng HH:mm. Để trống cả hai nếu chưa đặt giờ. Chưa tính di chuyển hoặc kiểm tra giờ mở cửa.</Text>
    {field('costVnd', 'Chi phí tổng nhóm (VND)', 'Để trống nếu chưa biết')}
    <Text style={styles.caption}>0 là miễn phí; để trống là chưa biết. Giá nhập là ước tính.</Text>
    {field('notes', 'Ghi chú', 'Tối đa 500 ký tự')}
    {errors.placeId && <Text accessibilityRole="alert" style={styles.error}>{errors.placeId} Mở danh mục phía trên để chọn.</Text>}
    <Action title="Áp dụng hoạt động" icon="checkmark-outline" disabled={disabled} onPress={() => {
      const result = parseActivityForm(form, activityId, places);
      if (!result.ok) { setErrors(result.errors); const first = (['name', 'startTime', 'endTime', 'costVnd', 'notes'] as const).find((key) => result.errors[key]); if (first) inputs.current[first]?.focus(); return; }
      Keyboard.dismiss(); onApply(result.activity);
    }} />
    <Action title="Hủy" secondary disabled={disabled} onPress={onCancel} />
  </View>;
}
