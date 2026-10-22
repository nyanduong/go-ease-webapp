import { useEffect, useState } from 'react';
import type { ContentRecord } from '@goease/contracts';
import { Link, navigate } from '../../app/router';
import { Icon, type IconName } from '../../components/icon';
import { Button, Notice } from '../../components/ui';
import { contentPage } from './content-api';
import { ContentImage, DiscoveryCollection, contentPhotos } from './content-cards';

const shortcuts: { label: string; icon: IconName; href: string }[] = [
  { label: 'Lên lịch', icon: 'calendar', href: '/trips/new?choose=1' },
  { label: 'Điểm đến', icon: 'pin', href: '/explore?kind=destination' },
  { label: 'Ăn uống', icon: 'food', href: '/explore?kind=food' },
  { label: 'Cẩm nang', icon: 'file', href: '/explore?kind=article' },
];
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
    void Promise.all(
      ['destination', 'place', 'food', 'article'].map((kind) =>
        contentPage(new URLSearchParams({ kind, limit: '6' }), request.signal),
      ),
    )
      .then((pages) => {
        if (!request.signal.aborted) setItems(pages.flatMap((page) => page.items));
      })
      .catch(() => {
        if (!request.signal.aborted)
          setError('Chưa tải được nội dung khám phá. Bạn vẫn có thể lên lịch chuyến đi.');
      })
      .finally(() => {
        if (!request.signal.aborted) setBusy(false);
      });
    return () => request.abort();
  }, [attempt]);
  const photoKey = (item: ContentRecord) => contentPhotos(item.entry)[0]?.url;
  const completedPhoto = (item: ContentRecord) => {
    const photo = contentPhotos(item.entry)[0];
    return !!photo && !photo.city;
  };
  const destinationAndArticlePhotos = new Set(
    items.filter((item) => ['destination', 'article'].includes(item.entry.kind)).map(photoKey),
  );
  const cover =
    items
      .filter(
        (item) =>
          item.entry.kind === 'place' &&
          completedPhoto(item) &&
          (contentPhotos(item.entry)[0]?.aspectRatio ?? 1.3) >= 1.2 &&
          !destinationAndArticlePhotos.has(photoKey(item)),
      )
      .at(-1) ?? items.find((item) => item.entry.kind === 'destination' && completedPhoto(item));
  return (
    <div className="discovery-stack">
      <h1 className="sr-only">Khám phá cùng GoEase</h1>
      <div className="discovery-search-row">
        <form
          role="search"
          className="discovery-search"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate(
              '/explore' + (search.trim() ? '?q=' + encodeURIComponent(search.trim()) : ''),
            );
          }}
        >
          <label htmlFor="discovery-search" className="sr-only">
            Tìm điểm đến, địa điểm, món ngon…
          </label>
          <input
            id="discovery-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
            placeholder="Tìm điểm đến, địa điểm, món ngon…"
          />
          <button type="submit" aria-label="Tìm nội dung">
            <Icon name="search" />
          </button>
        </form>
      </div>
      <div className="discovery-shortcuts" aria-label="Truy cập nhanh">
        {shortcuts.map(({ label, icon, href }) => (
          <Link key={href} href={href}>
            <span>
              <Icon name={icon} />
            </span>
            {label}
          </Link>
        ))}
      </div>
      <section className="planning-banner" aria-label="Lên kế hoạch chuyến đi">
        <div>
          <h2>
            Chọn nơi đến.
            <br />
            Lên lịch theo ý bạn.
          </h2>
          <Link href="/trips/new?choose=1">
            Lên kế hoạch <Icon name="arrow" />
          </Link>
        </div>
        {cover && <ContentImage key={cover.entry.id} entry={cover.entry} compact />}
      </section>
      {busy && (
        <p role="status" className="text-sm text-muted">
          Đang tải nội dung…
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
      {(
        [
          ['destination', 'Bạn muốn đi đâu?'],
          ['place', 'Địa điểm đáng ghé'],
          ['food', 'Ăn gì ở đây?'],
          ['article', 'Kinh nghiệm cho chuyến đi'],
        ] as const
      ).map(([kind, title]) => {
        let group = items
          .filter((item) => item.entry.kind === kind)
          .sort((a, b) => Number(completedPhoto(b)) - Number(completedPhoto(a)));
        if (kind === 'place') {
          if (group.length > 4) group = group.filter((item) => item.entry.id !== cover?.entry.id);
          group = group.slice(0, 4);
        }
        if (kind === 'article') group = group.slice(0, 2);
        return group.length || kind === 'destination' ? (
          <section key={kind} className="discovery-section" aria-label={title}>
            <div className="discovery-section-heading">
              <h2>{title}</h2>
              <Link href={'/explore?kind=' + kind}>
                Xem tất cả <Icon name="chevron" />
              </Link>
            </div>
            <DiscoveryCollection items={group} kind={kind} rail={kind === 'food'} />
          </section>
        ) : null;
      })}
      {!busy && !error && !items.length && (
        <Notice>
          Nội dung đang được biên tập. Bạn có thể chọn “Lên lịch” để bắt đầu chuyến đi.
        </Notice>
      )}
    </div>
  );
}
