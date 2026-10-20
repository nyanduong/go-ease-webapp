import type { FormErrors, TripFormValues } from '@goease/trip-client/create-trip-controller';
import { DESTINATIONS, getDestination } from '@goease/contracts';
import { useState } from 'react';

export function TripForm({
  values,
  onChange,
  errors,
  disabled = false,
}: {
  values: TripFormValues;
  onChange: (values: TripFormValues) => void;
  errors: FormErrors;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const selected = getDestination(values.destinationId ?? 'da-lat');
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd');
  const destinations = DESTINATIONS.filter((destination) =>
    normalize(destination.name).includes(normalize(query)),
  );
  const fields: {
    key: keyof TripFormValues;
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
      label: 'Ngân sách nhóm (VND)',
      hint: 'Không bắt buộc · Ví dụ: 5000000',
    },
  ];
  return (
    <fieldset disabled={disabled} className="grid grid-cols-2 gap-4">
      <label className="col-span-full">
        Điểm đến
        <input
          aria-label="Tìm điểm đến"
          type="search"
          placeholder="Tìm thành phố, ví dụ: Đà Nẵng"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <small>Đang chọn: {selected?.name ?? 'Chưa chọn điểm đến'} · Việt Nam</small>
        {errors.destinationId && <small className="text-error">{errors.destinationId}</small>}
      </label>
      <div className="col-span-full flex flex-wrap gap-2" role="group" aria-label="Chọn điểm đến">
        {destinations.map((destination) => (
          <button
            type="button"
            key={destination.id}
            aria-pressed={
              destination.id === values.destinationId ||
              (!values.destinationId && destination.id === 'da-lat')
            }
            onClick={() => {
              onChange({ ...values, destinationId: destination.id });
              setQuery('');
            }}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold ${destination.id === selected?.id ? 'border-teal bg-teal text-white' : 'border-line bg-cream text-teal-dark'}`}
          >
            {destination.name}
          </button>
        ))}
        {!destinations.length && (
          <p className="text-sm text-muted">Chưa có thành phố phù hợp trong danh sách hiện tại.</p>
        )}
      </div>
      {fields.map(({ key, label, type, hint }) => (
        <label
          className={key === 'durationDays' || key === 'people' ? '' : 'col-span-full'}
          key={key}
        >
          {label}
          <input
            aria-label={label}
            type={type ?? 'text'}
            inputMode={key !== 'name' && key !== 'startDate' ? 'numeric' : undefined}
            value={values[key]}
            maxLength={key === 'name' ? 80 : 30}
            aria-invalid={!!errors[key]}
            aria-describedby={errors[key] ? `error-${key}` : undefined}
            onChange={(event) => onChange({ ...values, [key]: event.target.value })}
          />
          {errors[key] ? (
            <small className="text-sm text-error" id={`error-${key}`}>
              {errors[key]}
            </small>
          ) : (
            hint && <small>{hint}</small>
          )}
        </label>
      ))}
    </fieldset>
  );
}
