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
  const [closing, setClosing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const photo = photos[index];
  const closeViewer = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) dialog.current?.close();
    else setClosing(true);
  };
  if (!photo) return null;
  return (
    <figure className={`${className} min-w-0`} data-travel-photo>
      <button
        type="button"
        aria-label={`Thông tin ảnh: ${photo.alt}`}
        aria-haspopup="dialog"
        onClick={() => {
          setClosing(false);
          setOpened(true);
          dialog.current?.showModal();
        }}
        className={`photo-thumbnail block w-full overflow-hidden rounded-xl bg-sand ${cover ? 'aspect-[16/7]' : 'h-20 sm:h-28'}`}
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
        data-closing={closing || undefined}
        onClose={() => {
          setOpened(false);
          setClosing(false);
        }}
        onCancel={(event) => {
          event.preventDefault();
          closeViewer();
        }}
        onAnimationEnd={(event) => {
          if (closing && event.target === event.currentTarget) dialog.current?.close();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            closeViewer();
        }}
        className="photo-viewer fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border border-line bg-paper p-3 text-ink shadow-2xl backdrop:bg-ink/60 sm:p-5"
      >
        <h2 id={titleId} className="sr-only">
          Thông tin ảnh
        </h2>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{photo.alt}</p>
          <div>
            <button
              type="button"
              onClick={closeViewer}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold"
            >
              Đóng
            </button>
          </div>
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
        <div className="mt-4 rounded-xl bg-cream px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-sand text-sm font-semibold text-teal"
              >
                {photo.author.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] text-muted">Ghi nhận ảnh</p>
                <p className="text-sm font-medium break-words">{photo.author}</p>
              </div>
            </div>
            <a
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line bg-paper px-3 text-xs font-medium text-ink transition-colors hover:border-teal hover:text-teal"
              href={photo.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Xem nguồn ↗
            </a>
          </div>
          {photo.licenseUrl && (
            <details className="mt-1 border-t border-line/60 text-xs text-muted">
              <summary className="font-normal">Bản quyền ảnh</summary>
              <div className="pb-2">
                <a
                  className="text-teal underline underline-offset-4"
                  href={photo.licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {photo.license}
                </a>
                <p className="mt-2 leading-relaxed">
                  Ảnh đã được thu nhỏ; ảnh xem trước được cắt khung.
                </p>
              </div>
            </details>
          )}
        </div>
      </dialog>
    </figure>
  );
}
