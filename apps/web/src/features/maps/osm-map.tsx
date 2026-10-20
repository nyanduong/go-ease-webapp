import { useEffect, useRef, useState } from 'react';
import { divIcon, latLngBounds, map as createMap, marker, tileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DayMap } from '@goease/trip-client/map-controller';
import { Button, Notice } from '../../components/ui';

/** Only visible tiles are requested. Browser HTTP caching remains in control. */
export default function OsmDayMap({ model }: { model: DayMap }) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Đang tải nền bản đồ…'),
    [attempt, retry] = useState(0);
  useEffect(() => {
    if (!container.current || !model.pins.length) return;
    let failed = false,
      disposed = false;
    const map = createMap(container.current, { scrollWheelZoom: false, minZoom: 3, maxZoom: 19 });
    const bounds = latLngBounds(
      model.pins.map((pin) => [pin.coordinates.latitude, pin.coordinates.longitude]),
    );
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
    const tiles = tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      keepBuffer: 1,
      updateWhenIdle: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    const errorMessage =
      'Nền bản đồ chưa tải đủ. Bạn vẫn có thể chọn ghim hoặc mở chỉ đường bên dưới.';
    setStatus('Đang tải nền bản đồ…');
    tiles.on('tileerror', () => {
      failed = true;
      if (!disposed) setStatus(errorMessage);
    });
    tiles.on('load', () => {
      if (!disposed) setStatus(failed ? errorMessage : '');
    });
    for (const [index, pin] of model.pins.entries()) {
      const badge = document.createElement('span');
      badge.className =
        'grid size-9 place-items-center rounded-full border-2 border-white bg-teal text-sm font-bold text-white shadow-lg';
      badge.textContent = String(index + 1);
      const popup = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = pin.name;
      popup.append(name);
      for (const activity of pin.activities) {
        const item = document.createElement('p');
        item.textContent = `${activity.order}. ${activity.name}`;
        popup.append(item);
      }
      marker([pin.coordinates.latitude, pin.coordinates.longitude], {
        title: `Điểm ${index + 1}: ${pin.name}`,
        keyboard: true,
        icon: divIcon({
          className: 'goease-map-pin',
          html: badge,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20],
        }),
      })
        .addTo(map)
        .bindPopup(popup);
    }
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(container.current);
    const deadline = setTimeout(() => {
      if (!disposed) setStatus((value) => (value ? errorMessage : value));
    }, 20000);
    return () => {
      disposed = true;
      clearTimeout(deadline);
      resize.disconnect();
      map.remove();
    };
  }, [model, attempt]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        ref={container}
        aria-label="Bản đồ OpenStreetMap"
        className="relative isolate z-0 h-96 w-full overflow-hidden rounded-3xl border border-line bg-mint [&_.leaflet-control-zoom_a]:h-11! [&_.leaflet-control-zoom_a]:w-11! [&_.leaflet-control-zoom_a]:leading-11! [&_.leaflet-popup-content]:wrap-anywhere"
      />
      {status && (
        <Notice>
          <span role="status">{status}</span>
          <Button secondary onClick={() => retry((value) => value + 1)}>
            Tải lại nền bản đồ
          </Button>
        </Notice>
      )}
      <p className="text-xs text-muted">
        Ghim hiển thị vị trí địa điểm trong ngày. Chọn ghim để xem tên; mở chỉ đường bên dưới để xem
        đường đi.
      </p>
    </div>
  );
}
