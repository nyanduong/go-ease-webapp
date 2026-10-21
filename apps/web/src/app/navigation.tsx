import { Brand } from '../components/ui';
import { Icon, type IconName } from '../components/icon';
import { Link } from './router';

const links: { href: string; icon: IconName; label: string }[] = [
  { href: '/', icon: 'home', label: 'Trang chủ' },
  { href: '/explore', icon: 'compass', label: 'Khám phá' },
  { href: '/trips', icon: 'trips', label: 'Chuyến đi' },
  { href: '/account', icon: 'account', label: 'Cá nhân' },
];
export function Navigation({ path }: { path: string }) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line bg-paper px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:inset-y-0 lg:right-auto lg:w-64 lg:flex-col lg:items-stretch lg:justify-start lg:gap-2 lg:border-t-0 lg:border-r lg:px-5 lg:py-8"
    >
      <div className="mb-10 hidden px-2 lg:block">
        <Brand />
      </div>
      <span className="mb-2 hidden px-4 text-[10px] font-bold tracking-[.2em] text-muted uppercase lg:block">
        Không gian hành trình
      </span>
      {links.map(({ href, icon, label }) => (
        <Link
          href={href}
          key={href}
          aria-current={
            (
              href === '/'
                ? path === '/' || path === '/sample'
                : href === '/account'
                  ? path === '/account' || path === '/about' || path === '/travel-services'
                  : path.startsWith(href)
            )
              ? 'page'
              : undefined
          }
          className="group flex min-h-14 min-w-16 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-sm font-semibold text-muted transition-colors duration-200 hover:bg-mint/60 aria-[current=page]:text-teal-dark motion-safe:active:scale-[.97] motion-reduce:transition-none lg:min-h-13 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-sm"
        >
          <Icon
            name={icon}
            className="transition-transform duration-200 motion-safe:group-aria-[current=page]:scale-110 motion-reduce:transition-none"
          />
          {label}
          <span
            aria-hidden="true"
            className="ml-auto hidden size-1.5 rounded-full bg-teal group-aria-[current=page]:lg:block"
          />
        </Link>
      ))}
      <div className="mt-auto hidden flex-col gap-4 pt-10 lg:flex">
        <Link href="/favorites" className="px-4 text-sm font-semibold text-teal">
          Yêu thích của tôi →
        </Link>
        <div className="rounded-2xl bg-sand p-5">
          <Icon name="compass" />
          <p className="mt-3 text-sm font-bold">Một chuyến đi thật riêng.</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Từ điểm dừng chân đầu tiên đến những kỷ niệm khó quên.
          </p>
          <Link
            href="/trips/new"
            className="mt-4 inline-flex text-sm font-bold text-teal-dark underline decoration-teal/30 underline-offset-4"
          >
            Bắt đầu lên kế hoạch →
          </Link>
        </div>
        <Link href="/travel-services" className="px-4 text-xs text-muted hover:text-teal">
          Chỗ nghỉ & chuyến bay ↗
        </Link>
      </div>
    </nav>
  );
}
