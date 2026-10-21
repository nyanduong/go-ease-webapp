import { useState } from 'react';
import type { AccountProfile } from '@goease/trip-client/account-profile';

export function ProfileAvatarImage({
  profile,
  small = false,
}: {
  profile: AccountProfile;
  small?: boolean;
}) {
  const source = profile.avatar === 'upload' ? profile.avatarUrl : profile.googleAvatarUrl;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const initials = profile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint font-bold text-teal-dark ${small ? 'size-10 text-sm' : 'size-28 border-4 border-paper text-3xl shadow-sm sm:size-32'}`}
    >
      {source && failedSource !== source ? (
        <img
          src={source}
          alt="Ảnh đại diện của bạn"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailedSource(source)}
        />
      ) : (
        <span aria-label="Ảnh đại diện">{initials}</span>
      )}
    </span>
  );
}
