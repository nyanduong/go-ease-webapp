import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { apiBaseUrl } from '../../lib/config';
import { useNativeAuth } from '../auth/context';
import { AuthFailure } from '../auth/client';
import { createMapsClient, MapFailure } from './client';
import { createLocationStore } from './location';
import { foregroundLocation } from './location-runtime';
import { createMapsStore } from './store';

export function MapsPanel() {
  const { store: auth, state: session } = useNativeAuth();
  const configured = (Platform.OS === 'android' || Platform.OS === 'ios') && Constants.expoConfig?.extra?.nativeMapsConfigured?.[Platform.OS] === true;
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [origin, setOrigin] = useState(''), [destination, setDestination] = useState('');
  const store = useMemo(() => {
    let url = '';
    try { url = apiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__ ? 'development' : 'preview'); } catch { /* Client surfaces a fixed configuration error. */ }
    const client = createMapsClient(url);
    return createMapsStore(client, configured, async (request, signal) => {
      try { return await auth.withSession((token, authorizedSignal) => client.route(request, token, authorizedSignal), signal); }
      catch (error) {
        if (error instanceof MapFailure && error.code === 'session') void auth.restore();
        if (error instanceof AuthFailure) throw new MapFailure(error.code === 'cancelled' ? 'cancelled' : 'session');
        throw error;
      }
    });
  }, [auth, configured]);
  const location = useMemo(() => createLocationStore(foregroundLocation), []);
  const state = useSyncExternalStore(store.subscribe, store.snapshot), position = useSyncExternalStore(location.subscribe, location.snapshot);
  useEffect(() => {
    store.setActive(AppState.currentState === 'active');
    location.setAppState(AppState.currentState);
    void store.loadCatalog();
    const subscription = AppState.addEventListener('change', value => {
      const foreground = value === 'active'; setActive(foreground); store.setActive(foreground);
      location.setAppState(value);
      if (foreground) { void location.recheck(); void store.loadCatalog(); }
    });
    return () => { subscription.remove(); store.dispose(); location.dispose(); };
  }, [store, location]);
  useEffect(() => {
    const synchronize = () => { const current = auth.snapshot(); store.setIdentity(current.kind === 'signedIn' && current.user ? `${current.user.id}:${current.user.role}` : null); };
    synchronize(); return auth.subscribe(synchronize);
  }, [store, auth]);
  useEffect(() => { if (active && state.catalogStatus === 'ready') store.retryMap(); }, [store, active, state.catalogStatus]);
  const places = state.catalog?.places ?? [];
  const originId = places.some(place => place.id === origin) ? origin : places[0]?.id ?? '';
  const destinationId = places.some(place => place.id === destination) ? destination : places[1]?.id ?? '';
  const route = session.kind === 'signedIn' && state.result?.kind === 'route' ? state.result : undefined;
  const routeReady = active && session.kind === 'signedIn' && state.map === 'loaded' && state.catalogStatus === 'ready' && originId !== destinationId;
  function chooseOrigin(id: string) { store.cancelRoute(); setOrigin(id); }
  function chooseDestination(id: string) { store.cancelRoute(); setDestination(id); }
  return <View style={styles.card} accessibilityLiveRegion="polite">
    <Text style={styles.heading} accessibilityRole="header">Bản đồ mẫu Hà Nội</Text>
    <Text style={styles.text}>Kiểm chứng kỹ thuật: ba địa điểm có nguồn CC0. Chưa phải lịch trình hoặc điểm đến mở thử đã chốt.</Text>
    <Text style={styles.text}>{state.catalogMessage}</Text>
    {state.catalogStatus === 'error' && <Pressable accessibilityRole="button" style={styles.button} onPress={() => { void store.loadCatalog(); }}><Text style={styles.buttonText}>Đọc danh mục lại</Text></Pressable>}
    {!configured && <Text style={styles.text}>Bản build chưa có cấu hình Google Maps cho {Platform.OS}. Danh mục mẫu vẫn xem được; chưa tải SDK bản đồ.</Text>}
    {configured && active && state.catalogStatus === 'ready' && <MapView key={state.revision} provider={PROVIDER_GOOGLE} style={styles.map}
      initialRegion={{ latitude: 21.028611, longitude: 105.845556, latitudeDelta: 0.035, longitudeDelta: 0.035 }}
      showsUserLocation={false} showsMyLocationButton={false} toolbarEnabled={false}
      onMapReady={() => store.sdkReady(state.revision)} onMapLoaded={() => store.mapLoaded(state.revision)} accessibilityLabel="Bản đồ Google với ba pin mẫu">
      {places.map(place => <Marker key={place.id} coordinate={place} title={place.name} description="Địa điểm mẫu có nguồn Wikidata; không xác nhận giờ mở cửa/giá." />)}
      {position.fix && <Marker coordinate={position.fix.coords} title="Một vị trí vừa nhận" pinColor="#2761a4" />}
      {route && <Polyline coordinates={route.coordinates} strokeColor="#12604b" strokeWidth={4} />}
    </MapView>}
    {configured && <Text style={styles.text}>{state.map === 'loaded' ? 'Bản đồ đã báo tải tiles.' : state.map === 'error' ? 'Bản đồ chưa tải xong trong thời gian cho phép. Kiểm tra mạng/cấu hình key hoặc thử lại.' : state.sdkReady ? 'SDK sẵn sàng; đang chờ bản đồ tải tiles…' : 'Đang chờ bản đồ native…'}</Text>}
    {configured && state.map === 'error' && <Pressable accessibilityRole="button" style={styles.button} onPress={store.retryMap}><Text style={styles.buttonText}>Tải bản đồ lại</Text></Pressable>}
    {places.map(place => <View key={place.id} style={styles.place}>
      <Text style={styles.title}>{place.name}</Text><Text style={styles.small}>{place.attribution}</Text>
      <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(place.sourceUrl).catch(() => {}); }}><Text style={styles.link}>Nguồn Wikidata và revision</Text></Pressable>
      <View style={styles.row}>
        <Pressable accessibilityRole="radio" accessibilityState={{ checked: originId === place.id }} style={styles.choice} onPress={() => chooseOrigin(place.id)}><Text>{originId === place.id ? '●' : '○'} Điểm đi</Text></Pressable>
        <Pressable accessibilityRole="radio" accessibilityState={{ checked: destinationId === place.id }} style={styles.choice} onPress={() => chooseDestination(place.id)}><Text>{destinationId === place.id ? '●' : '○'} Điểm đến</Text></Pressable>
      </View>
    </View>)}
    <Text style={styles.text}>{position.message}</Text>
    {position.fix && <Text style={styles.small}>Thời điểm vị trí: {new Date(position.fix.timestamp).toISOString()}; độ chính xác: {position.fix.coords.accuracy ?? 'chưa biết'}m.</Text>}
    <Pressable accessibilityRole="button" style={styles.button} disabled={!active || position.kind === 'locating'} onPress={() => { void location.locate(); }}><Text style={styles.buttonText}>Lấy một vị trí hiện tại</Text></Pressable>
    {position.kind === 'locating' && <Pressable accessibilityRole="button" onPress={location.cancel}><Text style={styles.link}>Hủy lấy vị trí</Text></Pressable>}
    <Text style={styles.small}>Không gửi vị trí hiện tại tới Routes. Từ chối quyền vị trí vẫn xem được các điểm mẫu.</Text>
    <Pressable accessibilityRole="button" style={[styles.button, !routeReady && styles.disabled]} disabled={!routeReady || state.route === 'loading'}
      onPress={() => { void store.route({ originPlaceId: originId, destinationPlaceId: destinationId }); }}><Text style={styles.buttonText}>Xem tuyến giữa hai điểm mẫu</Text></Pressable>
    {!routeReady && <Text style={styles.small}>Cần bản đồ tải xong, phiên GoEase đã xác minh và hai điểm khác nhau. Routes phải được operator bật riêng.</Text>}
    {state.route === 'loading' && <Pressable accessibilityRole="button" onPress={store.cancelRoute}><Text style={styles.link}>Hủy yêu cầu tuyến</Text></Pressable>}
    <Text style={styles.text}>{state.routeMessage}</Text>
    {route && <View><Text style={styles.title}>Google Maps</Text><Text style={styles.text}>{route.distanceMeters}m · {Math.ceil(route.durationMilliseconds / 1000)} giây dự kiến</Text>
      {route.warnings.map((warning, index) => <Text key={index} style={styles.text}>{warning}</Text>)}</View>}
    <Text style={styles.small}>Tuyến chỉ giữ trong bộ nhớ màn hiện tại, xóa khi đổi phiên/đổi cặp/hủy/ra nền. Không booking, offline hoặc chỉ dẫn turn-by-turn. Map báo tải không thay kiểm chứng key restrictions/billing/native từng nền tảng.</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 14, borderWidth: 1, borderColor: '#dbe7dc' },
  heading: { color: '#17382d', fontSize: 22, fontWeight: '700' }, title: { color: '#17382d', fontSize: 16, fontWeight: '700' },
  text: { color: '#40594e', fontSize: 15, lineHeight: 23 }, small: { color: '#47675b', fontSize: 12, lineHeight: 18 },
  map: { height: 300, width: '100%' }, place: { gap: 8, borderTopWidth: 1, borderColor: '#dbe7dc', paddingTop: 12 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, choice: { padding: 12, backgroundColor: '#f4f7f2', borderRadius: 10 },
  link: { color: '#12604b', textDecorationLine: 'underline', paddingVertical: 8 },
  button: { backgroundColor: '#12604b', padding: 14, borderRadius: 12, minHeight: 48, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '700' }, disabled: { opacity: 0.5 },
});
