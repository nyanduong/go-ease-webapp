import { useState } from 'react';
import type { ContentInput, ContentRecord } from '@goease/contracts';
import { Link } from '../../app/router';
import {
  destinationPhoto,
  neutralPhoto,
  placePhoto,
  type TravelPhoto,
} from '../trips/travel-photos';

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
  const [index, setIndex] = useState(0);
  const images: {
    url: string;
    alt: string;
    credit: string;
    sourceUrl: string;
    licenseUrl?: string;
    city?: boolean;
  }[] = [];
  if (entry.image) images.push({ ...entry.image, sourceUrl: entry.image.url });
  const addLocal = (photo: TravelPhoto | undefined, city = false) => {
    if (!photo || photo.src === neutralPhoto.src || images.some((image) => image.url === photo.src))
      return;
    images.push({
      url: photo.src,
      alt: photo.alt,
      credit: `${photo.author}${photo.license ? ' · ' + photo.license : ''}`,
      sourceUrl: photo.sourceUrl,
      ...(photo.licenseUrl ? { licenseUrl: photo.licenseUrl } : {}),
      city,
    });
  };
  if (entry.kind === 'destination') addLocal(destinationPhoto(entry.destination?.id ?? entry.id));
  if (entry.kind === 'place' && entry.destinationId) {
    addLocal(placePhoto(entry.title, entry.destinationId));
    addLocal(destinationPhoto(entry.destinationId), true);
  }
  const image = images[index];
  const pixels = (
    <img
      src={image ? image.url : '/travel/placeholder.svg'}
      alt={image ? image.alt : 'Chưa có ảnh: ' + entry.title}
      onError={() => {
        if (image) setIndex((value) => value + 1);
      }}
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
      {image && (
        <figcaption className="px-3 py-2 text-xs text-muted">
          {image.city ? 'Ảnh minh họa điểm đến' : 'Ảnh'}: {image.credit} · Cắt theo khung.{' '}
          <a href={image.sourceUrl} target="_blank" rel="noreferrer" className="underline">
            Nguồn ảnh
          </a>
          {image.licenseUrl && (
            <>
              {' '}
              ·{' '}
              <a href={image.licenseUrl} target="_blank" rel="noreferrer" className="underline">
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
