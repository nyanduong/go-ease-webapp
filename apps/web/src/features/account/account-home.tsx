import { useEffect, useRef } from 'react';
import { Link } from '../../app/router';
import { accountTrips, useAccount } from './session';
import { mostRecentlyUpdated } from '../trips/recent-trip';
import { Icon } from '../../components/icon';
import { DiscoveryHome } from '../content/discovery-home';

export function AccountHome() {
  const { trips } = useAccount();
  const requested = useRef(new Set<string>());
  useEffect(() => {
    requested.current.clear();
  }, [trips.owner]);
  useEffect(() => {
    if (!trips.ready || trips.busy || !trips.cursor || trips.draft || trips.pending) return;
    const key = `${trips.owner}:${trips.cursor}`;
    if (requested.current.has(key)) return;
    requested.current.add(key);
    void accountTrips.list(true);
  }, [trips.owner, trips.ready, trips.busy, trips.cursor, trips.draft, trips.pending]);
  const latest =
    trips.draft?.trip ?? (!trips.cursor ? mostRecentlyUpdated(trips.items) : undefined);
  return (
    <div className="discovery-home">
      <DiscoveryHome />
      {trips.ready && latest && (
        <section className="recent-trip" aria-label="Tiếp tục chuyến gần nhất">
          <h2>Tiếp tục chuyến gần nhất</h2>
          <Link
            href={`/trips/${encodeURIComponent(latest.id)}`}
            className="surface flex min-h-16 items-center justify-between gap-3 p-4"
          >
            <div>
              <h3>{latest.name}</h3>
              <p className="text-sm text-muted">
                {trips.draft
                  ? 'Bản nháp · Tiếp tục chỉnh sửa'
                  : `${latest.durationDays} ngày · ${latest.people} người`}
              </p>
            </div>
            <Icon name="arrow" />
          </Link>
        </section>
      )}
    </div>
  );
}
