import { useState } from 'react';
import { usePhotoCredit } from '../../components/photo-credits';
import type { ContentInput, ContentRecord } from '@goease/contracts';
import { Link } from '../../app/router';
import { Icon } from '../../components/icon';
import curated from '../trips/curated-photos.json' with { type: 'json' };
import editorialPhotos from './editorial-photos.json' with { type: 'json' };
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
export function contentPhotos(entry: ContentInput) {
  const images: {
    url: string;
    alt: string;
    credit: string;
    sourceUrl: string;
    licenseUrl?: string;
    city?: boolean;
    position?: string;
    aspectRatio?: number;
  }[] = [];
  if (entry.image) {
    const cached = [...curated, ...editorialPhotos].find((photo) => {
      const file =
        'file' in photo
          ? photo.file
          : decodeURIComponent(photo.sourceUrl.split('/wiki/File:')[1] ?? '');
      return (
        entry.image!.url ===
        'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file)
      );
    });
    images.push({
      ...entry.image,
      url: cached?.src ?? entry.image.url,
      sourceUrl:
        cached?.sourceUrl ??
        entry.sources.find((source) => source.title.startsWith('Ảnh'))?.url ??
        entry.image.url,
      ...(cached?.licenseUrl ? { licenseUrl: cached.licenseUrl } : {}),
      position: cached ? photoPosition(cached.src) : undefined,
      aspectRatio: cached && 'width' in cached ? cached.width / cached.height : undefined,
    });
  }
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
      position: photoPosition(photo.src),
      aspectRatio: (() => {
        const dimensions = curated.find((item) => item.src === photo.src);
        return dimensions ? dimensions.width / dimensions.height : undefined;
      })(),
    });
  };
  if (entry.kind === 'destination') addLocal(destinationPhoto(entry.destination?.id ?? entry.id));
  if (entry.kind === 'place' && entry.destinationId) {
    addLocal(placePhoto(entry.title, entry.destinationId));
    addLocal(destinationPhoto(entry.destinationId), true);
  }
  return images;
}

function photoPosition(src: string) {
  if (src === '/travel/dalat-datanla.webp') return '50% 28%';
  if (src === '/travel/da-nang.webp') return '50% 40%';
  if (src === '/travel/dalat-station.webp') return '50% 55%';
  return '50% 50%';
}

export function ContentImage({
  entry,
  hero = false,
  compact = false,
  href,
}: {
  entry: ContentInput;
  hero?: boolean;
  compact?: boolean;
  href?: string;
}) {
  const [index, setIndex] = useState(0);
  const images = contentPhotos(entry);
  const image = images[index];
  usePhotoCredit(
    image
      ? {
          src: image.url,
          title: image.alt,
          credit: image.credit,
          sourceUrl: image.sourceUrl,
          licenseUrl: image.licenseUrl,
        }
      : undefined,
  );
  const unavailable = !image && images.length > 0;
  const pixels =
    compact && !image ? (
      <div
        className="content-image-missing"
        role="img"
        aria-label={(unavailable ? 'Ảnh chưa tải được: ' : 'Chưa có ảnh: ') + entry.title}
      >
        <Icon name={entry.kind === 'food' ? 'food' : 'pin'} />
        <span>{unavailable ? 'Ảnh chưa tải được' : 'Chưa có ảnh'}</span>
      </div>
    ) : (
      <img
        src={image ? image.url : '/travel/placeholder.svg'}
        alt={
          image ? image.alt : (unavailable ? 'Ảnh chưa tải được: ' : 'Chưa có ảnh: ') + entry.title
        }
        onError={() => {
          if (image) setIndex((value) => value + 1);
        }}
        loading={hero ? 'eager' : 'lazy'}
        decoding="async"
        className={`w-full object-cover ${compact ? 'content-image-pixels' : hero ? 'aspect-[16/9] max-h-[32rem]' : 'aspect-[4/3]'}`}
        width={hero ? 960 : 480}
        height={hero ? 540 : 360}
        style={{ objectPosition: image?.position }}
      />
    );
  return (
    <figure
      className={
        compact ? 'content-image-compact' : 'relative min-w-0 overflow-hidden rounded-2xl bg-sand'
      }
      data-image-state={unavailable ? 'error' : image ? (index ? 'fallback' : 'ready') : 'missing'}
    >
      {href ? (
        <Link href={href} aria-label={'Mở ' + entry.title}>
          {pixels}
        </Link>
      ) : (
        pixels
      )}
      {image?.city && <span className="content-city-label">Ảnh minh họa điểm đến</span>}
    </figure>
  );
}

// Shared editorial images keep source metadata in the page credit disclosure.
export function DiscoveryCollection({
  items,
  kind,
  rail = false,
}: {
  items: ContentRecord[];
  kind: Exclude<ContentInput['kind'], 'category'>;
  rail?: boolean;
}) {
  return (
    <div
      className={
        'discovery-collection discovery-collection-' +
        kind +
        (rail ? ' discovery-collection-rail' : '')
      }
      role="group"
      aria-label={kindLabels[kind] + (rail || kind === 'destination' ? ' · Cuộn ngang' : '')}
      tabIndex={rail || kind === 'destination' ? 0 : undefined}
    >
      {items.map(({ entry }) => (
        <article key={entry.id} className={'discovery-card discovery-card-' + kind}>
          <ContentImage
            key={entry.id + entry.image?.url}
            compact
            entry={entry}
            href={'/explore/' + encodeURIComponent(entry.id)}
          />
          <div className="discovery-card-copy">
            <h3>
              <Link href={'/explore/' + encodeURIComponent(entry.id)}>{entry.title}</Link>
            </h3>
            {kind === 'article' && <p>{entry.summary}</p>}
            {kind !== 'destination' && (
              <span className="discovery-card-meta">{kindLabels[entry.kind]}</span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
export function ContentCard({ record }: { record: ContentRecord }) {
  const { entry } = record;
  return (
    <article className="group flex min-w-0 flex-col gap-3 rounded-2xl outline-offset-4">
      <ContentImage
        key={entry.id + entry.image?.url}
        compact
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
