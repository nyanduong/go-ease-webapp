import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createAdminClient } from '@/lib/admin-client';
import { createAdminCatalogStore } from '@/lib/admin-store';
import { useWebAuth } from '@/lib/auth-context';
import { API_BASE_URL } from '@/lib/health';
import { Button } from './ui/button';

export function AdminCatalog() {
  const { store: auth, state: session } = useWebAuth();
  // Shared auth already validates absolute production origins. Resolve a relative
  // deployment base here too; preserve the existing explicit local transport.
  const store = useMemo(() => createAdminCatalogStore(createAdminClient(API_BASE_URL, fetch, 8000,
    API_BASE_URL.startsWith('/') ? window.location.origin : undefined), auth), [auth]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => store.connect(), [store]);
  // Render-time guard hides old data even before effect/subscription cleanup.
  if (session.kind !== 'signedIn' || session.user?.role !== 'ADMIN') return null;
  return <section className="admin-card" aria-labelledby="catalog-title" aria-busy={state.kind === 'loading'}>
    <div className="admin-section-heading"><h2 id="catalog-title">Hà Nội · danh mục thử</h2><span className="admin-pill">Chỉ đọc mẫu</span></div>
    <p role={state.kind === 'error' ? 'alert' : 'status'}>{state.message}</p>
    {state.kind !== 'loading' && <Button variant="outline" type="button" onClick={() => { void store.load(); }}>Đọc danh mục lại</Button>}
    {state.kind === 'ready' && state.catalog && <>
      <p className="admin-muted">Đang hiển thị {state.catalog.places.length} địa điểm mẫu, tối đa 100. Không phải số liệu khách hàng hoặc doanh thu.</p>
      {state.catalog.places.length === 0 ? <p>Chưa có địa điểm mẫu trong môi trường này.</p> : <ul className="admin-place-list">
        {state.catalog.places.map(place => <li key={place.id} className="admin-place">
          <div className="admin-section-heading"><h3>{place.name}</h3><span className={`admin-pill ${place.isActive ? '' : 'admin-pill-inactive'}`}>{place.isActive ? 'Đang dùng' : 'Đã ngừng dùng'}</span></div>
          <p className="admin-muted">{place.code} · {place.latitude}, {place.longitude}</p>
          <p>{place.attribution}</p>
          <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer">Nguồn Wikidata và revision <span className="sr-only">của {place.name} (mở tab mới)</span></a>
        </li>)}
      </ul>}
    </>}
  </section>;
}
