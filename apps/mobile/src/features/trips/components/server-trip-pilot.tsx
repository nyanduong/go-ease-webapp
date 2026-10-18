import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { ServerTrip } from '@goease/contracts';
import type { callServerTripApi, ServerTripRequest } from '../server-trip-controller';
import { useLocalTrips } from '../local-trip-store';
import { Action, ConfirmDialog, styles } from './ui';

export function ServerTripPilot({ identity, verified, busy, onRequest }: { identity: string | null; verified: boolean; busy: boolean; onRequest: (operation: ServerTripRequest) => ReturnType<typeof callServerTripApi> }) {
  const { state: local } = useLocalTrips();
  const [id, setId] = useState(''), [name, setName] = useState(''), [remote, setRemote] = useState<ServerTrip | null>(null), [message, setMessage] = useState('');
  const [pending, setPending] = useState<ServerTripRequest | null>(null), [confirm, setConfirm] = useState<ServerTripRequest | null>(null);
  const generation = useRef(0), lock = useRef(false), latestIdentity = useRef(identity);
  useEffect(() => () => { generation.current++; }, []);
  async function run(operation: ServerTripRequest) {
    if (lock.current || !verified || !identity) return;
    lock.current = true; const current = generation.current, owner = identity; setConfirm(null); setMessage('Đang chờ server…');
    if (!['list', 'get'].includes(operation.kind)) setPending(operation);
    try {
      const result = await onRequest(operation);
      if (generation.current !== current || latestIdentity.current !== owner) return;
      if (result.kind === 'list') setMessage(result.data.items.length ? result.data.items.map(t => `${t.id} · ${t.name} · v${t.version}`).join('\n') + (result.data.nextCursor ? '\nCòn trang sau; client API hỗ trợ cursor.' : '') : 'Tài khoản này chưa có chuyến server.');
      else if (result.kind === 'get') { setRemote(result.data); setName(result.data.trip.name); setMessage('Đã đọc chuyến server. Bản khách trên máy giữ nguyên.'); }
      else {
        setPending(null);
        const saved = result.data.result;
        if (saved.kind === 'saved') { setRemote({ trip: saved.trip, version: saved.version, updatedAt: saved.updatedAt }); setId(saved.trip.id); setName(saved.trip.name); }
        else setRemote(null);
        setMessage(result.data.replayed ? 'Server trả biên nhận cũ (replayed). Bấm Đọc lại để xem trạng thái hiện tại trước khi sửa tiếp.' : saved.kind === 'saved' ? `Đã lưu server v${saved.version}. Bản khách trên máy giữ nguyên.` : 'Đã xóa server; bản khách vẫn được giữ.');
        if (result.data.replayed) setRemote(null);
      }
    } catch (error) { if (generation.current === current) setMessage(error instanceof Error ? error.message : 'Chưa xác nhận server. Giữ mutationId cũ để đối soát.'); }
    finally { lock.current = false; }
  }
  const disabled = !verified || busy, guest = local.trips[0]?.trip;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Chuyến server (pilot dev)</Text>
    <Text style={styles.text}>Chỉ thao tác tài khoản đã được backend xác minh. Không tự gắn chuyến khách vào user, không tự ghi đè bản local. List 20 chuyến/trang.</Text>
    <Action title="Danh sách chuyến server của user này" disabled={disabled || !!pending} onPress={() => { void run({ kind: 'list' }); }} />
    <TextInput accessibilityLabel="ID chuyến server" placeholder="ID chuyến server cần đọc" autoCapitalize="none" autoCorrect={false} value={id} onChangeText={setId} editable={!disabled && !pending} maxLength={80} style={styles.input} />
    <Action title="Đọc lại server / bỏ yêu cầu chưa xác nhận" secondary disabled={disabled || !id.trim()} onPress={() => { setPending(null); setRemote(null); void run({ kind: 'get', id: id.trim() }); }} />
    {guest && <><Text selectable style={styles.text}>Chuyến khách đầu danh sách: {guest.name} · ID {guest.id}</Text><Action title="Lưu bản sao chuyến khách này lên tài khoản" disabled={disabled || !!pending} onPress={() => setConfirm({ kind: 'create', mutationId: Crypto.randomUUID(), trip: JSON.parse(JSON.stringify(guest)) })} /></>}
    {remote && <><Text style={styles.text}>Server: {remote.trip.name} · v{remote.version} · {remote.trip.days.length} ngày</Text><TextInput accessibilityLabel="Tên chuyến server" value={name} onChangeText={setName} editable={!disabled && !pending} maxLength={80} style={styles.input} /><Action title="Lưu tên mới lên server theo version đang xem" disabled={disabled || !!pending} onPress={() => setConfirm({ kind: 'update', id: remote.trip.id, mutationId: Crypto.randomUUID(), expectedVersion: remote.version, trip: { ...remote.trip, name } })} /><Action title="Xóa bản server này" secondary disabled={disabled || !!pending} onPress={() => setConfirm({ kind: 'delete', id: remote.trip.id, mutationId: Crypto.randomUUID(), expectedVersion: remote.version })} /></>}
    {pending && <Action title="Thử lại đúng yêu cầu và mutationId cũ" disabled={disabled} onPress={() => { void run(pending); }} />}
    <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>
    <ConfirmDialog visible={!!confirm} title="Ghi chuyến vào tài khoản hiện tại?" message={`Thao tác ${confirm?.kind ?? ''} trên server của user ${identity ?? ''}. Xác nhận đúng user và dữ liệu; chuyến khách trên máy vẫn giữ nguyên.`} confirm="Xác nhận thao tác server" onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) { if (confirm.kind === 'create') setId(confirm.trip.id); void run(confirm); } }} />
  </View>;
}
