import { usePhotoCredit } from '../../components/photo-credits';
import { useRef, useState } from 'react';
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
  const photo = photos[index];
  usePhotoCredit(
    photo && photo.sourceUrl
      ? {
          src: photo.src,
          title: photo.alt,
          credit: `${photo.author}${photo.license ? ' · ' + photo.license : ''}`,
          sourceUrl: photo.sourceUrl,
          licenseUrl: photo.licenseUrl,
        }
      : undefined,
  );
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
        aria-label="Thông tin ảnh"
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
        className="photo-viewer fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-fit max-w-[calc(100%-2rem)] overflow-visible border-0 bg-transparent p-0 backdrop:bg-ink/80"
      >
        {opened && (
          <img
            src={photo.src}
            alt={photo.alt}
            className="block h-auto max-h-[calc(100dvh-2rem)] w-auto max-w-[calc(100vw-2rem)] object-contain"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setIndex((value) => value + 1)}
          />
        )}
      </dialog>
    </figure>
  );
}
