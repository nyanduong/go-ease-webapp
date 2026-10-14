import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CatalogResponse } from '@goease/contracts';
import { fetchApiCatalog } from '@/features/trips/catalog-api-controller';
import { Action, styles } from '@/features/trips/components/ui';

function CatalogCheck() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const active = useRef(true), inFlight = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function load() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setCatalog(null); setError('');
    try { const data = await fetchApiCatalog(process.env.EXPO_PUBLIC_API_BASE_URL); if (active.current) setCatalog(data); }
    catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Lỗi API.'); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.heading}>Kiểm tra catalog API (dev)</Text>
    <Text style={styles.text}>Tải catalog qua HTTP và kiểm tra contract v1. Màn này không ghi chuyến hoặc thay catalog local của luồng sản phẩm.</Text>
    <Text style={styles.text}>Cấu hình EXPO_PUBLIC_API_BASE_URL tại apps/mobile/.env rồi khởi động lại Metro. Trên điện thoại dùng IP LAN của máy chạy API; QR tunnel Metro không cung cấp tunnel cho API.</Text>
    <Action title={busy ? 'Đang gọi API…' : 'Tải / thử lại catalog API'} disabled={busy} onPress={() => { void load(); }} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {catalog && <><Text style={styles.text}>API v{catalog.apiVersion} · {catalog.catalog.entries.length} địa điểm · {catalog.catalog.sourceName} · ngày kiểm tra nguồn {catalog.catalog.accessedOn}</Text>
      <Text style={styles.text}>{catalog.catalog.label}</Text>
      {catalog.catalog.entries.map((entry) => <Text key={entry.id} style={styles.text}>{entry.name} · {entry.coordinates.latitude}, {entry.coordinates.longitude}</Text>)}</>}
  </ScrollView></SafeAreaView>;
}
export default function CatalogCheckRoute() { return __DEV__ ? <CatalogCheck /> : <Redirect href="/" />; }
