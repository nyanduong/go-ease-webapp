import { useEffect, useState } from 'react';
import { contentPageSchema, type ContentRecord } from '@goease/contracts';
import { Link, contentReturnPath } from '../../app/router';
import { Button, Notice } from '../../components/ui';
import { Icon } from '../../components/icon';
import { accountSession, useAccount } from '../account/session';
import { contentDetail, contentPage } from './content-api';
import { ContentGrid, ContentImage, kindLabels } from './content-cards';

export function ContentDetail({ id }: { id: string }) {
  const { session } = useAccount();
  const [backPath] = useState(contentReturnPath);
  const [destinationName, setDestinationName] = useState('');
  const [record, setRecord] = useState<ContentRecord | null>(null),
    [related, setRelated] = useState<ContentRecord[]>([]),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [favorite, setFavorite] = useState(false),
    [saving, setSaving] = useState(false),
    [favoriteError, setFavoriteError] = useState(''),
    [favoriteReady, setFavoriteReady] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    setError('');
    setRecord(null);
    setRelated([]);
    setDestinationName('');
    void contentDetail(id, request.signal)
      .then(async (value) => {
        if (request.signal.aborted) return;
        setRecord(value);
        if (value.entry.destination) setDestinationName(value.entry.destination.name);
        else if (value.entry.destinationId) {
          void contentDetail(value.entry.destinationId, request.signal)
            .then((parent) => {
              if (!request.signal.aborted)
                setDestinationName(parent.entry.destination?.name ?? parent.entry.title);
            })
            .catch(() => {
              /* The detail remains readable without its destination. */
            });
        }
        const params: Record<string, string> =
          value.entry.kind === 'category'
            ? { categoryId: id }
            : { destinationId: value.entry.destinationId ?? id };
        try {
          const page = await contentPage(
            new URLSearchParams({ ...params, limit: '6' }),
            request.signal,
          );
          if (!request.signal.aborted)
            setRelated(page.items.filter((item) => item.entry.id !== id));
        } catch {
          /* Detail remains usable if related content is unavailable. */
        }
      })
      .catch((error: unknown) => {
        if (!request.signal.aborted)
          setError(error instanceof Error ? error.message : 'Chưa mở được nội dung.');
      });
    return () => request.abort();
  }, [id, attempt]);
  useEffect(() => {
    const request = new AbortController();
    setFavorite(false);
    setFavoriteReady(false);
    setFavoriteError('');
    if (session.phase === 'backend-verified')
      void (async () => {
        let after: string | null = null;
        const visited = new Set<string>();
        do {
          const page = contentPageSchema.parse(
            await accountSession.contentRequest(
              'GET',
              '/v1/favorites' + (after ? '?after=' + encodeURIComponent(after) : ''),
              request.signal,
            ),
          );
          if (request.signal.aborted) return;
          if (page.items.some((item) => item.entry.id === id)) {
            setFavorite(true);
            break;
          }
          after = page.nextCursor;
          if (after && visited.has(after)) throw Error('Chưa tải hết danh sách yêu thích.');
          if (after) visited.add(after);
        } while (after);
        if (!request.signal.aborted) setFavoriteReady(true);
      })().catch(() => {
        if (!request.signal.aborted)
          setFavoriteError(
            'Chưa kiểm tra được trạng thái yêu thích. Hãy tải lại trang để thử lại.',
          );
      });
    return () => request.abort();
  }, [id, session.phase, session.userId]);
  async function toggleFavorite() {
    if (saving || !favoriteReady) return;
    setSaving(true);
    setFavoriteError('');
    try {
      await accountSession.contentRequest(
        favorite ? 'DELETE' : 'PUT',
        '/v1/favorites/' + encodeURIComponent(id),
      );
      setFavorite(!favorite);
    } catch {
      setFavoriteError('Chưa xác nhận được thay đổi yêu thích. Hãy thử lại.');
    } finally {
      setSaving(false);
    }
  }
  if (error)
    return (
      <Notice error>
        {error}
        <Button secondary onClick={() => setAttempt((value) => value + 1)}>
          Thử mở lại
        </Button>
        <Link href={backPath}>Quay lại danh sách</Link>
      </Notice>
    );
  if (!record)
    return (
      <p role="status" className="surface p-5">
        Đang mở nội dung…
      </p>
    );
  const { entry } = record;
  return (
    <article className={`content-detail content-detail-${entry.kind} flex min-w-0 flex-col gap-5`}>
      <Link href={backPath} className="text-action self-start">
        <Icon name="back" />{' '}
        {backPath.startsWith('/favorites')
          ? 'Yêu thích'
          : backPath === '/'
            ? 'Trang chủ'
            : 'Khám phá'}
      </Link>
      <header className="max-w-3xl">
        <p className="mb-2 text-sm font-semibold text-teal">
          {kindLabels[entry.kind]} · GoEase biên tập
        </p>
        <h1 className="text-3xl sm:text-4xl">{entry.title}</h1>
        <p className="mt-3 text-base text-muted">{entry.summary}</p>
      </header>
      <ContentImage key={entry.id + entry.image?.url} entry={entry} hero />
      <div className="flex flex-wrap items-center gap-3">
        {entry.kind !== 'category' && destinationName && (
          <Link
            className="primary-link"
            href={'/trips/new?content=' + encodeURIComponent(entry.id)}
          >
            Lên lịch tại {destinationName} <Icon name="arrow" />
          </Link>
        )}
        {session.phase === 'backend-verified' ? (
          <Button
            secondary
            disabled={saving || !favoriteReady}
            onClick={() => void toggleFavorite()}
          >
            {saving
              ? 'Đang lưu yêu thích…'
              : !favoriteReady
                ? 'Đang kiểm tra yêu thích…'
                : favorite
                  ? 'Bỏ yêu thích'
                  : 'Lưu yêu thích'}
          </Button>
        ) : (
          <Link className="text-action" href="/login">
            Đăng nhập để lưu yêu thích
          </Link>
        )}
        <Link className="text-action text-sm" href="/favorites">
          Danh sách yêu thích
        </Link>
      </div>
      {favoriteError && <Notice error>{favoriteError}</Notice>}
      <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="content-reading min-w-0 text-base leading-relaxed">
          {entry.body.split(/\n\s*\n/).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
        <aside className="surface flex flex-col gap-4 self-start p-5 text-sm">
          <h2 className="text-lg">Trước khi lên đường</h2>
          {entry.address && (
            <p className="flex items-start gap-2">
              <Icon name="pin" className="shrink-0" />
              {entry.address}
            </p>
          )}
          {entry.coordinates && (
            <a
              className="text-action"
              href={`https://www.google.com/maps/search/?api=1&query=${entry.coordinates.latitude},${entry.coordinates.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Mở bản đồ ↗
            </a>
          )}
          <p className="text-xs text-muted">
            Cập nhật {new Date(record.updatedAt).toLocaleDateString('vi-VN')}. Kiểm tra lại giờ mở
            cửa, giá và điều kiện trước khi đi.
          </p>
          <h3 className="text-sm">Nguồn tham khảo</h3>
          {entry.sources
            .filter(
              (source) =>
                !source.title.startsWith('Ảnh') && !source.title.startsWith('Giấy phép ảnh'),
            )
            .map((source) => (
              <a
                key={source.url}
                className="break-words text-teal underline underline-offset-4"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.title} ↗
              </a>
            ))}
        </aside>
      </div>
      {related.length > 0 && (
        <section className="border-t border-line pt-7">
          <h2 className="mb-5">Cùng một hành trình</h2>
          <ContentGrid items={related} />
        </section>
      )}
    </article>
  );
}
