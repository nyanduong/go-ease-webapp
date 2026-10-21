import { useState } from 'react';
import { getDalatCatalog } from '@goease/catalog';
import { todayAtDestination } from '@goease/contracts';
import { generateSampleTrip } from '@goease/itinerary';
import { Link } from '../../app/router';
import { Notice } from '../../components/ui';
import { TripView } from './trip-view';

// A public, read-only example. It never enters the user's trip store or calls discovery.
export function SampleTrip() {
  const [catalog] = useState(getDalatCatalog);
  const [sample] = useState(() => {
    const today = todayAtDestination(new Date());
    return generateSampleTrip(
      {
        destinationId: 'da-lat',
        name: 'Đà Lạt cuối tuần',
        startDate: today,
        durationDays: 2,
        people: 2,
        budgetVnd: null,
      },
      catalog,
      { today, tripId: 'public-sample' },
    );
  });
  if (!sample.ok)
    return (
      <Notice error>
        Chưa mở được chuyến mẫu. <Link href="/">Về trang chủ</Link>
      </Notice>
    );
  return (
    <div className="flex flex-col gap-5">
      <Notice>
        LỊCH TRÌNH MẪU · Dữ liệu tham khảo từ catalog GoEase, chưa phải chuyến của bạn. Giá và giờ
        cần kiểm tra trước khi đi.
      </Notice>
      <TripView
        trip={sample.trip}
        editing={false}
        readOnly
        places={catalog.map(({ id, name, destinationId, coordinates, sources }) => ({
          id,
          name,
          destinationId,
          coordinates,
          sources,
        }))}
        onChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
      <Link href="/trips/new?destination=da-lat" className="primary-link">
        Tạo chuyến đi của bạn →
      </Link>
    </div>
  );
}
