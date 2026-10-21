import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserGoogleAuth } from '@goease/trip-client/browser-google-auth';
import { createRoot } from 'react-dom/client';
import { catalogEntrySchema, type ManagedPlace } from '@goease/contracts';
import { createAdminClient } from './controller';
import { ConfirmDialog } from './ConfirmDialog';
import './style.css';
function App() {
  const client = useMemo(
    () =>
      createAdminClient({
        base: import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000',
        url: import.meta.env.VITE_SUPABASE_URL ?? '',
        key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      }),
    [],
  );
  const [places, setPlaces] = useState<ManagedPlace[]>([]),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [authed, setAuthed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<ManagedPlace | null | undefined>(undefined);
  const google = useMemo(
    () =>
      createBrowserGoogleAuth({
        url: import.meta.env.VITE_SUPABASE_URL,
        key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        storage: sessionStorage,
        origin: location.origin,
        namespace: 'goease.admin',
        callbackPath: '/auth/callback',
      }),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    if (location.pathname === '/auth/callback') {
      const callback = location.href;
      history.replaceState(history.state, '', '/');
      setBusy(true);
      void google
        .complete(callback)
        .then(async (result) => {
          if (cancelled) return;
          const data = await client.acceptOAuth(result.session);
          if (!cancelled) {
            setPlaces(data.places);
            setNextCursor(data.nextCursor);
            setAuthed(true);
          }
        })
        .catch(() => {
          if (!cancelled) setError('Chưa đăng nhập được hoặc tài khoản chưa có quyền quản trị.');
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }
    const checkExpiry = () => {
      // Tab switches preserve RAM auth and unsaved edits; expiry is checked immediately on return.
      if (!client.valid()) {
        setAuthed(false);
        setPlaces([]);
        setEditing(undefined);
      }
    };
    document.addEventListener('visibilitychange', checkExpiry);
    const timer = setInterval(() => {
      if (!client.valid()) {
        setAuthed(false);
        setPlaces([]);
        setEditing(undefined);
      }
    }, 1000);
    return () => {
      cancelled = true;
      client.logout();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [client, google]);
  const working = useRef(false);
  async function work(operation: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa xác nhận kết quả.');
      if (!client.valid()) {
        setAuthed(false);
        setPlaces([]);
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">GOEASE / CATALOG</p>
          <h1>Quản lý địa điểm</h1>
          <p>Danh mục Đà Lạt · Nguồn tham khảo và vị trí cho lịch trình nhóm</p>
        </div>
        {authed && (
          <button
            onClick={() => {
              google.clear();
              client.logout();
              setAuthed(false);
              setPlaces([]);
              setEditing(undefined);
            }}
          >
            Đăng xuất
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!authed ? (
        <section className="login">
          <h2>Đăng nhập nhân viên</h2>
          <p>
            Quyền catalog do server cấp. Tài khoản quản trị không mặc nhiên được đọc chuyến riêng.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              void work(async () => {
                location.assign(await google.begin('/'));
              });
            }}
          >
            {busy ? 'Đang xác minh…' : 'Tiếp tục với Google'}
          </button>
          <p>
            Phiên chỉ ở RAM và giữ khi đổi tab đến lúc hết hạn. Refresh trang cần đăng nhập lại.
            Không lưu credential trong trình duyệt.
          </p>
        </section>
      ) : (
        <>
          <nav>
            <span>
              {places.filter((p) => p.enabled).length} hoạt động / {places.length} địa điểm đã tải
            </span>
            <button
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  const data = await client.list();
                  setPlaces(data.places);
                  setNextCursor(data.nextCursor);
                })
              }
            >
              Tải lại catalog
            </button>
            <button disabled={busy} onClick={() => setEditing(null)}>
              + Tạo địa điểm
            </button>
          </nav>
          <p>
            Tắt địa điểm giữ dữ liệu lịch sử và pin chuyến cũ. Tọa độ/ID bất biến; thay vị trí cần
            ID mới. Giá chỉ tham khảo.
          </p>
          {editing !== undefined && (
            <Editor
              key={editing?.entry.id ?? 'new'}
              saved={editing}
              busy={busy}
              onCancel={() => setEditing(undefined)}
              onSave={(entry, enabled) => {
                void work(async () => {
                  const saved = await client.save(
                    editing
                      ? { kind: 'update', entry, enabled, expectedVersion: editing.version }
                      : { kind: 'create', entry },
                  );
                  setPlaces((old) => [...old.filter((p) => p.entry.id !== saved.entry.id), saved]);
                  setEditing(undefined);
                });
              }}
            />
          )}
          <section className="grid">
            {places.map((place) => (
              <article key={place.entry.id}>
                <div className="status">
                  {place.enabled ? 'Đang hoạt động' : 'Đã tắt'} · v{place.version}
                </div>
                <h2>{place.entry.name}</h2>
                <p>
                  {place.entry.category} · {place.entry.suggestedDurationMinutes} phút
                </p>
                <p>
                  {place.entry.referenceCost.status === 'unknown'
                    ? 'Chưa có giá'
                    : `${place.entry.referenceCost.amountVnd.toLocaleString('vi-VN')} VND/người · tham khảo`}
                </p>
                <a href={place.entry.coordinateSourceUrl} target="_blank" rel="noreferrer">
                  Nguồn tọa độ ↗
                </a>
                <button disabled={busy} onClick={() => setEditing(place)}>
                  Chỉnh sửa {place.entry.name}
                </button>
              </article>
            ))}
          </section>
          {nextCursor && (
            <button
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  const data = await client.list(nextCursor);
                  setPlaces((old) => [
                    ...old,
                    ...data.places.filter(
                      (place) => !old.some((existing) => existing.entry.id === place.entry.id),
                    ),
                  ]);
                  setNextCursor(data.nextCursor);
                })
              }
            >
              Tải thêm địa điểm
            </button>
          )}
        </>
      )}
      <footer>
        GoEase MVP · Catalog có nguồn · Không có chức năng xem chuyến riêng hoặc quản lý thanh toán
      </footer>
    </main>
  );
}
function Editor({
  saved,
  busy,
  onSave,
  onCancel,
}: {
  saved: ManagedPlace | null;
  busy: boolean;
  onSave: (entry: ManagedPlace['entry'], enabled: boolean) => void;
  onCancel: () => void;
}) {
  const initial = saved?.entry;
  const [id, setId] = useState(initial?.id ?? ''),
    [name, setName] = useState(initial?.name ?? ''),
    [lat, setLat] = useState(String(initial?.coordinates.latitude ?? '')),
    [lng, setLng] = useState(String(initial?.coordinates.longitude ?? ''));
  const [source, setSource] = useState(initial?.coordinateSourceUrl ?? ''),
    [date, setDate] = useState(
      initial?.sources.find((s) => s.url === initial.coordinateSourceUrl)?.accessedOn ?? '',
    ),
    [duration, setDuration] = useState(String(initial?.suggestedDurationMinutes ?? 60));
  const [category, setCategory] = useState(initial?.category ?? 'nature'),
    [time, setTime] = useState(initial?.visitTimeHint ?? 'daytime'),
    [enabled, setEnabled] = useState(saved?.enabled ?? true);
  const [cost, setCost] = useState(
      initial?.referenceCost.status === 'reference' ? String(initial.referenceCost.amountVnd) : '',
    ),
    [costSource, setCostSource] = useState(initial?.referenceCost.sourceUrl ?? ''),
    [costDate, setCostDate] = useState(initial?.referenceCost.checkedOn ?? ''),
    [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<
    { kind: 'save'; entry: ManagedPlace['entry']; enabled: boolean } | { kind: 'discard' } | null
  >(null);
  const disabled = busy || confirmation !== null;
  const openingConfirmation = useRef(false);
  const confirmationTrigger = useRef<HTMLElement | null>(null);
  function dismissConfirmation() {
    openingConfirmation.current = false;
    setConfirmation(null);
  }
  const field = (label: string, value: string, set: (v: string) => void, readOnly = false) => (
    <label>
      {label}
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={label.includes('URL') ? 2000 : 120}
        readOnly={readOnly}
        disabled={disabled}
      />
    </label>
  );
  return (
    <section className="editor">
      <h2>{saved ? 'Chỉnh sửa địa điểm' : 'Tạo địa điểm mới'}</h2>
      <p>
        Version đang chỉnh: {saved?.version ?? 'mới'}. Tải lại catalog không tự thay nội dung form
        này; nếu 409, đối chiếu trước khi mở bản mới.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || openingConfirmation.current) return;
          setError('');
          const entry = {
            id,
            name,
            destinationId: 'da-lat',
            coordinates: {
              latitude: lat.trim() ? Number(lat) : NaN,
              longitude: lng.trim() ? Number(lng) : NaN,
            },
            sources: [
              ...(initial?.sources.filter((s) => s.url !== initial.coordinateSourceUrl) ?? []),
              { url: source, accessedOn: date },
            ],
            coordinateSourceUrl: source,
            coordinateKind: 'source-map-marker',
            suggestedDurationMinutes: /^\d+$/.test(duration) ? Number(duration) : NaN,
            durationBasis: 'team-estimate',
            category,
            visitTimeHint: time,
            referenceCost:
              cost.trim() === ''
                ? {
                    status: 'unknown',
                    amountVnd: null,
                    basis: 'per-person',
                    sourceUrl: null,
                    checkedOn: null,
                  }
                : {
                    status: 'reference',
                    amountVnd: /^\d+$/.test(cost) ? Number(cost) : NaN,
                    basis: 'per-person',
                    sourceUrl: costSource,
                    checkedOn: costDate,
                  },
          };
          const parsed = catalogEntrySchema.safeParse(entry);
          if (!parsed.success) {
            setError(
              'Kiểm tra ID, tên, tọa độ Đà Lạt, ngày YYYY-MM-DD, nguồn URL và chi phí nguyên VND.',
            );
            return;
          }
          confirmationTrigger.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          openingConfirmation.current = true;
          setConfirmation({ kind: 'save', entry: parsed.data, enabled });
        }}
      >
        <div className="fields">
          {field('ID', id, setId, !!saved)}
          {field('Tên địa điểm', name, setName)}
          {field('Vĩ độ', lat, setLat, !!saved)}
          {field('Kinh độ', lng, setLng, !!saved)}
          {field('Nguồn tọa độ URL', source, setSource)}
          {field('Ngày kiểm tra nguồn YYYY-MM-DD', date, setDate)}
          {field('Thời lượng phút', duration, setDuration)}
          <label>
            Phân loại
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              disabled={disabled}
            >
              {['heritage', 'religious', 'nature', 'garden', 'market', 'public-space'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Gợi ý thời gian
            <select
              value={time}
              onChange={(e) => setTime(e.target.value as typeof time)}
              disabled={disabled}
            >
              {['daytime', 'evening', 'flexible'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {field('Giá tham khảo VND/người; trống = chưa biết', cost, setCost)}
          {field('Nguồn giá URL', costSource, setCostSource)}
          {field('Ngày kiểm tra giá YYYY-MM-DD', costDate, setCostDate)}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled || !saved}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Địa điểm đang hoạt động
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={disabled}>Lưu địa điểm</button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (busy || openingConfirmation.current) return;
            confirmationTrigger.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            openingConfirmation.current = true;
            setConfirmation({ kind: 'discard' });
          }}
        >
          Bỏ form
        </button>
      </form>
      {confirmation && (
        <ConfirmDialog
          title={confirmation.kind === 'save' ? 'Lưu địa điểm?' : 'Bỏ thay đổi chưa lưu?'}
          message={
            confirmation.kind === 'save'
              ? `Lưu ${confirmation.entry.name} vào catalog ${confirmation.enabled ? 'đang hoạt động' : 'đã tắt'}?`
              : 'Các thay đổi trong form này sẽ mất. Bạn có thể tiếp tục chỉnh sửa để giữ lại nội dung.'
          }
          confirmLabel={confirmation.kind === 'save' ? 'Xác nhận lưu' : 'Bỏ thay đổi'}
          destructive={confirmation.kind === 'discard'}
          returnFocus={confirmationTrigger.current}
          onCancel={dismissConfirmation}
          onConfirm={() => {
            // A session change unmounts the editor and its confirmation together.
            const action = confirmation;
            dismissConfirmation();
            if (action.kind === 'save') onSave(action.entry, action.enabled);
            else onCancel();
          }}
        />
      )}
    </section>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
