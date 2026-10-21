export const PROFILE_AVATARS = [
  { id: 'compass', label: 'La bàn', icon: '🧭' },
  { id: 'mountain', label: 'Núi xanh', icon: '⛰️' },
  { id: 'sun', label: 'Nắng ấm', icon: '☀️' },
  { id: 'tent', label: 'Cắm trại', icon: '🏕️' },
  { id: 'coffee', label: 'Cà phê', icon: '☕' },
  { id: 'palm', label: 'Biển xanh', icon: '🌴' },
] as const;
export type ProfileAvatar = 'google' | 'upload' | (typeof PROFILE_AVATARS)[number]['id'];
export interface ProfileInput {
  displayName: string;
  bio: string;
  avatar: ProfileAvatar;
  avatarUrl?: string | null;
  coverUrl?: string | null;
}
export interface AccountProfile extends ProfileInput {
  email: string | null;
  googleAvatarUrl: string | null;
}
export function validateProfile(input: ProfileInput): ProfileInput {
  if (
    !input ||
    typeof input.displayName !== 'string' ||
    !input.displayName.trim() ||
    input.displayName.trim().length > 80 ||
    /[\u0000-\u001f\u007f]/u.test(input.displayName)
  )
    throw Error('Tên hiển thị cần từ 1 đến 80 ký tự.');
  if (
    typeof input.bio !== 'string' ||
    input.bio.trim().length > 160 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input.bio)
  )
    throw Error('Giới thiệu ngắn tối đa 160 ký tự.');
  if (
    input.avatar !== 'google' &&
    input.avatar !== 'upload' &&
    !PROFILE_AVATARS.some((avatar) => avatar.id === input.avatar)
  )
    throw Error('Chọn ảnh đại diện hợp lệ.');
  for (const value of [input.avatarUrl, input.coverUrl])
    if (value !== undefined && value !== null && !profilePhotoUrl(value))
      throw Error('Ảnh hồ sơ không hợp lệ. Hãy tải ảnh từ máy lên.');
  if (input.avatar === 'upload' && !input.avatarUrl) throw Error('Chọn ảnh đại diện từ máy.');
  return {
    displayName: input.displayName.trim(),
    bio: input.bio.trim(),
    avatar: input.avatar,
    ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
  };
}
export function profilePhotoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) &&
      /^\/v1\/profile-media\/[a-f0-9]{24}-[a-f0-9-]{36}\.jpg$/.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function googlePhoto(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
// Display-only metadata. Never use these fields for identity, ownership or roles.
export function readAccountProfile(value: unknown): AccountProfile {
  const user = object(value),
    metadata = object(user.user_metadata);
  const email =
    typeof user.email === 'string' &&
    user.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
      ? user.email
      : null;
  const googleName = [metadata.full_name, metadata.name].find(
    (value) =>
      typeof value === 'string' &&
      value.trim().length > 0 &&
      value.trim().length <= 80 &&
      !/[\u0000-\u001f\u007f]/u.test(value),
  ) as string | undefined;
  let fields: ProfileInput = {
    displayName: googleName?.trim() || email?.split('@')[0]?.slice(0, 80) || 'Bạn đồng hành',
    bio: '',
    avatar: 'google',
  };
  try {
    fields = validateProfile(object(metadata.goease_profile) as unknown as ProfileInput);
  } catch {
    /* Existing Google-only profiles use the defaults above. */
  }
  return {
    ...fields,
    email,
    googleAvatarUrl: googlePhoto(metadata.avatar_url) ?? googlePhoto(metadata.picture),
  };
}
