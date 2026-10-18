import { getDalatCatalog } from '@goease/catalog';
import type { CreateTripInput, Trip } from '@goease/contracts';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, TextInput, View } from 'react-native';
import { createAiTripFlow } from '../ai-trip-controller';
import { callDemoApi, DemoApiError } from '../demo-api-controller';
import { localTripStore } from '../local-trip-store';
import { BudgetSummary } from './budget-summary';
import { Action, Badge, ConfirmDialog, Disclosure, styles } from './ui';

export interface AiPlannerSession { discard: () => boolean; pending: () => boolean }
export function AiPlanner({ input, target, onApply, onSaved, onEdit, onBusy, onLock, register, disabled = false }: {
  input: CreateTripInput | null; target?: Trip; onApply?: (trip: Trip) => void; onSaved?: (id: string) => void;
  onEdit?: (id: string) => void;
  onBusy?: (busy: boolean) => void; onLock?: (locked: boolean) => void; register?: (session: AiPlannerSession | null) => void;
  disabled?: boolean;
}) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [operation, setOperation] = useState<'generate' | 'save' | null>(null), [receipt, setReceipt] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState('');
  const [confirm, setConfirm] = useState<'generate' | 'apply' | 'discard' | null>(null), [, refresh] = useState(0);
  const epoch = useRef(0), focused = useRef(false);
  const [flow] = useState(() => createAiTripFlow({ store: localTripStore, getCatalog: getDalatCatalog, newId: randomUUID, now: () => new Date(),
    request: async (request, signal, sessionCode) => {
      setApiStatus(''); setReceipt(null);
      try {
        const response = await callDemoApi(process.env.EXPO_PUBLIC_API_BASE_URL, sessionCode, 'ai', { input: request, signal });
        if (!signal.aborted) setReceipt(response.requestId);
        return response.data;
      } catch (error) {
        if (!signal.aborted && error instanceof DemoApiError) setApiStatus(error.message);
        throw error;
      }
    },
  }));
  const preview = flow.preview();
  useEffect(() => { onLock?.(preview !== null); }, [preview, onLock]);
  useEffect(() => { register?.({ discard: () => flow.discard(), pending: () => flow.preview() !== null }); return () => register?.(null); }, [flow, register]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const clear = () => { epoch.current++; flow.cancelRequest(); setCode(''); setConfirm(null); setBusy(flow.busy()); onBusy?.(flow.busy()); };
    const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') clear(); });
    return () => { focused.current = false; clear(); listener.remove(); };
  }, [flow, onBusy]));
  const work = async (mode: 'generate' | 'save', action: () => Promise<{ ok: boolean; message: string; tripId?: string }>) => {
    if (flow.busy() || disabled) return;
    const requestEpoch = ++epoch.current;
    setConfirm(null); setBusy(true); setOperation(mode); onBusy?.(true); setMessage('');
    try { const result = await action(); if (focused.current && requestEpoch === epoch.current) { onLock?.(flow.preview() !== null); setMessage(result.message); refresh((old) => old + 1); if (result.ok && result.tripId) onSaved?.(result.tripId); } }
    finally { if (!flow.busy()) { if (focused.current) { setBusy(false); setOperation(null); } onBusy?.(false); } }
  };
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.startsWith('https://') === true;
  return <Disclosure title={target ? 'Gợi ý lại bằng Gemini' : 'Gợi ý bằng Gemini'} subtitle={preview ? 'Đã có đề xuất · Mở để xem và lưu' : busy ? 'Đang xử lý yêu cầu…' : 'Tùy chọn · Cần phiên AI nội bộ'}>
    <Badge warm>Gemini · Free tier</Badge>
    <Text style={styles.text}>Mỗi lần gọi dùng một lượt quota miễn phí. Xem trước kết quả rồi mới lưu hoặc thay lịch trình đang sửa.</Text>
    {!configured && <Text style={styles.text}>AI chưa được cấu hình HTTPS. Luồng mẫu local vẫn dùng được; xem runbook của team.</Text>}
    <TextInput accessibilityLabel="Mã phiên AI nội bộ" placeholder="Mã phiên từ người vận hành" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={64} value={code} editable={!busy} onChangeText={setCode} style={styles.input} />
    <Action title={busy ? 'Đang xử lý…' : preview ? 'Gợi ý lại' : 'Đề xuất lịch trình'} icon="sparkles-outline" disabled={busy || disabled || !configured || !input} onPress={() => setConfirm('generate')} />
    {disabled && <Text style={styles.text}>Áp dụng/bỏ form hoạt động hoặc ngân sách đang mở và chờ thao tác lưu hoàn tất trước khi dùng AI.</Text>}
    {!input && <Text style={styles.text}>Nhập nhu cầu hợp lệ và ngày bắt đầu từ hôm nay trước khi gọi AI.</Text>}
    {busy && operation === 'generate' && <Action title="Hủy gọi AI" secondary onPress={() => { epoch.current++; flow.cancelRequest(); setBusy(flow.busy()); onBusy?.(flow.busy()); setMessage('Đã hủy yêu cầu; nội dung hiện tại vẫn giữ.'); }} />}
    {busy && operation === 'save' && <Text style={styles.text}>Đang lưu trên thiết bị; không gọi Gemini thêm.</Text>}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text> : null}
    {receipt && <Text style={styles.text}>Mã phản hồi API gần nhất: {receipt}</Text>}
    {apiStatus ? <Text accessibilityRole="alert" style={styles.error}>{apiStatus}</Text> : null}
    {preview && <>
      <Text style={styles.text}>{preview.label} · {preview.model} · Chưa lưu/thay draft</Text>
      <BudgetSummary trip={preview.trip} draft />
      {preview.trip.days.map((day) => <View key={day.id} style={{ gap: 6 }}><Text style={styles.text}>{day.date}</Text>{day.activities.map((activity) => <Text key={activity.id} style={styles.text}>{activity.startTime}–{activity.endTime} · {activity.name}</Text>)}</View>)}
      {preview.warnings.map((warning, index) => <Text key={index} style={styles.text}>{warning}</Text>)}
      {target ? <Action title="Áp dụng vào draft đang sửa" disabled={busy || disabled} onPress={() => setConfirm('apply')} /> : <Action title="Lưu chuyến AI / thử lưu lại" disabled={busy || disabled} onPress={() => { void work('save', () => flow.saveNew()); }} />}
      {!target && onEdit && <Action title="Sửa trước khi lưu" secondary disabled={busy || disabled} onPress={() => {
        try { const id = flow.stageNew(); onLock?.(false); onEdit(id); }
        catch { setMessage('Chưa mở được editor. Giữ đề xuất; thử lưu lại hoặc bỏ draft của lần lưu lỗi trước.'); }
      }} />}
      <Action title="Bỏ đề xuất AI" secondary disabled={busy} onPress={() => setConfirm('discard')} />
    </>}
    <ConfirmDialog visible={confirm !== null} title={confirm === 'apply' ? 'Thay lịch trình trong draft?' : confirm === 'discard' ? 'Bỏ đề xuất AI?' : 'Gọi Gemini một lần?'}
      message={confirm === 'apply' ? 'Toàn bộ ngày/hoạt động trong draft sẽ được thay. Chuyến đã lưu chỉ đổi khi bạn bấm Lưu chuyến. Nếu draft đã đổi từ lúc gọi AI, thao tác sẽ bị chặn.' : confirm === 'discard' ? 'Bỏ đề xuất và draft tạo mới thuộc phiên này; không xóa chuyến đã lưu. Lần ghi báo lỗi vẫn có thể đã ghi lên máy.' : 'Nhu cầu chuyến sẽ gửi tới backend HTTPS của team; Google chỉ nhận ngày và catalog public. Dùng một lượt quota, kể cả lỗi/hủy. Đề xuất trước vẫn giữ nếu gọi lại thất bại.'}
      confirm={confirm === 'apply' ? 'Thay draft' : confirm === 'discard' ? 'Bỏ đề xuất' : 'Gọi một lần'} onCancel={() => setConfirm(null)} onConfirm={() => {
        if (disabled || busy) { setConfirm(null); return; }
        if (confirm === 'generate' && input) { void work('generate', () => flow.generate(input, code.trim(), target ?? null, true)); }
        else if (confirm === 'apply' && target && onApply) {
          try { const trip = flow.applyExisting(target, true); onApply(trip); flow.discard(); setMessage('Đã áp dụng đề xuất vào draft. Xem/sửa rồi bấm Lưu chuyến.'); }
          catch { setMessage('Draft đã đổi hoặc chưa thể áp dụng. Nội dung cũ được giữ; bỏ đề xuất hoặc gọi lại khi sẵn sàng.'); }
          setConfirm(null); refresh((old) => old + 1);
        } else { if (flow.discard()) setMessage('Đã bỏ đề xuất AI.'); setConfirm(null); refresh((old) => old + 1); }
      }} />
  </Disclosure>;
}
