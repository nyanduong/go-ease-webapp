import { useState } from 'react';
import type { ContentInput, ContentRecord } from '@goease/contracts';
import { Link } from '../../app/router';
import { destinationPhoto, neutralPhoto, placePhoto } from '../trips/travel-photos';

export const kindLabels: Record<ContentInput['kind'], string> = {
  destination: 'Điểm đến',
  place: 'Địa điểm',
  food: 'Ẩm thực',
  article: 'Cẩm nang',
  category: 'Chủ đề',
};
export function ContentImage({
  entry,
  hero = false,
  href,
}: {
  entry: ContentInput;
  hero?: boolean;
  href?: string;
}) {
  const [failed, setFailed] = useState(false);
  const local =
    entry.kind === 'destination'
      ? destinationPhoto(entry.destination?.id ?? entry.id)
      : entry.kind === 'place' && entry.destinationId
        ? placePhoto(entry.title, entry.destinationId)
        : undefined;
  const image =
    entry.image ??
    (local && local.src !== neutralPhoto.src
      ? {
          url: local.src,
          alt: local.alt,
          credit: `${local.author}${local.license ? ' · ' + local.license : ''}`,
        }
      : null);
  const pixels = (
    <img
      src={!failed && image ? image.url : '/travel/placeholder.svg'}
      alt={!failed && image ? image.alt : 'Chưa có ảnh: ' + entry.title}
      onError={() => setFailed(true)}
      loading={hero ? 'eager' : 'lazy'}
      decoding="async"
      className={`w-full object-cover ${hero ? 'aspect-[16/9] max-h-[32rem]' : 'aspect-[4/3]'}`}
      width={hero ? 960 : 480}
      height={hero ? 540 : 360}
    />
  );
  return (
    <figure className="min-w-0 overflow-hidden rounded-2xl bg-sand">
      {href ? (
        <Link href={href} aria-label={'Mở ' + entry.title}>
          {pixels}
        </Link>
      ) : (
        pixels
      )}
      {!failed && image && (
        <figcaption className="px-3 py-2 text-xs text-muted">
          Ảnh: {image.credit} · Cắt theo khung.{' '}
          <a
            href={entry.image ? entry.image.url : local?.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Nguồn ảnh
          </a>
          {!entry.image && local?.licenseUrl && (
            <>
              {' '}
              ·{' '}
              <a href={local.licenseUrl} target="_blank" rel="noreferrer" className="underline">
                Giấy phép
              </a>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
export function ContentCard({ record }: { record: ContentRecord }) {
  const { entry } = record;
  return (
    <article className="group flex min-w-0 flex-col gap-3 rounded-2xl outline-offset-4">
      <ContentImage
        key={entry.id + entry.image?.url}
        entry={entry}
        href={'/explore/' + encodeURIComponent(entry.id)}
      />
      <div className="px-1">
        <p className="mb-1 text-xs font-semibold text-teal">{kindLabels[entry.kind]}</p>
        <h3 className="group-hover:text-teal">
          <Link href={'/explore/' + encodeURIComponent(entry.id)}>{entry.title}</Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-muted">{entry.summary}</p>
      </div>
    </article>
  );
}
export function ContentGrid({ items }: { items: ContentRecord[] }) {
  return (
    <div className="grid min-w-0 gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((record) => (
        <ContentCard key={record.entry.id} record={record} />
      ))}
    </div>
  );
}
