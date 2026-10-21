import type { FormErrors, TripFormValues } from '@goease/trip-client/create-trip-controller';
import {
  POPULAR_DESTINATIONS,
  getDestination,
  type Destination,
  type DestinationSearchResponse,
} from '@goease/contracts';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/icon';
import { offlineDev } from '../../platform/dev-mode';

export interface DestinationPickerProps {
  values: TripFormValues;
  onChange: (values: TripFormValues) => void;
  errors: FormErrors;
  disabled?: boolean;
  searchDestinations: (query: string, signal: AbortSignal) => Promise<DestinationSearchResponse>;
  onSearchBusyChange: (busy: boolean) => void;
}
export function DestinationPicker({
  values,
  onChange,
  errors,
  disabled,
  searchDestinations,
  onSearchBusyChange,
}: DestinationPickerProps) {
  const [choosing, setChoosing] = useState(!values.destinationId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Destination[] | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searching, setSearching] = useState(false),
    [searchMessage, setSearchMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      onSearchBusyChange(false);
    },
    [onSearchBusyChange],
  );
  const selected = values.destination ?? getDestination(values.destinationId ?? 'da-lat');
  const destinations = results ?? (query.trim() ? [] : POPULAR_DESTINATIONS);
  function stopSearch() {
    request.current?.abort();
    request.current = null;
    setSearching(false);
    onSearchBusyChange(false);
  }
  async function search() {
    const q = query.trim();
    if (searching || disabled) return;
    if (q.length < 2 || q.length > 120) {
      setSearchMessage('Nhập tên nơi muốn đến từ 2 đến 120 ký tự.');
      return;
    }
    const current = new AbortController();
    request.current = current;
    setSearching(true);
    onSearchBusyChange(true);
    setResults(null);
    setSearchMessage('');
    try {
      const response = await searchDestinations(q, current.signal);
      if (!current.signal.aborted && request.current === current) {
        setResults(response.destinations);
        setSubmittedQuery(q);
        setSearchMessage(
          response.destinations.length
            ? 'Chọn đúng điểm đến bên dưới. Địa chỉ giúp phân biệt những nơi trùng tên.'
            : 'Chưa tìm thấy điểm đến tại Việt Nam có tọa độ phù hợp. Thử thêm tỉnh hoặc vùng vào tên.',
        );
      }
    } catch (error) {
      if (!current.signal.aborted && request.current === current)
        setSearchMessage(
          error instanceof Error ? error.message : 'Chưa tìm được điểm đến. Hãy thử lại.',
        );
    } finally {
      if (request.current === current) {
        request.current = null;
        setSearching(false);
        onSearchBusyChange(false);
      }
    }
  }
  return (
    <>
      <div>
        <span className="mb-2 block font-semibold text-muted">Điểm đến</span>
        <button
          type="button"
          aria-expanded={choosing}
          className="surface flex w-full items-center gap-3 p-4 text-left"
          onClick={() => setChoosing(!choosing)}
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-sand text-teal">
            <Icon name="pin" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-lg">{selected?.name ?? 'Chọn điểm đến'}</strong>
            <span className="block text-sm text-muted">{selected?.address || 'Việt Nam'}</span>
          </span>
          <Icon name="chevron" />
        </button>
      </div>
      <div
        hidden={!choosing && !errors.destinationId}
        className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-paper p-4"
      >
        <div className="col-span-full min-w-0">
          <label htmlFor="destination-search">Điểm đến</label>
          <div className="mt-2 flex min-w-0 gap-2">
            <input
              id="destination-search"
              aria-label="Tìm điểm đến"
              type="search"
              className="min-w-0 flex-1"
              placeholder="Địa phương hoặc địa danh bất kỳ tại Việt Nam"
              maxLength={120}
              value={query}
              aria-describedby="destination-search-help"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void search();
                }
              }}
              onChange={(event) => {
                stopSearch();
                setQuery(event.target.value);
                setResults(null);
                setSubmittedQuery('');
                setSearchMessage('');
                onChange({ ...values, destinationId: '', destination: undefined });
              }}
            />
            <button
              type="button"
              disabled={searching}
              onClick={() => void search()}
              className="shrink-0 rounded-2xl bg-teal px-4 text-sm font-semibold text-white"
            >
              {searching ? 'Đang tìm…' : 'Tìm điểm đến'}
            </button>
          </div>
          <p id="destination-search-help" className="mt-2 text-xs text-muted">
            {offlineDev
              ? 'Tìm trong các điểm đến có sẵn trên máy. Không truy vấn dịch vụ online.'
              : 'Tìm địa phương và địa danh trên khắp Việt Nam qua SerpApi / Google Maps. Bấm Tìm hoặc Enter để tra cứu.'}
          </p>
          <p className="mt-2 text-sm text-teal-dark">
            {selected
              ? `Đang chọn: ${selected.name}`
              : 'Chưa chọn điểm đến. Tìm rồi chọn một kết quả hoặc gợi ý phổ biến.'}
          </p>
          {selected && (
            <p className="mt-1 text-xs break-words text-muted">
              {selected.address ? `${selected.address} · ` : ''}Múi giờ: {selected.timeZone} · Ngân
              sách tính bằng VND
            </p>
          )}
          {errors.destinationId && <small className="text-error">{errors.destinationId}</small>}
          <p aria-live="polite" role="status" className="mt-2 text-sm text-muted">
            {searching ? 'Đang tìm điểm đến…' : searchMessage}
          </p>
          {searching && (
            <button
              type="button"
              onClick={stopSearch}
              className="mt-2 text-sm font-semibold text-teal underline"
            >
              Dừng tìm điểm đến
            </button>
          )}
        </div>
        <div
          className={`col-span-full ${results ? 'grid min-w-0 gap-2' : 'flex flex-wrap gap-2'}`}
          role="group"
          aria-label="Chọn điểm đến"
        >
          {!query.trim() && !results && (
            <p className="w-full text-xs text-muted">
              {offlineDev
                ? 'Điểm đến có sẵn · Lịch mẫu hiện có cho Đà Lạt'
                : 'Gợi ý phổ biến · Bạn có thể tìm nơi khác ở trên'}
            </p>
          )}
          {results && (
            <div className="mb-1">
              <h4 className="text-sm font-semibold text-teal-dark">
                Kết quả cho “{submittedQuery}”
              </h4>
              <p className="mt-1 text-xs text-muted">
                Tên và địa chỉ do nguồn bản đồ cung cấp. Chọn đúng nơi bạn muốn đến bên dưới; chưa
                có kết quả nào được tự động chọn.
              </p>
            </div>
          )}
          {destinations.map((destination) => (
            <button
              type="button"
              key={destination.id}
              aria-pressed={destination.id === selected?.id}
              onClick={() => {
                stopSearch();
                onChange({ ...values, destinationId: destination.id, destination });
                setSearchMessage('');
                setChoosing(false);
              }}
              className={`min-h-11 min-w-0 rounded-2xl border px-4 py-2 text-left text-sm font-semibold ${destination.id === selected?.id ? 'border-teal bg-mint text-teal-dark' : 'border-line bg-cream text-teal-dark'}`}
            >
              <span>{destination.name}</span>
              {results && (
                <span className="mt-1 block text-xs font-normal break-words">
                  {destination.address ||
                    `${destination.center.latitude.toFixed(4)}, ${destination.center.longitude.toFixed(4)}`}{' '}
                  · {destination.timeZone}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
