import type { Activity, Place } from '@goease/contracts';
import { Icon } from '../../components/icon';
import { activityPhotos } from './travel-photos';
import { TravelPhotoView } from './travel-photo';

export function ActivityThumbnail({
  activity,
  destinationId,
}: {
  activity: Activity;
  destinationId: string;
}) {
  return (
    <TravelPhotoView photos={activityPhotos(activity, destinationId)} className="activity-image" />
  );
}

export function ActivityDetails({ activity, places }: { activity: Activity; places: Place[] }) {
  const snapshot = activity.location.kind === 'discovered' ? activity.location.placeSnapshot : null;
  const catalogPlace =
    activity.location.kind === 'catalog'
      ? places.find(
          (place) => activity.location.kind === 'catalog' && place.id === activity.location.placeId,
        )
      : null;
  return (
    <details className="min-w-0 text-sm text-muted">
      <summary className="inline-flex items-center gap-2 font-medium">
        <Icon name="file" />
        Chi tiết <Icon name="chevron" width="16" />
      </summary>
      <div className="surface my-2 flex flex-col gap-2 p-4">
        <p className="font-semibold text-ink">{activity.name}</p>
        {snapshot && (
          <>
            <p>{snapshot.address || 'Chưa có địa chỉ từ nguồn.'}</p>
            <p>
              Thời lượng gợi ý: {snapshot.durationMinutes} phút
              {snapshot.rating !== null ? ` · Đánh giá ${snapshot.rating}/5` : ''}
            </p>
            <p>
              {snapshot.openingHours
                ? `Giờ do nguồn cung cấp: ${snapshot.openingHours}`
                : 'Chưa có dữ liệu giờ mở cửa.'}
            </p>
            <a
              className="text-action text-teal underline"
              href={snapshot.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Xem nguồn địa điểm ↗
            </a>
            <p>
              Dữ liệu ngày {new Date(snapshot.fetchedAt).toLocaleDateString('vi-VN')}. Kiểm tra lại
              trước khi đi.
            </p>
          </>
        )}
        {catalogPlace?.sources.map((source) => (
          <a
            key={source.url}
            className="text-action text-teal underline"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Nguồn GoEase · {source.accessedOn} ↗
          </a>
        ))}
        <p>
          Chi phí cả nhóm:{' '}
          {activity.costVnd === null
            ? 'Chưa rõ'
            : activity.costVnd === 0
              ? 'Miễn phí'
              : `${activity.costVnd.toLocaleString('vi-VN')} đ`}
        </p>
        {activity.notes && <p className="whitespace-pre-wrap">{activity.notes}</p>}
        <p>Giờ trong lịch là giờ gợi ý, chưa xác nhận giờ mở cửa.</p>
      </div>
    </details>
  );
}
