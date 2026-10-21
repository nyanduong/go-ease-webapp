import { useId, useRef, useState } from 'react';
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
  const [opened, setOpened] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const photo = photos[index];
  if (!photo) return null;
  return (
    <figure className={`${className} min-w-0`} data-travel-photo>
      <button
        type="button"
        aria-label={`Thông tin ảnh: ${photo.alt}`}
        aria-haspopup="dialog"
        onClick={() => {
          setOpened(true);
          dialog.current?.showModal();
        }}
        className={`block w-full overflow-hidden rounded-xl bg-sand ${cover ? 'aspect-[16/7]' : 'h-20 sm:h-28'}`}
      >
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
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setOpened(false)}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border border-line bg-paper p-3 text-ink shadow-2xl backdrop:bg-ink/60 sm:p-5"
      >
        <h2 id={titleId} className="sr-only">
          Thông tin ảnh
        </h2>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{photo.alt}</p>
          <form method="dialog">
            <button className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold">
              Đóng
            </button>
          </form>
        </div>
        {opened && (
          <img
            src={photo.src}
            alt={photo.alt}
            className="mx-auto max-h-[70dvh] w-full rounded-xl bg-ink/5 object-contain"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setIndex((value) => value + 1)}
          />
        )}
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted">
          <a className="underline" href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
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
        </div>
        {photo.licenseUrl && (
          <p className="mt-1 text-[10px] text-muted">
            Đã thu nhỏ, chuyển WebP; ảnh xem trước được cắt khung.
          </p>
        )}
      </dialog>
    </figure>
  );
}
