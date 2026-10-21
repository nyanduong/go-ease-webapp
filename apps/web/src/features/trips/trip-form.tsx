import type { TripFormField } from '@goease/trip-client/create-trip-controller';
import { Icon } from '../../components/icon';
import type { ReactNode } from 'react';
import { DestinationPicker, type DestinationPickerProps } from './destination-picker';

export function TripForm({
  values,
  onChange,
  errors,
  disabled = false,
  searchDestinations,
  onSearchBusyChange,
  options,
  pace,
  onPace,
}: DestinationPickerProps & {
  options?: ReactNode;
  pace: 'relaxed' | 'balanced' | 'active';
  onPace: (value: 'relaxed' | 'balanced' | 'active') => void;
}) {
  const fields: {
    key: TripFormField;
    label: string;
    type?: string;
    hint?: string;
  }[] = [
    { key: 'name', label: 'Tên chuyến đi', hint: 'Ví dụ: Cuối tuần cùng bạn' },
    { key: 'startDate', label: 'Ngày bắt đầu', type: 'date' },
    { key: 'durationDays', label: 'Số ngày', hint: '1–5 ngày' },
    { key: 'people', label: 'Số người', hint: '1–20 người' },
    {
      key: 'budgetVnd',
      label: 'Ngân sách cả nhóm (VND)',
      hint: 'Không bắt buộc · Tổng cho cả nhóm, không phải mỗi người. Để trống nếu chưa quyết định.',
    },
  ];
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-6">
      <DestinationPicker
        values={values}
        onChange={onChange}
        errors={errors}
        disabled={disabled}
        searchDestinations={searchDestinations}
        onSearchBusyChange={onSearchBusyChange}
      />
      <div className="grid grid-cols-2 gap-4">
        {fields
          .filter(({ key }) => key === 'startDate' || key === 'durationDays')
          .map(({ key, label, type, hint }) => (
            <label key={key}>
              {label}
              <input
                aria-label={label}
                type={type ?? 'text'}
                inputMode={key === 'durationDays' ? 'numeric' : undefined}
                value={values[key]}
                aria-invalid={!!errors[key]}
                aria-describedby={errors[key] ? `error-${key}` : undefined}
                onChange={(event) => onChange({ ...values, [key]: event.target.value })}
              />
              {errors[key] ? (
                <small id={`error-${key}`} className="text-error">
                  {errors[key]}
                </small>
              ) : (
                hint && <small>{hint}</small>
              )}
            </label>
          ))}
      </div>
      <label>
        Số người
        <div className="surface flex items-center justify-between gap-3 p-2">
          <button
            type="button"
            aria-label="Giảm số người"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-xl"
            disabled={Number(values.people) <= 1}
            onClick={() =>
              onChange({ ...values, people: String(Math.max(1, Number(values.people) - 1)) })
            }
          >
            −
          </button>
          <input
            aria-label="Số người"
            inputMode="numeric"
            className="max-w-32 border-0 text-center font-semibold"
            value={values.people}
            aria-invalid={!!errors.people}
            onChange={(event) => onChange({ ...values, people: event.target.value })}
          />
          <button
            type="button"
            aria-label="Tăng số người"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-teal/30 bg-mint text-teal"
            disabled={Number(values.people) >= 20}
            onClick={() =>
              onChange({ ...values, people: String(Math.min(20, Number(values.people) + 1)) })
            }
          >
            <Icon name="plus" />
          </button>
        </div>
        {errors.people && <small className="text-error">{errors.people}</small>}
      </label>
      <fieldset>
        <legend className="mb-3 text-xl font-bold">Bạn thích đi thế nào?</legend>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Nhịp chuyến đi">
          {(
            [
              ['relaxed', 'Thong thả', 'compass'],
              ['balanced', 'Vừa phải', 'walk'],
              ['active', 'Đi nhiều nơi', 'pin'],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              type="button"
              key={id}
              aria-pressed={pace === id}
              onClick={() => onPace(id)}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-paper px-1 py-3 text-sm aria-pressed:border-teal aria-pressed:bg-mint aria-pressed:font-semibold aria-pressed:text-teal-dark"
            >
              <Icon name={pace === id ? 'check' : icon} />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">
          {pace === 'relaxed'
            ? 'Tối đa 2 điểm/ngày, dành nhiều thời gian nghỉ.'
            : pace === 'balanced'
              ? 'Tối đa 3 điểm/ngày, cân bằng khám phá và nghỉ ngơi.'
              : 'Tối đa 4 điểm/ngày, phù hợp khi bạn thích khám phá.'}{' '}
          Còn tùy giờ mở cửa và thời lượng tham quan.
        </p>
      </fieldset>
      <label>
        Tên chuyến đi
        <input
          aria-label="Tên chuyến đi"
          value={values.name}
          maxLength={80}
          aria-invalid={!!errors.name}
          onChange={(event) => onChange({ ...values, name: event.target.value })}
        />
        {errors.name && <small className="text-error">{errors.name}</small>}
      </label>
      <details className="surface p-4" open={!!errors.budgetVnd || undefined}>
        <summary className="flex items-center gap-3">
          <Icon name="plus" />
          Thêm ngân sách, sở thích
        </summary>
        <div className="mt-4 flex flex-col gap-5">
          {fields
            .filter(({ key }) => key === 'budgetVnd')
            .map(({ key, label, hint }) => (
              <label key={key}>
                {label}
                <input
                  aria-label={label}
                  inputMode={key === 'budgetVnd' ? 'numeric' : undefined}
                  maxLength={key === 'name' ? 80 : 30}
                  value={values[key]}
                  aria-invalid={!!errors[key]}
                  onChange={(event) => onChange({ ...values, [key]: event.target.value })}
                />
                <small className={errors[key] ? 'text-error' : ''}>{errors[key] ?? hint}</small>
              </label>
            ))}
          {options}
        </div>
      </details>
    </fieldset>
  );
}
