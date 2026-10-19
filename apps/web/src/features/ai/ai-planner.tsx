import { useEffect, useState } from 'react';
import { getDalatCatalog } from '@goease/catalog';
import { todayAtDestination, type Trip } from '@goease/contracts';
import { createAiTripFlow } from '@goease/trip-client/ai-trip-controller';
import { callDemoApi } from '@goease/trip-client/demo-api-controller';
import { validateTripForm, type TripFormValues } from '@goease/trip-client/create-trip-controller';
import { Button, Notice } from '../../components/ui';
import { useLeaveGuard } from '../../app/router';
import { guestTrips } from '../trips/guest-store';

export function AiPlanner({
  form,
  target,
  disabled = false,
  onApply,
  onSaved,
  onLocked,
  onBusy,
}: {
  form?: TripFormValues;
  target?: Trip;
  disabled?: boolean;
  onApply?: (trip: Trip) => void;
  onSaved?: (id: string) => void;
  onLocked?: (value: boolean) => void;
  onBusy?: (value: boolean) => void;
}) {
  const enabled = import.meta.env.VITE_AI_DEMO_ENABLED === 'true';
  const [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [, update] = useState(0);
  const [flow] = useState(() =>
    createAiTripFlow({
      store: guestTrips,
      getCatalog: getDalatCatalog,
      newId: () => crypto.randomUUID(),
      now: () => new Date(),
      request: async (input, signal, token) =>
        (
          await callDemoApi(import.meta.env.VITE_AI_API_BASE_URL, token, 'ai', {
            input,
            signal,
          })
        ).data,
    }),
  );
  const preview = flow.preview();
  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);
  useLeaveGuard(!!preview, busy);
  useEffect(() => {
    onLocked?.(!!preview);
  }, [preview, onLocked]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        flow.cancelRequest();
        setCode('');
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      flow.cancelRequest();
      flow.discard();
    };
  }, [flow]);
  if (!enabled || (!form && !target)) return null;
  const validation = form
    ? validateTripForm(form, todayAtDestination(new Date()))
    : target
      ? {
          ok: true as const,
          input: {
            name: target.name,
            destinationId: target.destinationId,
            startDate: target.startDate,
            durationDays: target.durationDays,
            people: target.people,
            budgetVnd: target.budgetVnd,
          },
        }
      : null;
  async function work(action: () => Promise<{ ok: boolean; message: string; tripId?: string }>) {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const result = await action();
      setMessage(result.message);
      update((value) => value + 1);
      if (result.ok && result.tripId) onSaved?.(result.tripId);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
      <summary>Gợi ý bằng Gemini · Phiên nội bộ</summary>
      <div className="flex min-w-0 flex-col gap-5">
        <p>
          Mỗi lần gọi dùng một lượt quota. Xem trước rồi lưu hoặc áp dụng vào bản nháp. Không tự gọi
          lại khi lỗi.
        </p>
        <label>
          Mã phiên AI nội bộ
          <input
            type="password"
            autoComplete="off"
            value={code}
            maxLength={64}
            disabled={busy || disabled}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <Button
          secondary
          disabled={busy || disabled || !validation?.ok}
          onClick={() => {
            if (
              validation?.ok &&
              window.confirm(
                'Gọi Gemini một lần? Nhu cầu sẽ được gửi tới backend HTTPS của nhóm và dùng một lượt quota.',
              )
            )
              void work(() => flow.generate(validation.input, code.trim(), target ?? null, true));
          }}
        >
          {busy ? 'Đang xử lý…' : preview ? 'Gợi ý lại' : 'Đề xuất lịch trình'}
        </Button>
        {busy && (
          <Button secondary onClick={() => flow.cancelRequest()}>
            Hủy gọi AI
          </Button>
        )}
        {message && <Notice>{message}</Notice>}
        {preview && (
          <>
            <h3>{preview.label}</h3>
            {preview.trip.days.map((day) => (
              <div key={day.id}>
                <b>{day.date}</b>
                {day.activities.map((activity) => (
                  <p key={activity.id}>
                    {activity.startTime} – {activity.endTime} · {activity.name}
                  </p>
                ))}
              </div>
            ))}
            {preview.warnings.map((warning, index) => (
              <small key={index}>{warning}</small>
            ))}
            {target ? (
              <Button
                disabled={busy || disabled}
                onClick={() => {
                  if (
                    !window.confirm('Thay toàn bộ lịch trình trong bản nháp bằng đề xuất AI này?')
                  )
                    return;
                  try {
                    onApply?.(flow.applyExisting(target, true));
                    flow.discard();
                    update((value) => value + 1);
                  } catch {
                    setMessage('Bản nháp đã đổi. Hãy kiểm tra trước khi áp dụng lại.');
                  }
                }}
              >
                Áp dụng vào bản nháp
              </Button>
            ) : (
              <>
                <Button
                  disabled={busy || disabled}
                  onClick={() => {
                    void work(() => flow.saveNew());
                  }}
                >
                  Lưu chuyến AI / thử lưu lại
                </Button>
                <Button
                  secondary
                  disabled={busy || disabled}
                  onClick={() => {
                    try {
                      const id = flow.stageNew();
                      onSaved?.(id);
                    } catch {
                      setMessage('Có bản nháp khác chưa xử lý.');
                    }
                  }}
                >
                  Sửa trước khi lưu
                </Button>
              </>
            )}
            <Button
              secondary
              disabled={busy}
              onClick={() => {
                if (window.confirm('Bỏ đề xuất AI đang xem?') && flow.discard()) {
                  update((value) => value + 1);
                  setMessage('Đã bỏ đề xuất.');
                }
              }}
            >
              Bỏ đề xuất AI
            </Button>
          </>
        )}
      </div>
    </details>
  );
}
