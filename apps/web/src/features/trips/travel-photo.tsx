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
        onClick={() => dialog.current?.showModal()}
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
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-line bg-paper p-6 text-ink shadow-2xl backdrop:bg-ink/45"
      >
        <h2 id={titleId} className="text-lg">
          Thông tin ảnh
        </h2>
        <p className="mt-3 text-sm">{photo.alt}</p>
        <a
          className="mt-3 block text-sm text-teal underline"
          href={photo.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ảnh: {photo.author}
        </a>
        {photo.licenseUrl && (
          <>
            <a
              className="mt-2 block text-sm text-teal underline"
              href={photo.licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {photo.license}
            </a>
            <p className="mt-2 text-sm text-muted">
              Đã thu nhỏ, chuyển WebP và cắt khung hiển thị.
            </p>
          </>
        )}
        <form method="dialog" className="mt-5 flex justify-end">
          <button className="min-h-11 rounded-xl border border-line px-5 text-sm font-semibold">
            Đóng
          </button>
        </form>
      </dialog>
    </figure>
  );
}
