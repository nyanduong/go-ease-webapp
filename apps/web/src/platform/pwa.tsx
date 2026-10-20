import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui';
import { confirmAction } from './confirmation';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function PwaStatus() {
  const [offline, setOffline] = useState(!navigator.onLine),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null),
    [install, setInstall] = useState<InstallPrompt | null>(null),
    [message, setMessage] = useState('');
  const activeWorker = useRef(waiting),
    mountedRef = useRef(true),
    updating = useRef(false);
  activeWorker.current = waiting;
  useEffect(() => {
    mountedRef.current = true;
    const network = () => setOffline(!navigator.onLine);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const installed = () => {
      setInstall(null);
      setMessage('Đã cài GoEase.');
    };
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    let mounted = true;
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          if (!mounted) return;
          if (registration.waiting) setWaiting(registration.waiting);
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => {
              if (mounted && worker.state === 'installed' && navigator.serviceWorker.controller)
                setWaiting(worker);
            });
          });
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
      mountedRef.current = false;
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  async function update() {
    if (updating.current || !waiting) return;
    const worker = waiting;
    updating.current = true;
    try {
      if (
        !(await confirmAction({
          title: 'Cập nhật GoEase?',
          message: 'Hãy lưu thay đổi trước khi cập nhật. GoEase sẽ tải lại trang để dùng bản mới.',
          confirmLabel: 'Cập nhật và tải lại',
          cancelLabel: 'Để sau',
        })) ||
        !mountedRef.current ||
        activeWorker.current !== worker ||
        worker.state !== 'installed'
      )
        return;
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
        once: true,
      });
      worker.postMessage('ACTIVATE_UPDATE');
      setWaiting(null);
    } finally {
      updating.current = false;
    }
  }
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-xs text-muted [&_button]:min-h-9 [&_button]:px-3 [&_button]:py-2 [&_button]:text-xs"
      aria-live="polite"
    >
      {offline && <span>Bạn đang mất kết nối. Kết nối mạng để lưu chuyến đi.</span>}
      {install && (
        <Button
          secondary
          onClick={() => {
            void install
              .prompt()
              .then(() => install.userChoice)
              .then(() => setInstall(null));
          }}
        >
          Cài GoEase
        </Button>
      )}
      {waiting && (
        <Button
          secondary
          onClick={() => {
            void update();
          }}
        >
          Cập nhật GoEase
        </Button>
      )}
      {message && <span>{message}</span>}
      {!install && (
        <details>
          <summary>Cài trên điện thoại</summary>
          <p>
            Android/Chrome: menu → Cài ứng dụng. iPhone/Safari: Chia sẻ → Thêm vào Màn hình chính.
          </p>
        </details>
      )}
    </div>
  );
}
