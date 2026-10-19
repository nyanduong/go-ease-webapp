import { useEffect, useRef, useState } from 'react';
import type { DayMap } from '@goease/trip-client/map-controller';
import { Button, Notice } from '../../components/ui';

let loading: Promise<typeof google.maps> | undefined;
function loadGoogleMaps(key: string) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  loading ??= new Promise<typeof google.maps>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      script.remove();
      loading = undefined;
      reject(Error('Bản đồ tải quá lâu.'));
    }, 20000);
    window.goeaseMapsReady = () => {
      clearTimeout(timer);
      resolve(google.maps);
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(Error('Không kết nối được Google Maps.'));
    };
    const params = new URLSearchParams({
      key,
      loading: 'async',
      callback: 'goeaseMapsReady',
      v: 'weekly',
      language: 'vi',
    });
    script.src = 'https://maps.googleapis.com/maps/api/js?' + params;
    script.async = true;
    document.head.append(script);
  });
  return loading;
}
declare global {
  interface Window {
    google: typeof google;
    goeaseMapsReady: () => void;
    gm_authFailure?: () => void;
  }
}
export function directionsUrl(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${latitude},${longitude}`,
    travelmode: 'driving',
  });
  return 'https://www.google.com/maps/dir/?' + params;
}
export function GoogleDayMap({ model }: { model: DayMap }) {
  const container = useRef<HTMLDivElement>(null),
    [status, setStatus] = useState(''),
    [attempt, retry] = useState(0);
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  useEffect(() => {
    if (!key || !model.region || !container.current) return;
    let disposed = false,
      map: google.maps.Map | undefined;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    const previousFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      if (!disposed)
        setStatus('Chưa hiển thị được bản đồ. Bạn có thể chọn địa điểm và mở chỉ đường bên dưới.');
    };
    setStatus('Đang tải bản đồ…');
    void loadGoogleMaps(key)
      .then(async (maps) => {
        const { AdvancedMarkerElement } = (await maps.importLibrary(
          'marker',
        )) as google.maps.MarkerLibrary;
        if (disposed || !container.current) return;
        map = new maps.Map(container.current, {
          center: { lat: model.region!.latitude, lng: model.region!.longitude },
          zoom: 12,
          mapId: 'DEMO_MAP_ID',
          gestureHandling: 'cooperative',
          streetViewControl: false,
          mapTypeControl: false,
        });
        const bounds = new maps.LatLngBounds();
        for (const [index, pin] of model.pins.entries()) {
          const position = {
            lat: pin.coordinates.latitude,
            lng: pin.coordinates.longitude,
          };
          bounds.extend(position);
          const label = document.createElement('span');
          label.className =
            'flex size-9 items-center justify-center rounded-full border-2 border-paper bg-teal font-bold text-white shadow-lg';
          label.textContent = String(index + 1);
          markers.push(
            new AdvancedMarkerElement({
              map,
              position,
              title: pin.name,
              content: label,
            }),
          );
        }
        if (model.pins.length > 1) map.fitBounds(bounds, 48);
        maps.event.addListenerOnce(map, 'tilesloaded', () => {
          if (!disposed) setStatus('');
        });
      })
      .catch(() => {
        if (!disposed) setStatus('Chưa tải được bản đồ. Hãy thử lại hoặc mở chỉ đường bên dưới.');
      });
    const deadline = setTimeout(() => {
      if (!disposed)
        setStatus((current) =>
          current ? 'Bản đồ tải lâu hơn bình thường. Bạn có thể thử lại.' : current,
        );
    }, 25000);
    return () => {
      disposed = true;
      clearTimeout(deadline);
      window.gm_authFailure = previousFailure;
      markers.forEach((marker) => {
        marker.map = null;
      });
      if (map) google.maps.event.clearInstanceListeners(map);
    };
  }, [model, key, attempt]);
  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Bản đồ theo ngày">
      {!model.pins.length ? (
        <Notice>Chưa có địa điểm để hiển thị trên bản đồ ngày này.</Notice>
      ) : key ? (
        <>
          <div
            ref={container}
            className="h-96 w-full overflow-hidden rounded-3xl border border-line bg-line"
            aria-label="Google Maps"
          />
          {status && (
            <Notice>
              {status}
              <Button secondary onClick={() => retry((value) => value + 1)}>
                Tải lại bản đồ
              </Button>
            </Notice>
          )}
        </>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl bg-mint p-6 text-center [&>span]:text-5xl">
          <span aria-hidden="true">⌖</span>
          <h3>Địa điểm trong ngày của bạn</h3>
          <p>Bản đồ tạm thời chưa hiển thị. Bạn vẫn có thể mở chỉ đường tới từng địa điểm.</p>
        </div>
      )}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {model.pins.map((pin, index) => (
          <div className="rounded-3xl border border-line bg-paper p-5 sm:p-6" key={pin.placeId}>
            <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
              Điểm {index + 1}
            </span>
            <h3>{pin.name}</h3>
            {pin.activities.map((activity) => (
              <p key={activity.id}>
                {activity.order}. {activity.name}
              </p>
            ))}
            <a
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-mint px-5 py-3 text-center text-sm font-bold text-teal-dark hover:bg-teal/15"
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              href={directionsUrl(pin.coordinates.latitude, pin.coordinates.longitude)}
            >
              Mở chỉ đường Google Maps ↗
            </a>
          </div>
        ))}
      </div>
      {model.unlocated.map((activity) => (
        <div className="rounded-3xl border border-line bg-paper p-5 sm:p-6" key={activity.id}>
          <h3>
            {activity.order}. {activity.name}
          </h3>
          <p>
            {activity.reason === 'custom' ? 'Hoạt động tự nhập' : 'Địa điểm không còn trong gợi ý'}{' '}
            · Chưa hiển thị được trên bản đồ
          </p>
        </div>
      ))}
    </section>
  );
}
