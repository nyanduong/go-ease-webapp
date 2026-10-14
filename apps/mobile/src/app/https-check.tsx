import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, ScrollView, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { callDemoApi, type DemoOperation } from '@/features/trips/demo-api-controller';
import { Action, ConfirmDialog, styles } from '@/features/trips/components/ui';

function HttpsCheck() {
  const [code, setCode] = useState(''), [result, setResult] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const current = useRef<AbortController | null>(null), active = useRef(false);
  useFocusEffect(useCallback(() => {
    active.current = true;
    const clear = () => { current.current?.abort(); current.current = null; setCode(''); setResult(''); setConfirm(false); setBusy(false); };
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') clear(); });
    return () => { active.current = false; clear(); subscription.remove(); };
  }, []));
  async function run(operation: DemoOperation) {
    if (current.current) return;
    const controller = new AbortController(); current.current = controller; setBusy(true); setResult(''); setConfirm(false);
    try {
      const response = await callDemoApi(process.env.EXPO_PUBLIC_API_BASE_URL, code.trim(), operation, { signal: controller.signal });
      if (active.current && current.current === controller) {
        const data = response.data;
        if ('trip' in data) setResult(`AI thật · ${data.model} · ${data.trip.days.length} ngày · ${data.trip.days.flatMap((day) => day.activities).map((activity) => activity.name).join(', ')}. Chi phí đã biết: ${data.budget.knownCostVnd} VND; chưa có giá: ${data.budget.unknownCostCount}. ${data.warnings.join(' ')}`);
        else if ('catalog' in data) setResult(`HTTPS API v${data.apiVersion} · ${data.catalog.entries.length} địa điểm · ${data.catalog.sourceName}`);
        else setResult(`HTTPS health OK · ${data.service} · scope ${data.scope} · Gemini ${data.dependencies.gemini} (không chứng minh provider/quota sẵn sàng).`);
      }
    } catch (error) { if (active.current && current.current === controller) setResult(error instanceof Error ? error.message : 'Lỗi HTTPS API.'); }
    finally { if (current.current === controller) { current.current = null; if (active.current) setBusy(false); } }
  }
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.heading}>Kiểm tra HTTPS API (dev)</Text>
    <Text style={styles.text}>API: {process.env.EXPO_PUBLIC_API_BASE_URL ?? 'Chưa cấu hình'}</Text>
    <Text style={styles.text}>Mã phiên 30 phút do người vận hành cấp, không phải Gemini key hoặc bearer backend. Chỉ giữ trong RAM; rời màn/đưa app xuống nền sẽ xóa mã. QR Metro chỉ tải app.</Text>
    <TextInput accessibilityLabel="Mã phiên demo" placeholder="Mã phiên demo" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={64} value={code} onChangeText={setCode} editable={!busy} style={[styles.card, styles.text]} />
    <Action title="Kiểm tra HTTPS health" disabled={busy} onPress={() => { void run('health'); }} />
    <Action title="Tải catalog HTTPS" disabled={busy} onPress={() => { void run('catalog'); }} />
    <Action title="Thử Gemini thật (dùng 1 lượt quota)" disabled={busy} onPress={() => setConfirm(true)} />
    {busy && <Action title="Hủy yêu cầu" secondary onPress={() => current.current?.abort()} />}
    <Text accessibilityLiveRegion="polite" style={styles.text}>{busy ? 'Đang gọi HTTPS…' : result}</Text>
    <ConfirmDialog visible={confirm} title="Gọi Gemini một lần?" message="Ca QA một ngày, hai người; dùng quota Free tier hiện có, không bật billing, không tự retry và không lưu chuyến. Lỗi/hủy vẫn có thể tính một lượt." confirm="Gọi một lần" onConfirm={() => { void run('ai'); }} onCancel={() => setConfirm(false)} />
  </ScrollView></SafeAreaView>;
}
export default function HttpsCheckRoute() { return __DEV__ ? <HttpsCheck /> : <Redirect href="/" />; }
