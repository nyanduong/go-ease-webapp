import { getDalatCatalog } from '@goease/catalog';
import { DESTINATION, todayAtDestination } from '@goease/contracts';
import { SAMPLE_LABEL } from '@goease/itinerary';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createTripSubmission, initialTripForm, validateTripForm, type FormErrors, type TripFormValues } from '../create-trip-controller';
import { localTripStore, useLocalTrips } from '../local-trip-store';
import { Action, colors, ConfirmDialog, Icon, IconButton, styles } from '../components/ui';
import { AiPlanner, type AiPlannerSession } from '../components/ai-planner';
import { useKeyboardScroll } from '../components/use-keyboard-scroll';

export default function NewTripScreen() {
  const initial = useMemo(() => initialTripForm(new Date()), []);
  const [form, setForm] = useState(initial); const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState(''); const [sampleBusy, setBusy] = useState(false); const saving = useRef(false);
  const [aiBusy, setAiBusy] = useState(false), [aiLocked, setAiLocked] = useState(false);
  const aiSession = useRef<AiPlannerSession | null>(null);
  const registerAi = useCallback((session: AiPlannerSession | null) => { aiSession.current = session; }, []);
  const busy = sampleBusy || aiBusy;
  const [discard, setDiscard] = useState(false); const scroll = useRef<ScrollView>(null);
  useKeyboardScroll(scroll);
  const positions = useRef<Partial<Record<keyof TripFormValues, number>>>({});
  const { state } = useLocalTrips();
  const [submission] = useState(() => createTripSubmission({ store: localTripStore, getCatalog: getDalatCatalog, newId: randomUUID, now: () => new Date() }));
  const leave = useCallback(() => { if (aiSession.current && !aiSession.current.discard()) return; if (!submission.discard()) return; if (router.canGoBack()) router.back(); else router.replace('/'); }, [submission]);
  const requestLeave = useCallback(() => {
    if (saving.current || aiBusy) return;
    if (JSON.stringify(form) !== JSON.stringify(initial) || localTripStore.getSnapshot().draft) setDiscard(true); else leave();
  }, [form, initial, leave, aiBusy]);
  useFocusEffect(useCallback(() => { if (Platform.OS === 'web') return; const listener = BackHandler.addEventListener('hardwareBackPress', () => { requestLeave(); return true; }); return () => listener.remove(); }, [requestLeave]));
  const field = (key: keyof TripFormValues, label: string, placeholder: string, numeric = false, hint?: string) => <View onLayout={(event) => { if (key !== 'durationDays' && key !== 'people') positions.current[key] = event.nativeEvent.layout.y; }} style={{ gap: 5 }}>
    <Text style={styles.label}>{key === 'people' ? 'Số người' : label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: errors[key] ? colors.error : colors.line, borderRadius: 9, backgroundColor: colors.paper, paddingLeft: 11, gap: 8 }}><Icon name={key === 'name' ? 'create-outline' : key === 'startDate' ? 'calendar-outline' : key === 'budgetVnd' ? 'wallet-outline' : key === 'people' ? 'people-outline' : 'time-outline'} size={17} color={colors.muted} /><TextInput accessibilityLabel={label} value={form[key]} editable={!busy && !aiLocked} placeholder={placeholder} placeholderTextColor="#8A9899" autoCapitalize={key === 'name' ? 'sentences' : 'none'}
      keyboardType={numeric ? 'number-pad' : key === 'startDate' ? 'numbers-and-punctuation' : 'default'}
      maxLength={key === 'name' ? 80 : 30} onChangeText={(value) => { setForm((old) => ({ ...old, [key]: value })); setErrors((old) => ({ ...old, [key]: undefined })); setMessage(''); }}
      style={[styles.input, { flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingLeft: 0 }]} /></View>
    {hint && <Text style={styles.caption}>{hint}</Text>}
    {errors[key] && <Text accessibilityRole="alert" style={styles.error}>{errors[key]}</Text>}
  </View>;
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
    <Stack.Screen options={{ title: 'Tạo chuyến đi', headerBackVisible: false, gestureEnabled: false, headerLeft: () => <IconButton name="chevron-back" label="Hủy tạo chuyến" disabled={busy} onPress={requestLeave} />, headerRight: () => <Icon name="paper-plane-outline" color={colors.orange} /> }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { gap: 12, paddingTop: 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>{['Thông tin', 'Lịch trình', 'Hoàn tất'].map((label,index) => <View key={label} style={{ flex: 1, alignItems: 'center', gap: 6 }}><View style={{ position: 'absolute', top: 13, left: 0, right: 0, height: 1, backgroundColor: '#D5E4E0' }} /><View style={{ width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: index === 0 ? colors.teal : '#E1ECE9' }}><Text style={{ color: index === 0 ? 'white' : colors.muted, fontSize: 12, fontWeight: '700' }}>{index + 1}</Text></View><Text style={{ color: index === 0 ? colors.tealDark : colors.muted, fontSize: 11, fontWeight: index === 0 ? '700' : '500' }}>{label}</Text></View>)}</View>
        <View style={{ gap: 5 }}><Text accessibilityRole="header" style={[styles.heading, { fontSize: 20, lineHeight: 27 }]}>Bắt đầu hành trình của bạn</Text><Text style={styles.text}>Vài thông tin để bắt đầu. Bạn có thể chỉnh sửa lịch trình sau khi tạo.</Text></View>
        <View style={{ gap: 5 }}><Text style={styles.label}>Điểm đến</Text><View style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}><Icon name="location-outline" size={17} color={colors.muted} /><Text style={[styles.text, { flex: 1 }]}>{DESTINATION.name}</Text><Text style={styles.caption}>Demo</Text></View></View>
        {field('name', 'Tên chuyến đi', 'Ví dụ: Đà Lạt cùng bạn')}
        {field('startDate', 'Ngày bắt đầu', '2026-11-20', false, 'Định dạng: năm-tháng-ngày.')}
        <View onLayout={event => { positions.current.durationDays = event.nativeEvent.layout.y; positions.current.people = event.nativeEvent.layout.y; }} style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 110 }}>{field('durationDays', 'Số ngày', '1', true, '1–5 ngày')}</View>
          <View style={{ flex: 1, minWidth: 110 }}>{field('people', 'Số người trong nhóm', '1', true, '1–20 người')}</View>
        </View>
        {field('budgetVnd', 'Ngân sách nhóm (VND)', 'Ví dụ: 3000000', true, 'Tùy chọn · Nhập số tiền cho cả nhóm, không có dấu phân cách.')}
        {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        {state.loadStatus === 'error' && <Action title="Thử đọc lại kho chuyến" onPress={() => { void localTripStore.load(); }} />}
        {!!state.issues.length && <Text style={styles.error}>Kho có dữ liệu lỗi; chưa thể tạo chuyến.</Text>}
        <View style={[styles.notice, { flexDirection: 'row', gap: 12 }]}><Icon name="bulb-outline" color="#A9661C" /><View style={{ gap: 4, flex: 1 }}><Text style={[styles.label, { color: '#975211' }]}>Gợi ý cho hành trình</Text><Text style={styles.caption}>{SAMPLE_LABEL} Bạn có thể thêm, bớt và sắp xếp hoạt động sau khi tạo.</Text></View></View>
        {__DEV__ && <AiPlanner input={(() => { const result = validateTripForm(form, todayAtDestination(new Date())); return result.ok ? result.input : null; })()} disabled={sampleBusy} onBusy={setAiBusy} onLock={setAiLocked} register={registerAi}
          onEdit={(id) => router.replace({ pathname: '/trips/[id]', params: { id, newDraft: '1' } })}
          onSaved={(id) => router.replace({ pathname: '/trips/[id]', params: { id } })} />}
      </ScrollView>
      <View style={styles.footer}>
        {aiLocked && <Text style={styles.caption}>Đang xem đề xuất AI. Lưu hoặc bỏ đề xuất để tiếp tục với mẫu.</Text>}
        <Action title={sampleBusy ? 'Đang tạo và lưu…' : 'Tạo lịch trình mẫu'} icon="arrow-forward" disabled={busy || aiLocked || state.loadStatus !== 'ready' || !!state.issues.length} onPress={() => {
          if (saving.current) return; saving.current = true; setBusy(true); setMessage(''); Keyboard.dismiss();
          void submission.submit(form).then((result) => {
            if (result.ok) { router.replace({ pathname: '/trips/[id]', params: { id: result.tripId } }); return; }
            setErrors(result.errors ?? {}); setMessage(result.message);
            const first = (Object.keys(initial) as (keyof TripFormValues)[]).find((key) => result.errors?.[key]);
            scroll.current?.scrollTo({ y: first ? Math.max(0, (positions.current[first] ?? 0) - 16) : 0, animated: true });
          }).finally(() => { saving.current = false; setBusy(false); });
        }} />
        <Text style={[styles.caption, { textAlign: 'center' }]}>Lưu trên thiết bị · Có thể chỉnh sửa sau</Text>
      </View>
    </KeyboardAvoidingView>
    <ConfirmDialog visible={discard} title="Bỏ thông tin đang nhập?" message="Thông tin chưa lưu sẽ bị bỏ. Các chuyến đã lưu vẫn được giữ." confirm="Bỏ form" onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); leave(); }} />
  </SafeAreaView>;
}
