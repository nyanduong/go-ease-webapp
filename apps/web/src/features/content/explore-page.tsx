import { useEffect, useState } from 'react';
import type { ContentRecord } from '@goease/contracts';
import { Link, navigate } from '../../app/router';
import { Button, Notice } from '../../components/ui';
import { Icon } from '../../components/icon';
import { contentPage } from './content-api';
import { ContentGrid, kindLabels } from './content-cards';

export function ExplorePage() {
  const query = new URLSearchParams(location.search);
  const initialSearch = query.get('q') ?? '';
  const filter = query.get('kind') ?? '';
  const categoryId = query.get('categoryId') ?? '';
  const destinationId = query.get('destinationId') ?? '';
  const [search, setSearch] = useState(initialSearch);
  const [items, setItems] = useState<ContentRecord[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [after, setAfter] = useState('');
  useEffect(() => {
    const request = new AbortController();
    setBusy(true);
    setError('');
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
  return (
    <section className="flex flex-col gap-7">
      <header>
        <p className="mb-2 text-sm font-semibold text-teal">GOEASE DISCOVERY</p>
        <h1>Đi đâu cũng có điều hay</h1>
        <p className="mt-3 max-w-xl text-muted">
          Những điểm đến, món ngon và câu chuyện được chọn lọc để bạn bắt đầu hành trình của riêng
          mình.
        </p>
      </header>
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams(location.search);
          if (search.trim()) params.set('q', search.trim());
          else params.delete('q');
          void navigate('/explore?' + params.toString());
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
          placeholder="Bạn muốn khám phá điều gì?"
        />
        <Button type="submit" aria-label="Tìm nội dung">
          <Icon name="search" />
        </Button>
      </form>
      <div className="flex flex-wrap gap-2" aria-label="Lọc nội dung">
        {[
          ['', 'Tất cả'],
          ...Object.entries(kindLabels).filter(([kind]) => kind !== 'category'),
        ].map(([kind, label]) => (
          <Link
            aria-current={filter === kind ? 'page' : undefined}
            key={kind}
            href={'/explore' + (kind ? '?kind=' + kind : '')}
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold aria-[current=page]:border-teal aria-[current=page]:bg-mint aria-[current=page]:text-teal"
          >
            {label}
          </Link>
        ))}
      </div>
      {(categoryId || destinationId) && (
        <Link href="/explore" className="text-action text-sm">
          Bỏ lọc chủ đề / điểm đến
        </Link>
      )}
      {error && (
        <Notice error>
          {error}
          <Button secondary onClick={() => setAttempt((value) => value + 1)}>
            Thử tải lại
          </Button>
        </Notice>
      )}
      {!busy && !error && !items.length && (
        <Notice>Chưa có nội dung phù hợp. Thử tên địa phương hoặc một chủ đề khác.</Notice>
      )}
      <ContentGrid items={items} />
      {busy && (
        <p role="status" className="text-muted">
          Đang tải nội dung…
        </p>
      )}
      {!busy && cursor && (
        <Button secondary onClick={() => setAfter(cursor)}>
          Xem thêm nội dung
        </Button>
      )}
      <Link href="/trips/new?choose=1" className="primary-link self-start">
        Tự lên kế hoạch <Icon name="arrow" />
      </Link>
    </section>
  );
}
