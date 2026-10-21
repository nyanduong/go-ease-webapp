import { useState } from 'react';
import type { Activity, Place } from '@goease/contracts';
import { Icon } from '../../components/icon';

export function ActivityThumbnail({ activity }: { activity: Activity }) {
  const [failed, setFailed] = useState(false);
  const photo =
    activity.location.kind === 'discovered'
      ? activity.location.placeSnapshot.thumbnailUrl
      : undefined;
  if (!photo || failed)
    return (
      <span
        className="activity-image flex! items-center justify-center bg-sand text-muted"
        role="img"
        aria-label="Chưa có ảnh địa điểm"
        title="Chưa có ảnh địa điểm"
      >
        <Icon name="pin" width="28" height="28" />
      </span>
    );
  return (
    <img
      className="activity-image"
      src={photo}
      alt={activity.name}
      width="160"
      height="112"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
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
