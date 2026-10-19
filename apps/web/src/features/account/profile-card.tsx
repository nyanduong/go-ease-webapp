import { useState, type FormEvent } from 'react';
import {
  PROFILE_AVATARS,
  validateProfile,
  type AccountProfile,
  type ProfileInput,
} from '@goease/trip-client/account-profile';
import { Button, Notice } from '../../components/ui';
import { useLeaveGuard } from '../../app/router';

function Avatar({ profile, small = false }: { profile: AccountProfile; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const preset = PROFILE_AVATARS.find((item) => item.id === profile.avatar);
  const initials = profile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-paper bg-mint font-bold text-teal-dark shadow-sm ${small ? 'size-12 text-lg' : 'size-28 text-3xl sm:size-32'}`}
    >
      {profile.avatar === 'google' && profile.googleAvatarUrl && !failed ? (
        <img
          key={profile.googleAvatarUrl}
          src={profile.googleAvatarUrl}
          alt="Ảnh đại diện của bạn"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label="Ảnh đại diện">{preset?.icon ?? initials}</span>
      )}
    </span>
  );
}
export function ProfileCard({
  profile,
  busy,
  error,
  save,
  reload,
}: {
  profile: AccountProfile;
  busy: boolean;
  error: string;
  save: (input: ProfileInput) => Promise<boolean>;
  reload: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<ProfileInput>(profile),
    [validation, setValidation] = useState(''),
    [saved, setSaved] = useState(false);
  const dirty =
    editing &&
    (draft.displayName !== profile.displayName ||
      draft.bio !== profile.bio ||
      draft.avatar !== profile.avatar);
  useLeaveGuard(dirty, busy);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setValidation('');
    setSaved(false);
    try {
      const input = validateProfile(draft);
      if (await save(input)) {
        setDraft(input);
        setEditing(false);
        setSaved(true);
      }
    } catch (error) {
      setValidation(error instanceof Error ? error.message : 'Kiểm tra lại thông tin hồ sơ.');
    }
  }
  return (
    <section
      className="overflow-hidden rounded-3xl border border-line bg-paper shadow-sm"
      aria-label="Hồ sơ cá nhân"
    >
      <div className="relative h-28 overflow-hidden bg-teal-dark sm:h-36">
        <span
          aria-hidden="true"
          className="absolute -top-20 right-4 size-64 rounded-full border-[28px] border-white/10"
        />
        <span
          aria-hidden="true"
          className="absolute top-14 right-40 size-48 rounded-full bg-orange/30"
        />
        <p className="absolute top-6 left-6 text-xs font-bold tracking-widest text-white/80 uppercase sm:left-8">
          Đi cùng nhau, khám phá nhiều hơn.
        </p>
      </div>
      <div className="px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="relative -mt-12 flex flex-wrap items-end justify-between gap-4">
          <Avatar
            key={(editing ? draft.avatar : profile.avatar) + (profile.googleAvatarUrl ?? '')}
            profile={{ ...profile, ...(editing ? draft : {}) }}
          />
          {!editing && (
            <Button
              secondary
              disabled={busy}
              onClick={() => {
                setDraft(profile);
                setEditing(true);
                setSaved(false);
              }}
            >
              Chỉnh sửa hồ sơ
            </Button>
          )}
        </div>
        {!editing ? (
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl break-words sm:text-3xl">{profile.displayName}</h2>
              <span className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal-dark">
                Google · Đã kết nối
              </span>
            </div>
            <p className="text-sm break-all text-muted">
              {profile.email ?? 'Chưa có email hiển thị'}
            </p>
            <p className="max-w-xl break-words whitespace-pre-wrap text-muted">
              {profile.bio || 'Thêm một vài dòng về bạn và những hành trình bạn yêu thích.'}
            </p>
            {saved && (
              <p role="status" className="text-sm font-bold text-teal-dark">
                Đã lưu hồ sơ của bạn.
              </p>
            )}
          </div>
        ) : (
          <form
            className="mt-6 flex flex-col gap-6"
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <fieldset disabled={busy} className="flex flex-col gap-4">
              <legend className="mb-3 text-sm font-bold text-teal-dark">Ảnh đại diện</legend>
              <div className="flex flex-wrap gap-3">
                <label className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="avatar"
                    value="google"
                    checked={draft.avatar === 'google'}
                    onChange={() => setDraft({ ...draft, avatar: 'google' })}
                    className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                    aria-label="Ảnh Google"
                  />
                  <span className="flex min-h-16 items-center gap-2 rounded-2xl border border-line p-2 peer-checked:border-teal peer-checked:bg-mint peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal">
                    <Avatar small profile={{ ...profile, avatar: 'google' }} />
                    <span className="pr-2 text-xs font-bold">Google</span>
                  </span>
                </label>
                {PROFILE_AVATARS.map((avatar) => (
                  <label key={avatar.id} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="avatar"
                      value={avatar.id}
                      checked={draft.avatar === avatar.id}
                      onChange={() => setDraft({ ...draft, avatar: avatar.id })}
                      className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                      aria-label={avatar.label}
                    />
                    <span
                      aria-hidden="true"
                      className="flex size-16 items-center justify-center rounded-2xl border border-line text-3xl peer-checked:border-teal peer-checked:bg-mint peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal"
                    >
                      {avatar.icon}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-2 text-sm font-bold">
                Tên hiển thị
                <input
                  name="displayName"
                  autoComplete="nickname"
                  maxLength={80}
                  required
                  value={draft.displayName}
                  onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                  disabled={busy}
                  className="min-h-12 w-full rounded-2xl border border-line bg-cream px-4 font-normal text-teal-dark focus:outline-2 focus:outline-teal"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-2 text-sm font-bold">
                Email Google
                <input
                  type="email"
                  aria-label="Email Google"
                  value={profile.email ?? ''}
                  readOnly
                  className="min-h-12 w-full rounded-2xl border border-line bg-cream px-4 font-normal text-muted"
                />
                <span className="text-xs font-normal text-muted">
                  Email được liên kết với tài khoản Google.
                </span>
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm font-bold">
              Giới thiệu ngắn
              <textarea
                name="bio"
                aria-label="Giới thiệu ngắn"
                maxLength={160}
                rows={3}
                value={draft.bio}
                onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
                disabled={busy}
                placeholder="Ví dụ: Thích cà phê, săn mây và những chuyến đi cùng bạn bè."
                className="w-full resize-y rounded-2xl border border-line bg-cream p-4 font-normal text-teal-dark focus:outline-2 focus:outline-teal"
              />
              <span className="self-end text-xs font-normal text-muted">
                {draft.bio.length}/160
              </span>
            </label>
            {validation && <Notice error>{validation}</Notice>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu hồ sơ…' : 'Lưu hồ sơ'}
              </Button>
              <Button
                secondary
                disabled={busy}
                onClick={() => {
                  setDraft(profile);
                  setEditing(false);
                  setValidation('');
                }}
              >
                Hủy chỉnh sửa
              </Button>
            </div>
          </form>
        )}
        {error && (
          <div className="mt-5">
            <Notice error>
              {error}
              <Button
                secondary
                disabled={busy}
                onClick={() => {
                  void reload();
                }}
              >
                Tải lại hồ sơ để đối chiếu
              </Button>
            </Notice>
          </div>
        )}
      </div>
    </section>
  );
}
