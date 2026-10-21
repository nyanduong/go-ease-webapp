import { useEffect, useState } from 'react';
import type { ContentRecord } from '@goease/contracts';
import { Link, navigate } from '../../app/router';
import { Icon } from '../../components/icon';
import { Button, Notice } from '../../components/ui';
import { contentPage } from './content-api';
import { ContentGrid } from './content-cards';

export function DiscoveryHome() {
  const [items, setItems] = useState<ContentRecord[]>([]);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [search, setSearch] = useState('');
  useEffect(() => {
    const request = new AbortController();
    setBusy(true);
    setError('');
    // Fetch each editorial section independently: a large article catalog cannot
    // push destinations off the first page of the home experience.
    void Promise.all(
      ['destination', 'category', 'place', 'food', 'article'].map((kind) =>
        contentPage(new URLSearchParams({ kind, limit: '6' }), request.signal),
      ),
    )
      .then((pages) => {
        if (!request.signal.aborted) setItems(pages.flatMap((page) => page.items));
      })
      .catch(() => {
        if (!request.signal.aborted)
          setError('Chưa tải được nội dung khám phá. Bạn vẫn có thể bắt đầu chuyến đi.');
      })
      .finally(() => {
        if (!request.signal.aborted) setBusy(false);
      });
    return () => request.abort();
  }, [attempt]);
  const categories = items.filter((item) => item.entry.kind === 'category');
  return (
    <div className="flex flex-col gap-10">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(
            '/explore' + (search.trim() ? '?q=' + encodeURIComponent(search.trim()) : ''),
          );
        }}
        className="relative"
      >
        <label htmlFor="discovery-search" className="mb-2">
          Tìm cảm hứng cho chuyến tiếp theo
        </label>
        <div className="flex gap-2">
          <input
            id="discovery-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
            placeholder="Điểm đến, món ngon, trải nghiệm…"
          />
          <Button type="submit" aria-label="Tìm nội dung">
            <Icon name="search" />
          </Button>
        </div>
      </form>
      {busy && (
        <p role="status" className="text-sm text-muted">
          Đang tìm cảm hứng cho bạn…
        </p>
      )}
      {error && (
        <Notice>
          {error}
          <Button secondary onClick={() => setAttempt((value) => value + 1)}>
            Tải lại nội dung
          </Button>
        </Notice>
      )}
      <Link href="/favorites" className="text-action self-start text-sm">
        Mở những nơi bạn đã yêu thích →
      </Link>
      {categories.length > 0 && (
        <section aria-label="Chủ đề khám phá">
          <h2 className="mb-4">Đi theo điều bạn thích</h2>
          <div className="flex flex-wrap gap-3">
            {categories.map(({ entry }) => (
              <Link
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line bg-paper px-5 py-3 font-semibold hover:border-teal hover:text-teal"
                href={'/explore?categoryId=' + encodeURIComponent(entry.id)}
                key={entry.id}
              >
                <Icon name="compass" />
                {entry.title}
              </Link>
            ))}
          </div>
        </section>
      )}
      {(
        [
          ['destination', 'Một nơi mới đang chờ', 'Điểm đến nổi bật'],
          ['place', 'Dừng chân, khám phá', 'Địa điểm đáng ghé'],
          ['food', 'Nếm một chút địa phương', 'Ẩm thực & đặc sản'],
          ['article', 'Mang theo những câu chuyện', 'Cẩm nang du lịch'],
        ] as const
      ).map(([kind, eyebrow, title]) => {
        const group = items.filter((item) => item.entry.kind === kind);
        return group.length > 0 ? (
          <section key={kind} aria-label={title}>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-semibold tracking-wider text-teal uppercase">
                  {eyebrow}
                </p>
                <h2>{title}</h2>
              </div>
              <Link className="text-action text-sm" href={'/explore?kind=' + kind}>
                Xem tất cả <Icon name="arrow" />
              </Link>
            </div>
            <ContentGrid items={group} />
          </section>
        ) : null;
      })}
      {!busy && !error && !items.length && (
        <section className="surface p-6">
          <h2>Những hành trình mới đang được chuẩn bị</h2>
          <p className="mt-3 text-muted">
            Nội dung sẽ xuất hiện khi đã được biên tập và công bố. Bạn có thể tự chọn điểm đến để
            lên kế hoạch ngay.
          </p>
          <Link href="/trips/new?choose=1" className="text-action mt-4">
            Bắt đầu chuyến đi <Icon name="arrow" />
          </Link>
        </section>
      )}
    </div>
  );
}
