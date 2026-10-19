import { useState } from 'react';
import type { Activity, Place, Trip } from '@goease/contracts';
import {
  parseActivityForm,
  type ActivityForm,
  type ActivityErrors,
} from '@goease/trip-client/edit-trip-controller';
import { groupForm, parseGroupForm, type GroupErrors } from '@goease/trip-client/budget-controller';
import { Button, Notice } from '../../components/ui';

export function ActivityEditor({
  initial,
  id,
  places,
  disabled,
  onApply,
  onCancel,
}: {
  initial: ActivityForm;
  id: string;
  places: Place[];
  disabled: boolean;
  onApply: (activity: Activity) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial),
    [errors, setErrors] = useState<ActivityErrors>({});
  return (
    <form
      className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6"
      aria-label="Chỉnh sửa hoạt động"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = parseActivityForm(form, id, places);
        if (!parsed.ok) {
          setErrors(parsed.errors);
          return;
        }
        onApply(parsed.activity);
      }}
    >
      <h3>{initial.name ? 'Chỉnh sửa hoạt động' : 'Thêm hoạt động'}</h3>
      <fieldset disabled={disabled} className="grid grid-cols-2 gap-4">
        <label className="col-span-full">
          Loại hoạt động
          <select
            value={form.kind}
            onChange={(event) =>
              setForm({
                ...form,
                kind: event.target.value as ActivityForm['kind'],
              })
            }
          >
            <option value="custom">Tự nhập</option>
            <option value="catalog">Địa điểm trong danh mục</option>
          </select>
        </label>
        {form.kind === 'catalog' && (
          <label className="col-span-full">
            Địa điểm
            <select
              value={form.placeId}
              onChange={(event) => {
                const place = places.find((place) => place.id === event.target.value);
                setForm({
                  ...form,
                  placeId: event.target.value,
                  name: place?.name ?? form.name,
                  costVnd: '',
                });
              }}
            >
              <option value="">Chọn địa điểm</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="col-span-full">
          Tên hoạt động
          <input
            value={form.name}
            maxLength={120}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Giờ bắt đầu
          <input
            type="time"
            value={form.startTime}
            onChange={(event) => setForm({ ...form, startTime: event.target.value })}
          />
        </label>
        <label>
          Giờ kết thúc
          <input
            type="time"
            value={form.endTime}
            onChange={(event) => setForm({ ...form, endTime: event.target.value })}
          />
        </label>
        <label className="col-span-full">
          Chi phí cả nhóm (VND)
          <input
            aria-label="Chi phí cả nhóm (VND)"
            inputMode="numeric"
            value={form.costVnd}
            onChange={(event) => setForm({ ...form, costVnd: event.target.value })}
          />
          <small>Trống: chưa có giá · 0: miễn phí</small>
        </label>
        <label className="col-span-full">
          Ghi chú
          <textarea
            value={form.notes}
            maxLength={500}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </label>
      </fieldset>
      {Object.entries(errors).map(([key, message]) => (
        <Notice error key={key}>
          {message}
        </Notice>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled}>
          Áp dụng hoạt động
        </Button>
        <Button secondary disabled={disabled} onClick={onCancel}>
          Hủy form
        </Button>
      </div>
    </form>
  );
}
export function GroupEditor({
  trip,
  disabled,
  onApply,
  onCancel,
}: {
  trip: Trip;
  disabled: boolean;
  onApply: (trip: Trip) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() => groupForm(trip)),
    [errors, setErrors] = useState<GroupErrors>({});
  return (
    <form
      className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-paper p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = parseGroupForm(trip, form);
        if (!parsed.ok) {
          setErrors(parsed.errors);
          return;
        }
        onApply(parsed.trip);
      }}
    >
      <h3>Ngân sách & nhóm</h3>
      <label>
        Số người
        <input
          value={form.people}
          inputMode="numeric"
          disabled={disabled}
          onChange={(event) => setForm({ ...form, people: event.target.value })}
        />
      </label>
      <label>
        Ngân sách nhóm (VND)
        <input
          value={form.budgetVnd}
          inputMode="numeric"
          disabled={disabled}
          onChange={(event) => setForm({ ...form, budgetVnd: event.target.value })}
        />
      </label>
      {Object.entries(errors).map(([key, message]) => (
        <Notice error key={key}>
          {message}
        </Notice>
      ))}
      <small>Mỗi chi phí là tổng nhóm; thay số người không nhân lại chi phí đã nhập.</small>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled}>
          Áp dụng ngân sách
        </Button>
        <Button secondary disabled={disabled} onClick={onCancel}>
          Hủy form
        </Button>
      </div>
    </form>
  );
}
