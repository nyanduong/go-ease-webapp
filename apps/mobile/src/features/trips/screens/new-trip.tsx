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
import { Action, ConfirmDialog, styles } from '../components/ui';
import { AiPlanner, type AiPlannerSession } from '../components/ai-planner';

export default function NewTripScreen() {
  const initial = useMemo(() => initialTripForm(new Date()), []);
  const [form, setForm] = useState(initial); const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState(''); const [sampleBusy, setBusy] = useState(false); const saving = useRef(false);
  const [aiBusy, setAiBusy] = useState(false), [aiLocked, setAiLocked] = useState(false);
  const aiSession = useRef<AiPlannerSession | null>(null);
  const registerAi = useCallback((session: AiPlannerSession | null) => { aiSession.current = session; }, []);
  const busy = sampleBusy || aiBusy;
  const [discard, setDiscard] = useState(false); const scroll = useRef<ScrollView>(null);
  const positions = useRef<Partial<Record<keyof TripFormValues, number>>>({});
  const { state } = useLocalTrips();
  const submission = useMemo(() => createTripSubmission({ store: localTripStore, getCatalog: getDalatCatalog, newId: randomUUID, now: () => new Date() }), []);
  const leave = useCallback(() => { if (aiSession.current && !aiSession.current.discard()) return; if (!submission.discard()) return; if (router.canGoBack()) router.back(); else router.replace('/'); }, [submission]);
  const requestLeave = useCallback(() => {
    if (saving.current || aiBusy) return;
    if (JSON.stringify(form) !== JSON.stringify(initial) || localTripStore.getSnapshot().draft) setDiscard(true); else leave();
  }, [form, initial, leave, aiBusy]);
  useFocusEffect(useCallback(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => { requestLeave(); return true; }); return () => listener.remove(); }, [requestLeave]));
  const field = (key: keyof TripFormValues, label: string, placeholder: string, numeric = false) => <View onLayout={(event) => { positions.current[key] = event.nativeEvent.layout.y; }} style={{ gap: 6 }}>
    <Text style={styles.text}>{label}</Text>
    <TextInput accessibilityLabel={label} value={form[key]} editable={!busy && !aiLocked} placeholder={placeholder} autoCapitalize="none"
      keyboardType={numeric ? 'number-pad' : key === 'startDate' ? 'numbers-and-punctuation' : 'default'}
      maxLength={key === 'name' ? 120 : 30} onChangeText={(value) => { setForm((old) => ({ ...old, [key]: value })); setErrors((old) => ({ ...old, [key]: undefined })); setMessage(''); }}
      style={{ minHeight: 50, padding: 12, borderWidth: 1, borderColor: errors[key] ? '#9E2929' : '#9DAEA3', borderRadius: 10, backgroundColor: 'white', fontSize: 17, color: '#172A23' }} />
    {errors[key] && <Text accessibilityRole="alert" style={styles.error}>{errors[key]}</Text>}
  </View>;
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
    <Stack.Screen options={{ title: 'Tạo chuyến', headerBackVisible: false, gestureEnabled: false, headerLeft: () => <Action title="Hủy" secondary disabled={busy} onPress={requestLeave} /> }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.heading}>Lên kế hoạch cho nhóm</Text><Text style={styles.text}>Chọn mẫu local để lưu ngay, hoặc xem trước đề xuất AI nội bộ khi API sẵn sàng.</Text>
        {field('name', 'Tên chuyến', 'Ví dụ: Đà Lạt cùng bạn')}
        <Text style={styles.text}>Điểm đến: {DESTINATION.name} (demo)</Text>
        {field('startDate', 'Ngày bắt đầu (YYYY-MM-DD)', '2026-11-20')}
        {field('durationDays', 'Số ngày (1–5)', '1', true)}
        {field('people', 'Số người (1–20)', '1', true)}
        {field('budgetVnd', 'Ngân sách tổng nhóm (VND)', 'Ví dụ: 3000000', true)}
        <Text style={styles.text}>Để trống nếu chưa đặt ngân sách; 0 nghĩa là đã đặt 0 VND. Nhập số không có dấu phân cách.</Text>
        {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        {state.loadStatus === 'error' && <Action title="Thử đọc lại kho chuyến" onPress={() => { void localTripStore.load(); }} />}
        {!!state.issues.length && <Text style={styles.error}>Kho có dữ liệu lỗi; chưa thể tạo chuyến.</Text>}
        <Text style={styles.text}>{SAMPLE_LABEL}</Text>
        <Action title={sampleBusy ? 'Đang tạo và lưu…' : 'Tạo lịch trình mẫu'} disabled={busy || aiLocked || state.loadStatus !== 'ready' || !!state.issues.length} onPress={() => {
          if (saving.current) return; saving.current = true; setBusy(true); setMessage(''); Keyboard.dismiss();
          void submission.submit(form).then((result) => {
            if (result.ok) { router.replace('/'); return; }
            setErrors(result.errors ?? {}); setMessage(result.message);
            const first = (Object.keys(initial) as (keyof TripFormValues)[]).find((key) => result.errors?.[key]);
            scroll.current?.scrollTo({ y: first ? Math.max(0, (positions.current[first] ?? 0) - 16) : 0, animated: true });
          }).finally(() => { saving.current = false; setBusy(false); });
        }} />
        {__DEV__ && <AiPlanner input={(() => { const result = validateTripForm(form, todayAtDestination(new Date())); return result.ok ? result.input : null; })()} disabled={sampleBusy} onBusy={setAiBusy} onLock={setAiLocked} register={registerAi}
          onEdit={(id) => router.replace({ pathname: '/trips/[id]', params: { id, newDraft: '1' } })}
          onSaved={(id) => router.replace({ pathname: '/trips/[id]', params: { id } })} />}
        <Action title="Hủy tạo chuyến" secondary disabled={busy} onPress={requestLeave} />
      </ScrollView>
    </KeyboardAvoidingView>
    <ConfirmDialog visible={discard} title="Bỏ thông tin đang nhập?" message="Thông tin chưa lưu sẽ bị bỏ. Các chuyến đã lưu vẫn được giữ." confirm="Bỏ form" onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); leave(); }} />
  </SafeAreaView>;
}
