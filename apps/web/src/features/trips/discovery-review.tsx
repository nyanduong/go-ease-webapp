import { useEffect, useId, useRef, useState } from 'react';
import type { DiscoveryPreviewResponse, Trip } from '@goease/contracts';
import { Button, dateLabel } from '../../components/ui';
import { Icon } from '../../components/icon';
import { MotionRegion } from '../../components/motion';
import { ActivityThumbnail } from './activity-details';

export function DiscoveryReview({
  preview,
  disabled,
  onBack,
  onReplace,
  onContinue,
}: {
  preview: DiscoveryPreviewResponse;
  disabled: boolean;
  onBack: () => void;
  onReplace: (activityId: string, placeId: string) => void;
  onContinue: (trip: Trip) => void;
}) {
  const [dayIndex, setDayIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const tabsId = useId();
  const { trip, budget, warnings, explanations } = preview.result;
  const day = trip.days[dayIndex] ?? trip.days[0];
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      aria-label="Xem trước lịch trình"
      className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-5"
    >
      <header>
        <button type="button" disabled={disabled} className="text-action mb-3" onClick={onBack}>
          <Icon name="back" /> Sửa thông tin chuyến
        </button>
        <p className="mb-2 text-xs font-medium text-teal">Chưa lưu vào tài khoản</p>
        <h1 ref={heading} tabIndex={-1} className="text-2xl outline-none sm:text-3xl">
          Gợi ý cho {preview.destination.name}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {dateLabel(trip.startDate)} · {trip.durationDays} ngày · {trip.people} người
        </p>
      </header>

      <details className="surface px-4 text-sm text-muted">
        <summary className="font-medium text-ink">
          Lưu ý & chi phí{' '}
          <span className="ml-1 text-xs font-normal text-muted">
            {budget.unknownCostCount > 0
              ? `· ${budget.unknownCostCount} hoạt động chưa có giá`
              : ''}
          </span>
        </summary>
        <div className="flex flex-col gap-3 pb-4">
          <p>
            Giờ tham quan và di chuyển là ước tính. Khoản chưa biết giá không được tính là miễn phí.
          </p>
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-cream p-3">
            <div>
              <dt className="text-xs">Ngân sách cả nhóm</dt>
              <dd className="mt-1 font-semibold text-ink">
                {trip.budgetVnd === null
                  ? 'Chưa đặt ngân sách'
                  : `${trip.budgetVnd.toLocaleString('vi-VN')} đ`}
              </dd>
            </div>
            <div>
              <dt className="text-xs">Chi phí đã biết</dt>
              <dd className="mt-1 font-semibold text-ink">
                {budget.knownCostVnd === 0 && budget.unknownCostCount > 0
                  ? 'Chưa có giá để ước tính'
                  : `${budget.knownCostVnd.toLocaleString('vi-VN')} đ`}
              </dd>
            </div>
          </dl>
          {!!warnings.length && (
            <ul className="list-disc space-y-2 pl-4">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          {!!explanations.length && (
            <details>
              <summary className="font-medium">Vì sao sắp xếp lịch như vậy?</summary>
              <ul className="list-disc space-y-2 pl-4">
                {explanations.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs">
            {preview.result.label} ·{' '}
            {preview.source === 'cache'
              ? 'Dữ liệu đã lưu tạm'
              : preview.source === 'catalog'
                ? 'Bộ địa điểm GoEase'
                : 'Nguồn địa điểm: SerpApi / Google Maps'}
          </p>
        </div>
      </details>

      <div
        role="tablist"
        aria-label="Ngày trong lịch gợi ý"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {trip.days.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${index}`}
            aria-controls={`${tabsId}-panel`}
            aria-selected={index === dayIndex}
            tabIndex={index === dayIndex ? 0 : -1}
            className={`min-h-12 shrink-0 rounded-xl border px-4 py-2 text-left text-sm ${index === dayIndex ? 'border-teal bg-mint font-semibold text-teal-dark' : 'border-line bg-paper text-muted'}`}
            onClick={() => setDayIndex(index)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? trip.days.length - 1
                    : (dayIndex + (event.key === 'ArrowRight' ? 1 : trip.days.length - 1)) %
                      trip.days.length;
              setDayIndex(next);
              document.getElementById(`${tabsId}-tab-${next}`)?.focus();
            }}
          >
            Ngày {index + 1}
            <span className="ml-2 text-xs font-normal">{dateLabel(item.date).slice(0, 5)}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${dayIndex}`}>
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>Giờ gợi ý</span>
          <span>{day.activities.length} hoạt động</span>
        </div>
        <MotionRegion motionKey={day.id}>
          <ol className="flex flex-col divide-y divide-line">
            {day.activities.map((activity) => (
              <li
                key={activity.id}
                className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-3 py-4"
              >
                <span className="pt-1 text-sm font-bold">{activity.startTime ?? '—'}</span>
                <div className="min-w-0">
                  <ActivityThumbnail activity={activity} destinationId={trip.destinationId} />
                  <h2 className="text-base leading-snug sm:text-lg">{activity.name}</h2>
                  {activity.location.kind === 'discovered' && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                      {activity.location.placeSnapshot.address || 'Chưa có địa chỉ'}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    {activity.costVnd === null
                      ? 'Chưa có giá'
                      : `${activity.costVnd.toLocaleString('vi-VN')} đ`}
                  </p>
                  {activity.location.kind === 'discovered' && preview.places.length > 1 && (
                    <details className="clear-both pt-1 text-sm text-muted">
                      <summary className="inline-flex items-center gap-1 font-normal">
                        Đổi địa điểm <Icon name="chevron" width="14" />
                      </summary>
                      <label className="mt-1 block">
                        <span className="sr-only">Thay địa điểm {activity.name}</span>
                        <select
                          disabled={disabled}
                          aria-label={`Thay địa điểm ${activity.name}`}
                          value={activity.location.placeId}
                          onChange={(event) => onReplace(activity.id, event.target.value)}
                        >
                          {preview.places.map((place) => (
                            <option key={place.id} value={place.id}>
                              {place.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </MotionRegion>
        {!day.activities.length && (
          <p className="surface p-5 text-sm text-muted">
            Chưa đủ địa điểm phù hợp cho ngày này. Bạn có thể bổ sung ở bước tiếp theo.
          </p>
        )}
      </div>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 -mx-1 border-t border-line bg-cream/95 px-1 py-3 backdrop-blur-sm lg:bottom-0">
        <Button className="w-full" disabled={disabled} onClick={() => onContinue(trip)}>
          Chỉnh sửa và lưu lịch này <Icon name="arrow" />
        </Button>
        <p className="mt-2 text-center text-xs text-muted">Bạn có thể chỉnh lại trước khi lưu.</p>
      </div>
    </section>
  );
}
