import { useEffect, useRef, useState } from 'react';
import type { ContentRecord } from '@goease/contracts';
import { Link, navigate } from '../../app/router';
import { Button, Notice } from '../../components/ui';
import { Icon } from '../../components/icon';
import { contentPage } from './content-api';
import { DiscoveryCollection, kindLabels } from './content-cards';

const kinds = ['destination', 'place', 'food', 'article'] as const;
export function ExplorePage() {
  const query = new URLSearchParams(location.search);
  const initialSearch = query.get('q') ?? '';
  const filter = query.get('kind') ?? '';
  const categoryId = query.get('categoryId') ?? '';
  const destinationId = query.get('destinationId') ?? '';
  const [search, setSearch] = useState(initialSearch);
  const [items, setItems] = useState<ContentRecord[]>([]),
    [categories, setCategories] = useState<ContentRecord[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [after, setAfter] = useState('');
  const filterRow = useRef<HTMLDivElement>(null);
  const topicRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const row of [filterRow.current, topicRow.current]) {
      const selected = row?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!row || !selected) continue;
      const item = selected.getBoundingClientRect(),
        bounds = row.getBoundingClientRect();
      if (item.left < bounds.left) row.scrollLeft += item.left - bounds.left;
      if (item.right > bounds.right) row.scrollLeft += item.right - bounds.right;
    }
  }, [filter, categoryId, categories.length]);
  useEffect(() => {
    const request = new AbortController();
    void contentPage(new URLSearchParams({ kind: 'category', limit: '50' }), request.signal)
      .then((page) => {
        if (!request.signal.aborted) setCategories(page.items);
      })
      .catch(() => {
        /* Results remain usable when optional topic shortcuts cannot load. */
      });
    return () => request.abort();
  }, []);
  useEffect(() => {
    const request = new AbortController();
    setBusy(true);
    setError('');
    if (!after) setItems([]);
    const params = new URLSearchParams({ limit: '18' });
    if (initialSearch) params.set('q', initialSearch);
    if (filter) params.set('kind', filter);
    if (categoryId) params.set('categoryId', categoryId);
    if (destinationId) params.set('destinationId', destinationId);
    if (after) params.set('after', after);
    void contentPage(params, request.signal)
      .then((page) => {
        if (request.signal.aborted) return;
        setItems((previous) =>
          after
            ? [
                ...previous,
                ...page.items.filter(
                  (item) => !previous.some((old) => old.entry.id === item.entry.id),
                ),
              ]
            : page.items,
        );
        setCursor(page.nextCursor === after ? null : page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!request.signal.aborted)
          setError(error instanceof Error ? error.message : 'Chưa tải được nội dung.');
      })
      .finally(() => {
        if (!request.signal.aborted) setBusy(false);
      });
    return () => request.abort();
  }, [initialSearch, filter, categoryId, destinationId, after, attempt]);
  const filterHref = (key: string, value: string) => {
    const params = new URLSearchParams(location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('after');
    return '/explore' + (params.size ? '?' + params.toString() : '');
  };
  const results = items.filter((item) => item.entry.kind !== 'category');
  const topics = categories.length
    ? categories
    : items.filter((item) => item.entry.kind === 'category');
  return (
    <section className="explore-page">
      <header className="explore-heading">
        <h1>Khám phá</h1>
        <Link href="/favorites" className="favorites-shortcut" aria-label="Yêu thích của tôi">
          <Icon name="heart" />
        </Link>
      </header>
      <form
        role="search"
        className="discovery-search"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(filterHref('q', search.trim()));
        }}
      >
        <label className="sr-only" htmlFor="explore-search">
          Tìm nội dung du lịch
        </label>
        <input
          id="explore-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
          placeholder="Tìm điểm đến, địa điểm, món ngon…"
        />
        <button type="submit" aria-label="Tìm nội dung">
          <Icon name="search" />
        </button>
      </form>
      <div ref={filterRow} className="discovery-filters" aria-label="Lọc nội dung">
        {[['', 'Tất cả'], ...kinds.map((kind) => [kind, kindLabels[kind]])].map(([kind, label]) => (
          <Link
            key={kind}
            aria-current={filter === kind ? 'page' : undefined}
            href={filterHref('kind', kind)}
          >
            {label}
          </Link>
        ))}
      </div>
      {topics.length > 0 && (
        <div ref={topicRow} className="discovery-topics" aria-label="Chủ đề khám phá">
          {topics.map(({ entry }) => (
            <Link
              key={entry.id}
              aria-current={categoryId === entry.id ? 'page' : undefined}
              href={filterHref('categoryId', categoryId === entry.id ? '' : entry.id)}
            >
              <Icon name="compass" />
              {entry.title}
            </Link>
          ))}
        </div>
      )}
      {(initialSearch || categoryId || destinationId) && (
        <div className="active-discovery-filters" aria-label="Điều kiện đang áp dụng">
          {initialSearch && <span>Từ khóa: “{initialSearch}”</span>}
          {categoryId && (
            <Link href={filterHref('categoryId', '')}>
              {topics.find((item) => item.entry.id === categoryId)?.entry.title ?? categoryId} · Bỏ
              chủ đề ×
            </Link>
          )}
          {destinationId && (
            <Link href={filterHref('destinationId', '')}>Điểm đến: {destinationId} · Bỏ lọc ×</Link>
          )}
          <Link href="/explore">Xóa bộ lọc</Link>
        </div>
      )}
      {error && (
        <Notice error>
          {error}
          <Button secondary onClick={() => setAttempt((value) => value + 1)}>
            Thử tải lại
          </Button>
        </Notice>
      )}
      {busy && (
        <p role="status" className="text-sm text-muted">
          Đang tải nội dung…
        </p>
      )}
      {!busy && !error && !results.length && (
        <Notice>Chưa có nội dung phù hợp. Thử tên địa phương hoặc một chủ đề khác.</Notice>
      )}
      {kinds.map((kind) => {
        const group = results.filter((item) => item.entry.kind === kind);
        return group.length ? (
          <section key={kind} className="discovery-section" aria-label={kindLabels[kind]}>
            <h2>{kindLabels[kind]}</h2>
            <DiscoveryCollection items={group} kind={kind} />
          </section>
        ) : null;
      })}
      {!busy && cursor && (
        <Button secondary onClick={() => setAfter(cursor)}>
          Xem thêm nội dung
        </Button>
      )}
      <Link href="/trips/new?choose=1" className="text-action self-start">
        Tự lên kế hoạch <Icon name="arrow" />
      </Link>
    </section>
  );
}
