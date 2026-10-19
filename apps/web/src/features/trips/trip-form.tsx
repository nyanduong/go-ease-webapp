import type { FormErrors, TripFormValues } from '@goease/trip-client/create-trip-controller';

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
  const fields: {
    key: keyof TripFormValues;
    label: string;
    type?: string;
    hint?: string;
  }[] = [
    { key: 'name', label: 'Tên chuyến đi', hint: 'Ví dụ: Đà Lạt cùng bạn' },
    { key: 'startDate', label: 'Ngày bắt đầu', type: 'date' },
    { key: 'durationDays', label: 'Số ngày', hint: '1–5 ngày' },
    { key: 'people', label: 'Số người', hint: '1–20 người' },
    {
      key: 'budgetVnd',
      label: 'Ngân sách nhóm (VND)',
      hint: 'Tùy chọn · Tổng cả nhóm, nhập số không có dấu phân cách',
    },
  ];
  return (
    <fieldset disabled={disabled} className="grid grid-cols-2 gap-4">
      <label className="col-span-full">
        Điểm đến
        <input value="Đà Lạt" readOnly />
        <small>Điểm đến trong bản demo hiện tại</small>
      </label>
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
