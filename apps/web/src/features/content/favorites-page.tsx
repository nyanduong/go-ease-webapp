import { useEffect, useState } from 'react';
import { contentPageSchema, type ContentRecord } from '@goease/contracts';
import { Link } from '../../app/router';
import { Button, Notice } from '../../components/ui';
import { accountSession, useAccount } from '../account/session';
import { ContentGrid } from './content-cards';

export function FavoritesPage() {
  const { session } = useAccount();
  const [items, setItems] = useState<ContentRecord[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [after, setAfter] = useState(''),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    setBusy(true);
    setError('');
    void accountSession
      .contentRequest(
        'GET',
        '/v1/favorites' + (after ? '?after=' + encodeURIComponent(after) : ''),
        request.signal,
      )
      .then((raw) => {
        const page = contentPageSchema.parse(raw);
        if (request.signal.aborted) return;
        const visible = page.items.filter((item) => item.entry.status === 'published');
        setItems((previous) =>
          after
            ? [
                ...previous,
                ...visible.filter(
                  (item) => !previous.some((old) => old.entry.id === item.entry.id),
                ),
              ]
            : visible,
        );
        setCursor(page.nextCursor === after ? null : page.nextCursor);
      })
      .catch(() => {
        if (!request.signal.aborted) setError('Chưa mở được danh sách yêu thích. Hãy thử lại.');
      })
      .finally(() => {
        if (!request.signal.aborted) setBusy(false);
      });
    return () => request.abort();
  }, [session.userId, after, attempt]);
  return (
    <section className="flex flex-col gap-6">
      <header className="core-page-heading">
        <h1>Những nơi muốn đến</h1>
        <p className="text-muted">
          Nội dung yêu thích được lưu trong tài khoản để bạn quay lại bất cứ lúc nào.
        </p>
      </header>
      {error && (
        <Notice error>
          {error}
          <Button secondary onClick={() => setAttempt((value) => value + 1)}>
            Thử tải lại
          </Button>
        </Notice>
      )}
      {busy && <p role="status">Đang mở yêu thích…</p>}
      {!busy && !error && !items.length && (
        <Notice>
          Bạn chưa lưu nội dung nào. Khám phá một điểm đến và bấm “Lưu yêu thích” để bắt đầu.
          <Link href="/explore" className="text-action">
            Khám phá ngay →
          </Link>
        </Notice>
      )}
      <ContentGrid items={items} />
      {!busy && cursor && (
        <Button secondary onClick={() => setAfter(cursor)}>
          Xem thêm yêu thích
        </Button>
      )}
    </section>
  );
}
