import type { DiscoveryPlace, Place } from '@goease/contracts';
import type { ActivityErrors, ActivityForm } from '@goease/trip-client/edit-trip-controller';
import { notesAfterPlaceChange } from '@goease/trip-client/edit-trip-controller';
import type { GroupErrors, GroupForm } from '@goease/trip-client/budget-controller';
import { Button } from '../../components/ui';

export function ActivityFields({
  value,
  onChange,
  errors = {},
  places,
  discoveredPlaces = [],
  disabled,
  onClose,
}: {
  value: ActivityForm;
  onChange: (value: ActivityForm) => void;
  errors?: ActivityErrors;
  places: Place[];
  discoveredPlaces?: DiscoveryPlace[];
  disabled: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border border-teal/20 bg-mint/30 p-4"
      aria-label="Chỉnh sửa hoạt động"
    >
      <fieldset disabled={disabled} className="grid grid-cols-2 gap-4">
        <label className="col-span-full">
          Loại hoạt động
          <select
            value={value.kind}
            onChange={(event) =>
              onChange({
                ...value,
                kind: event.target.value as ActivityForm['kind'],
                placeId: '',
                placeSnapshot: undefined,
              })
            }
          >
            <option value="custom">Tự nhập</option>
            <option value="catalog">Địa điểm gợi ý</option>
            {!!discoveredPlaces.length && (
              <option value="discovered">Địa điểm đã tìm cho chuyến</option>
            )}
          </select>
        </label>
        {value.kind === 'catalog' && (
          <label className="col-span-full">
            Địa điểm
            <select
              value={value.placeId}
              onChange={(event) =>
                onChange({
                  ...value,
                  placeId: event.target.value,
                  name: places.find((place) => place.id === event.target.value)?.name ?? value.name,
                  costVnd: '',
                  notes: notesAfterPlaceChange(value.notes),
                })
              }
            >
              <option value="">Chọn địa điểm</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
            {errors.placeId && <small className="text-error">{errors.placeId}</small>}
          </label>
        )}
        {value.kind === 'discovered' && (
          <label className="col-span-full">
            Địa điểm đã tìm
            <select
              aria-label="Địa điểm đã tìm"
              value={value.placeId}
              onChange={(event) => {
                const place = discoveredPlaces.find((item) => item.id === event.target.value);
                onChange({
                  ...value,
                  placeId: place?.id ?? '',
                  placeSnapshot: place,
                  name: place?.name ?? value.name,
                  costVnd: '',
                  notes: notesAfterPlaceChange(value.notes),
                });
              }}
            >
              <option value="">Chọn địa điểm</option>
              {discoveredPlaces.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
            {value.placeSnapshot && (
              <small>
                {value.placeSnapshot.address} · Thời lượng tham quan ước tính{' '}
                {value.placeSnapshot.durationMinutes} phút
              </small>
            )}
            <small>
              Khi thay địa điểm, giờ trong lịch được giữ nguyên. Kiểm tra lại thời lượng tham quan
              và di chuyển trước khi lưu.
            </small>
            {errors.placeId && <small className="text-error">{errors.placeId}</small>}
          </label>
        )}
        <label className="col-span-full">
          Tên hoạt động
          <input
            value={value.name}
            readOnly={value.kind === 'discovered'}
            maxLength={120}
            aria-invalid={!!errors.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
          {errors.name && <small className="text-error">{errors.name}</small>}
        </label>
        <label>
          Giờ bắt đầu
          <input
            type="time"
            value={value.startTime}
            aria-invalid={!!errors.startTime}
            onChange={(event) => onChange({ ...value, startTime: event.target.value })}
          />
          {errors.startTime && <small className="text-error">{errors.startTime}</small>}
        </label>
        <label>
          Giờ kết thúc
          <input
            type="time"
            value={value.endTime}
            aria-invalid={!!errors.endTime}
            onChange={(event) => onChange({ ...value, endTime: event.target.value })}
          />
          {errors.endTime && <small className="text-error">{errors.endTime}</small>}
        </label>
        <label className="col-span-full">
          Chi phí cả nhóm (VND)
          <input
            aria-label="Chi phí cả nhóm (VND)"
            inputMode="numeric"
            value={value.costVnd}
            aria-invalid={!!errors.costVnd}
            onChange={(event) => onChange({ ...value, costVnd: event.target.value })}
          />
          <small className={errors.costVnd ? 'text-error' : ''}>
            {errors.costVnd ?? 'Để trống nếu chưa biết giá · Nhập 0 nếu miễn phí'}
          </small>
        </label>
        <label className="col-span-full">
          Ghi chú
          <textarea
            aria-label="Ghi chú"
            value={value.notes}
            maxLength={500}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
          />
          {errors.notes && <small className="text-error">{errors.notes}</small>}
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button secondary disabled={disabled} onClick={onClose}>
          Thu gọn chỉnh sửa
        </Button>
      </div>
    </div>
  );
}
export function GroupFields({
  value,
  onChange,
  errors = {},
  disabled,
}: {
  value: GroupForm;
  onChange: (value: GroupForm) => void;
  errors?: GroupErrors;
  disabled: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="grid gap-4 rounded-2xl border border-teal/20 bg-mint/30 p-5 sm:grid-cols-2"
      aria-label="Ngân sách và số người"
    >
      <label>
        Số người
        <input
          inputMode="numeric"
          value={value.people}
          aria-invalid={!!errors.people}
          onChange={(event) => onChange({ ...value, people: event.target.value })}
        />
        {errors.people && <small className="text-error">{errors.people}</small>}
      </label>
      <label>
        Ngân sách nhóm (VND)
        <input
          inputMode="numeric"
          value={value.budgetVnd}
          aria-invalid={!!errors.budgetVnd}
          onChange={(event) => onChange({ ...value, budgetVnd: event.target.value })}
        />
        {errors.budgetVnd && <small className="text-error">{errors.budgetVnd}</small>}
      </label>
      <small className="sm:col-span-2">
        Ngân sách cho cả nhóm. Có thể để trống nếu chưa quyết định.
      </small>
    </fieldset>
  );
}
