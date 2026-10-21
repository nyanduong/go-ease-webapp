import { useState } from 'react';
import type { TravelPhoto } from './travel-photos';

export function TravelPhotoView({
  photos,
  className = '',
  cover = false,
}: {
  photos: TravelPhoto[];
  className?: string;
  cover?: boolean;
}) {
  // A replacement activity/source starts a fresh failure chain.
  const signature = photos.map((photo) => photo.src).join('|');
  return <PhotoChain key={signature} photos={photos} className={className} cover={cover} />;
}

function PhotoChain({
  photos,
  className,
  cover,
}: {
  photos: TravelPhoto[];
  className: string;
  cover: boolean;
}) {
  const [index, setIndex] = useState(0);
  const photo = photos[index];
  if (!photo) return null;
  return (
    <figure className={`${className} min-w-0`} data-travel-photo>
      <div
        className={`relative overflow-hidden rounded-xl bg-sand ${cover ? 'aspect-[16/7]' : 'h-20 sm:h-28'}`}
      >
        {photo ? (
          <>
            <img
              src={photo.src}
              alt={photo.alt}
              width={cover ? 960 : 160}
              height={cover ? 420 : 112}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setIndex((value) => value + 1)}
            />
          </>
        ) : null}
      </div>
      {photo && (
        <figcaption className="mt-1 min-w-0 text-[10px] leading-tight text-muted">
          <a
            className="block min-w-0 truncate underline"
            href={photo.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`${photo.alt} · ${photo.author}. ${photo.license ? 'Đã thu nhỏ, chuyển WebP và cắt khung hiển thị.' : 'Xem nguồn địa điểm.'}`}
          >
            Ảnh: {photo.author}
          </a>
          {photo.licenseUrl && (
            <a
              className="underline"
              href={photo.licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {photo.license}
            </a>
          )}
        </figcaption>
      )}
    </figure>
  );
}
