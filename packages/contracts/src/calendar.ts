import { z } from 'zod';

export const DESTINATION = Object.freeze({
  id: 'da-lat', name: 'Đà Lạt', timeZone: 'Asia/Ho_Chi_Minh', currency: 'VND',
} as const);

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validDate(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth(year, month);
}

export const calendarDateSchema = z.string().refine(validDate, 'Ngày không hợp lệ (2000–2100, YYYY-MM-DD)');
export type CalendarDate = z.infer<typeof calendarDateSchema>;
export const clockTimeSchema = z.string().length(5).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:mm');

/** Calendar arithmetic, independent of the device time zone and DST. */
export function addCalendarDays(value: string, offset: number): CalendarDate {
  calendarDateSchema.parse(value);
  z.number().int().min(0).max(4).parse(offset);
  let year = Number(value.slice(0, 4));
  let month = Number(value.slice(5, 7));
  let day = Number(value.slice(8, 10));
  for (let i = 0; i < offset; i++) {
    day++;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month++;
      if (month > 12) { month = 1; year++; }
    }
  }
  return calendarDateSchema.parse(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

/** Caller supplies an instant; no device-local or UTC date truncation. */
export function todayAtDestination(instant: Date): CalendarDate {
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Instant không hợp lệ');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DESTINATION.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return calendarDateSchema.parse(`${part('year')}-${part('month')}-${part('day')}`);
}
