import { useEffect, useState } from 'react';
import { Button } from '../components/ui';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function PwaStatus() {
  const [offline, setOffline] = useState(!navigator.onLine),
    [ready, setReady] = useState(false),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null),
    [install, setInstall] = useState<InstallPrompt | null>(null),
    [message, setMessage] = useState('');
  useEffect(() => {
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
          return navigator.serviceWorker.ready.then(() => {
            if (mounted) setReady(true);
          });
        })
        .catch(() => {
          if (mounted) setMessage('Chưa lưu được giao diện để dùng khi mất mạng.');
        });
    }
    return () => {
      mounted = false;
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-xs text-muted [&_button]:min-h-9 [&_button]:px-3 [&_button]:py-2 [&_button]:text-xs"
      aria-live="polite"
    >
      <span>
        {offline
          ? 'Ngoại tuyến · Chuyến khách vẫn dùng được'
          : ready
            ? 'Sẵn sàng dùng ngoại tuyến'
            : 'Lên kế hoạch cho hành trình của bạn'}
      </span>
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
            if (!window.confirm('Tải phiên bản mới? Hãy lưu bản nháp trước khi tiếp tục.')) return;
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
              once: true,
            });
            waiting.postMessage('ACTIVATE_UPDATE');
          }}
        >
          Có bản mới · Cập nhật
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
