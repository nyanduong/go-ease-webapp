import { useState } from 'react';
import { publicMedia } from '../platform/public-media';
import { offlineDev } from '../platform/dev-mode';

// Delivery URLs are public. Upload credentials never belong in the browser bundle.
const configuredUrl =
  (import.meta.env.VITE_CLOUDINARY_DALAT_URL as string | undefined) || publicMedia.dalat;
const widths = [480, 768, 1024, 1536];

export function ScenicImage({
  className,
  priority = false,
  decorative = false,
  sizes = '(max-width: 487px) calc(100vw - 76px), (max-width: 1023px) 412px, 600px',
  source = configuredUrl,
  fallbackSrc = '/dalat-fallback.webp',
  alt = 'Nắng chiều trên hồ, rừng thông và những ngọn đồi Đà Lạt',
  width = 1536,
  height = 1024,
}: {
  className?: string;
  priority?: boolean;
  decorative?: boolean;
  sizes?: string;
  source?: string;
  fallbackSrc?: string;
  alt?: string;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  const deliveryUrl =
    !offlineDev &&
    /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/(?:v\d+\/)?[a-zA-Z0-9_\-/]+\.(png|jpg|jpeg|webp)$/.test(
      source,
    )
      ? source
      : undefined;
  const imageUrl = (width: number) =>
    deliveryUrl
      ? deliveryUrl.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${width}/`)
      : fallbackSrc;
  return (
    <img
      className={className}
      src={failed ? fallbackSrc : imageUrl(1024)}
      srcSet={
        failed || !deliveryUrl
          ? undefined
          : widths.map((width) => `${imageUrl(width)} ${width}w`).join(', ')
      }
      sizes={sizes}
      alt={decorative ? '' : alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
