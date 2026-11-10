import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  validateProfile,
  type AccountProfile,
  type ProfileInput,
} from '@goease/trip-client/account-profile';
import { Button, Notice } from '../../components/ui';
import { useLeaveGuard } from '../../app/router';
import { ProfileAvatarImage as Avatar } from './profile-avatar';
import { prepareProfileImage } from './profile-upload';
import { accountSession } from './session';

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
  const [uploading, setUploading] = useState(false);
  const uploadController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadController.current?.abort();
    };
  }, []);
  const locked = busy || uploading;
  const shown = { ...profile, ...(editing ? draft : {}) };
  async function upload(file: File | undefined, kind: 'avatar' | 'cover') {
    if (!file || locked) return;
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true);
    setValidation('');
    setSaved(false);
    try {
      const jpeg = await prepareProfileImage(file, kind);
      if (controller.signal.aborted) return;
      const url = await accountSession.uploadProfileImage(jpeg, controller.signal);
      if (mounted.current && !controller.signal.aborted)
        setDraft((value) =>
          kind === 'avatar'
            ? { ...value, avatar: 'upload', avatarUrl: url }
            : { ...value, coverUrl: url },
        );
    } catch (error) {
      if (mounted.current && !controller.signal.aborted)
        setValidation(error instanceof Error ? error.message : 'Chưa tải được ảnh.');
    } finally {
      if (mounted.current) setUploading(false);
    }
  }
  const dirty =
    editing &&
    (draft.displayName !== profile.displayName ||
      draft.bio !== profile.bio ||
      draft.avatar !== profile.avatar ||
      draft.avatarUrl !== profile.avatarUrl ||
      draft.coverUrl !== profile.coverUrl);
  useLeaveGuard(dirty || uploading, locked);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
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
      <div className="relative h-20 overflow-hidden bg-sand sm:h-24">
        {shown.coverUrl && (
          <img
            key={shown.coverUrl}
            src={shown.coverUrl}
            alt="Ảnh bìa của bạn"
            className="absolute inset-0 size-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        )}
      </div>
      <div className="px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="relative -mt-8 flex flex-wrap items-end justify-between gap-4">
          <Avatar
            key={
              (editing ? draft.avatar : profile.avatar) +
              (shown.avatarUrl ?? profile.googleAvatarUrl ?? '')
            }
            profile={{ ...profile, ...(editing ? draft : {}) }}
          />
          {!editing && (
            <Button
              secondary
              disabled={locked}
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
            <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-3 text-sm font-bold text-teal-dark">Ảnh của bạn</legend>
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer flex-col gap-2 text-sm font-medium">
                  Ảnh đại diện
                  <input
                    type="file"
                    className="text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-sand file:px-3 file:py-2 file:text-ink"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="Tải ảnh đại diện"
                    onChange={(event) => {
                      void upload(event.target.files?.[0], 'avatar');
                      event.target.value = '';
                    }}
                  />
                </label>
                {draft.avatar === 'upload' && (
                  <button
                    type="button"
                    className="text-left text-xs text-teal"
                    onClick={() => setDraft({ ...draft, avatar: 'google', avatarUrl: null })}
                  >
                    Dùng lại ảnh Google
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer flex-col gap-2 text-sm font-medium">
                  Ảnh bìa
                  <input
                    type="file"
                    className="text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-sand file:px-3 file:py-2 file:text-ink"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="Tải ảnh bìa"
                    onChange={(event) => {
                      void upload(event.target.files?.[0], 'cover');
                      event.target.value = '';
                    }}
                  />
                </label>
                {draft.coverUrl && (
                  <button
                    type="button"
                    className="text-left text-xs text-teal"
                    onClick={() => setDraft({ ...draft, coverUrl: null })}
                  >
                    Gỡ ảnh bìa
                  </button>
                )}
              </div>
              <p className="text-xs font-normal text-muted sm:col-span-2">
                JPG, PNG hoặc WebP, tối đa 10 MB. Ảnh được cắt giữa khung; bấm Lưu hồ sơ để giữ thay
                đổi.
              </p>
              {uploading && (
                <p role="status" className="text-sm text-muted">
                  Đang tải ảnh lên…
                </p>
              )}
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
                  disabled={locked}
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
                disabled={locked}
                placeholder="Ví dụ: Thích cà phê, săn mây và những chuyến đi cùng bạn bè."
                className="w-full resize-y rounded-2xl border border-line bg-cream p-4 font-normal text-teal-dark focus:outline-2 focus:outline-teal"
              />
              <span className="self-end text-xs font-normal text-muted">
                {draft.bio.length}/160
              </span>
            </label>
            {validation && <Notice error>{validation}</Notice>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={locked}>
                {busy ? 'Đang lưu hồ sơ…' : 'Lưu hồ sơ'}
              </Button>
              <Button
                secondary
                disabled={locked}
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
                disabled={locked}
                onClick={() => {
                  void reload();
                }}
              >
                Xem lại hồ sơ đã lưu
              </Button>
            </Notice>
          </div>
        )}
      </div>
    </section>
  );
}
