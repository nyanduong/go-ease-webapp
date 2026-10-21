import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type PhotoCredit = {
  src: string;
  title: string;
  credit: string;
  sourceUrl: string;
  licenseUrl?: string;
};
const Credits = createContext<{
  photos: Map<string, PhotoCredit>;
  register: (id: string, photo: PhotoCredit) => () => void;
}>({ photos: new Map(), register: () => () => {} });

// Register only photos on the current screen, including the selected fallback.
// Credits stay on the same page without interrupting the image/title composition.
export function PhotoCreditsProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState(new Map<string, PhotoCredit>());
  const register = useCallback((id: string, photo: PhotoCredit) => {
    setPhotos((previous) => new Map(previous).set(id, photo));
    return () =>
      setPhotos((previous) => {
        const next = new Map(previous);
        next.delete(id);
        return next;
      });
  }, []);
  const value = useMemo(() => ({ photos, register }), [photos, register]);
  return <Credits.Provider value={value}>{children}</Credits.Provider>;
}

export function usePhotoCredit(photo: PhotoCredit | undefined) {
  const id = useId();
  const { register } = useContext(Credits);
  const serialized = JSON.stringify(photo);
  useEffect(() => {
    if (serialized) return register(id, JSON.parse(serialized) as PhotoCredit);
  }, [id, register, serialized]);
}

export function PhotoCredits() {
  const { photos } = useContext(Credits);
  const unique = [...new Map([...photos.values()].map((photo) => [photo.src, photo])).values()];
  if (!unique.length) return null;
  return (
    <details className="page-photo-credits text-xs text-muted">
      <summary>Thông tin ảnh</summary>
      <p>Ảnh được thu nhỏ và cắt theo khung hiển thị. Giấy phép áp dụng riêng cho từng ảnh.</p>
      <ul className="grid gap-4 pb-3 sm:grid-cols-2">
        {unique.map((photo) => (
          <li key={photo.src} className="min-w-0 break-words">
            <p className="font-semibold text-ink">{photo.title}</p>
            <p>{photo.credit}</p>
            <div className="flex flex-wrap gap-x-4">
              <a
                href={photo.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-action underline"
              >
                Nguồn ảnh ↗
              </a>
              {photo.licenseUrl && (
                <a
                  href={photo.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-action underline"
                >
                  Giấy phép ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
