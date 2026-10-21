import { useState } from 'react';
import { contentInputSchema, type ContentInput, type ContentRecord } from '@goease/contracts';
import type { createAdminClient } from './controller';

type Client = ReturnType<typeof createAdminClient>;
const kinds: { value: ContentInput['kind']; label: string }[] = [
  { value: 'destination', label: 'Điểm đến' },
  { value: 'place', label: 'Địa điểm' },
  { value: 'food', label: 'Ẩm thực' },
  { value: 'article', label: 'Bài viết' },
  { value: 'category', label: 'Chủ đề' },
];
const statuses = { draft: 'Bản nháp', published: 'Công bố', hidden: 'Ẩn' };
export function ContentManager({ client }: { client: Client }) {
  const [items, setItems] = useState<ContentRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContentRecord | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  async function load(after?: string) {
    setBusy(true);
    setError('');
    try {
      const page = await client.listContent(after ? { after } : {});
      setItems((old) =>
        after
          ? [
              ...old,
              ...page.items.filter(
                (record) => !old.some((item) => item.entry.id === record.entry.id),
              ),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa tải được nội dung.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Quản lý nội dung khám phá">
      <h2>Nội dung khám phá</h2>
      <p>
        Nội dung biên tập có nguồn, tách biệt với kết quả tìm kiếm. Chỉ nội dung công bố hợp lệ xuất
        hiện ngoài PWA.
      </p>
      <nav>
        <button disabled={busy} onClick={() => void load()}>
          {loaded ? 'Tải lại nội dung' : 'Tải nội dung'}
        </button>
        <button disabled={busy} onClick={() => setEditing(null)}>
          + Tạo nội dung
        </button>
        <span>{items.length} nội dung đã tải</span>
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {editing !== undefined && (
        <ContentEditor
          key={editing?.entry.id ?? 'new-content'}
          saved={editing}
          busy={busy}
          onCancel={() => setEditing(undefined)}
          onSave={async (entry) => {
            setBusy(true);
            setError('');
            try {
              const record = await client.saveContent(entry, editing?.version);
              setItems((old) => [
                ...old.filter((item) => item.entry.id !== record.entry.id),
                record,
              ]);
              setEditing(undefined);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Chưa xác nhận kết quả; giữ form để đối chiếu.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      <section className="grid">
        {items.map((record) => (
          <article key={record.entry.id}>
            <div className="status">
              {statuses[record.entry.status]} ·{' '}
              {kinds.find((kind) => kind.value === record.entry.kind)?.label} · v{record.version}
            </div>
            <h3>{record.entry.title}</h3>
            <p>{record.entry.summary}</p>
            <p>ID: {record.entry.id}</p>
            <p>Cập nhật: {new Date(record.updatedAt).toLocaleString('vi-VN')}</p>
            <button disabled={busy} onClick={() => setEditing(record)}>
              Sửa nội dung {record.entry.title}
            </button>
          </article>
        ))}
      </section>
      {cursor && (
        <button disabled={busy} onClick={() => void load(cursor)}>
          Tải thêm nội dung
        </button>
      )}
      {loaded && items.length === 0 && (
        <p>
          Chưa có nội dung. Tạo điểm đến trước, sau đó thêm địa điểm, ẩm thực và bài viết liên quan.
        </p>
      )}
    </section>
  );
}
function ContentEditor({
  saved,
  busy,
  onSave,
  onCancel,
}: {
  saved: ContentRecord | null;
  busy: boolean;
  onSave: (entry: ContentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const initial = saved?.entry;
  const [entry, setEntry] = useState<ContentInput>(
    initial ?? {
      id: '',
      kind: 'destination',
      title: '',
      summary: '',
      body: '',
      status: 'draft',
      destinationId: null,
      categoryIds: [],
      image: null,
      address: '',
      coordinates: null,
      destination: null,
      sources: [],
    },
  );
  const [latitude, setLatitude] = useState(
    String(initial?.destination?.center.latitude ?? initial?.coordinates?.latitude ?? ''),
  );
  const [longitude, setLongitude] = useState(
    String(initial?.destination?.center.longitude ?? initial?.coordinates?.longitude ?? ''),
  );
  const [radius, setRadius] = useState(String(initial?.destination?.radiusKm ?? 35));
  const [timeZone, setTimeZone] = useState(initial?.destination?.timeZone ?? 'Asia/Ho_Chi_Minh');
  const [country, setCountry] = useState(initial?.destination?.countryCode ?? 'VN');
  const [categories, setCategories] = useState(initial?.categoryIds.join(', ') ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image?.url ?? '');
  const [imageAlt, setImageAlt] = useState(initial?.image?.alt ?? '');
  const [imageCredit, setImageCredit] = useState(initial?.image?.credit ?? '');
  const [error, setError] = useState('');
  function field(
    label: string,
    value: string,
    change: (value: string) => void,
    maxLength = 500,
    readOnly = false,
  ) {
    return (
      <label>
        {label}
        <input
          value={value}
          onChange={(event) => change(event.target.value)}
          maxLength={maxLength}
          readOnly={readOnly}
          disabled={busy}
        />
      </label>
    );
  }
  return (
    <section className="editor">
      <h3>{saved ? 'Sửa nội dung biên tập' : 'Tạo nội dung biên tập'}</h3>
      <p>
        Công bố cần mô tả ngắn, nội dung và ít nhất một nguồn HTTPS. Địa điểm/ẩm thực cần địa chỉ và
        tọa độ. Lưu bản nháp để hoàn thiện sau.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const coordinates =
            latitude.trim() && longitude.trim()
              ? { latitude: Number(latitude), longitude: Number(longitude) }
              : null;
          const value = {
            ...entry,
            destinationId: ['destination', 'category'].includes(entry.kind)
              ? null
              : entry.destinationId,
            categoryIds:
              entry.kind === 'category'
                ? []
                : categories
                    .split(',')
                    .map((id) => id.trim())
                    .filter(Boolean),
            image: imageUrl.trim()
              ? { url: imageUrl.trim(), alt: imageAlt, credit: imageCredit }
              : null,
            coordinates,
            destination:
              entry.kind === 'destination'
                ? {
                    id: entry.id,
                    name: entry.title,
                    countryCode: country || null,
                    timeZone,
                    currency: 'VND',
                    center: coordinates,
                    radiusKm: Number(radius),
                    ...(entry.address ? { address: entry.address } : {}),
                  }
                : null,
          };
          const parsed = contentInputSchema.safeParse(value);
          if (!parsed.success) {
            setError(
              parsed.error.issues
                .map((issue) => `${issue.path.join('.') || 'Nội dung'}: ${issue.message}`)
                .join(' · '),
            );
            return;
          }
          setError('');
          void onSave(parsed.data);
        }}
      >
        <div className="fields">
          {field('ID nội dung', entry.id, (id) => setEntry((old) => ({ ...old, id })), 80, !!saved)}
          <label>
            Loại nội dung
            <select
              aria-label="Loại nội dung"
              disabled={busy || !!saved}
              value={entry.kind}
              onChange={(event) =>
                setEntry((old) => ({ ...old, kind: event.target.value as ContentInput['kind'] }))
              }
            >
              {kinds.map((kind) => (
                <option value={kind.value} key={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          {field('Tiêu đề', entry.title, (title) => setEntry((old) => ({ ...old, title })), 120)}
          <label>
            Trạng thái
            <select
              aria-label="Trạng thái"
              disabled={busy}
              value={entry.status}
              onChange={(event) =>
                setEntry((old) => ({
                  ...old,
                  status: event.target.value as ContentInput['status'],
                }))
              }
            >
              {Object.entries(statuses).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {!['destination', 'category'].includes(entry.kind) &&
            field(
              'ID điểm đến liên quan',
              entry.destinationId ?? '',
              (destinationId) =>
                setEntry((old) => ({ ...old, destinationId: destinationId || null })),
              80,
            )}
          {entry.kind !== 'category' &&
            field('ID chủ đề (phân cách bằng dấu phẩy)', categories, setCategories, 1000)}
          {field('Địa chỉ', entry.address, (address) => setEntry((old) => ({ ...old, address })))}
          {entry.kind !== 'category' && (
            <>
              {field('Vĩ độ nội dung', latitude, setLatitude, 30)}
              {field('Kinh độ nội dung', longitude, setLongitude, 30)}
            </>
          )}
          {entry.kind === 'destination' && (
            <>
              {field('Bán kính khám phá (km)', radius, setRadius, 10)}
              {field('Múi giờ', timeZone, setTimeZone, 80)}
              {field('Mã quốc gia', country, setCountry, 2)}
            </>
          )}
          {field('URL ảnh HTTPS', imageUrl, setImageUrl, 1000)}
          {field('Mô tả ảnh', imageAlt, setImageAlt, 200)}
          {field('Nguồn/tác giả ảnh', imageCredit, setImageCredit, 200)}
        </div>
        <label>
          Mô tả ngắn
          <textarea
            disabled={busy}
            value={entry.summary}
            maxLength={500}
            rows={3}
            onChange={(event) => setEntry((old) => ({ ...old, summary: event.target.value }))}
          />
        </label>
        <label>
          Nội dung bài viết
          <textarea
            disabled={busy}
            value={entry.body}
            maxLength={12000}
            rows={10}
            onChange={(event) => setEntry((old) => ({ ...old, body: event.target.value }))}
          />
        </label>
        <h4>Nguồn tham khảo</h4>
        {entry.sources.map((source, index) => (
          <div className="fields" key={index}>
            {field(
              `Tên nguồn ${index + 1}`,
              source.title,
              (title) =>
                setEntry((old) => ({
                  ...old,
                  sources: old.sources.map((item, i) => (i === index ? { ...item, title } : item)),
                })),
              200,
            )}
            {field(
              `URL nguồn ${index + 1}`,
              source.url,
              (url) =>
                setEntry((old) => ({
                  ...old,
                  sources: old.sources.map((item, i) => (i === index ? { ...item, url } : item)),
                })),
              1000,
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setEntry((old) => ({ ...old, sources: old.sources.filter((_, i) => i !== index) }))
              }
            >
              Xóa nguồn {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={busy || entry.sources.length >= 8}
          onClick={() =>
            setEntry((old) => ({ ...old, sources: [...old.sources, { title: '', url: '' }] }))
          }
        >
          + Thêm nguồn
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p>
          ID và loại không đổi sau khi lưu. Nếu gặp lỗi 409, giữ form để đối chiếu phiên bản mới.
        </p>
        <button disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu nội dung'}</button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Đóng form nội dung
        </button>
      </form>
    </section>
  );
}
