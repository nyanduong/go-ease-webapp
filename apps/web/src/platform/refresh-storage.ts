const tokenPattern = /^[A-Za-z0-9_.~-]{8,1024}$/;
const ownerPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseSavedSession(
  raw: string | null,
): { refreshToken: string; ownerId: string } | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const value = JSON.parse(raw);
    return value?.version === 1 &&
      typeof value.refreshToken === 'string' &&
      tokenPattern.test(value.refreshToken) &&
      typeof value.ownerId === 'string' &&
      ownerPattern.test(value.ownerId)
      ? { refreshToken: value.refreshToken, ownerId: value.ownerId }
      : null;
  } catch {
    return null;
  }
}
export function createRefreshStorage(local: Storage, tab: Storage, key: string, legacyKey: string) {
  return {
    owner: () => parseSavedSession(local.getItem(key))?.ownerId ?? null,
    exists: () => local.getItem(key) !== null || tab.getItem(legacyKey) !== null,
    clearLegacy: () => tab.removeItem(legacyKey),
    async get() {
      const raw = local.getItem(key);
      if (raw !== null) return parseSavedSession(raw)?.refreshToken ?? 'invalid';
      // Upgrade the previous tab-only credential after the next verified rotation succeeds.
      return tab.getItem(legacyKey);
    },
    async set(refreshToken: string, ownerId?: string) {
      if (!tokenPattern.test(refreshToken) || !ownerId || !ownerPattern.test(ownerId))
        throw Error('Phiên đăng nhập không hợp lệ.');
      local.setItem(key, JSON.stringify({ version: 1, refreshToken, ownerId }));
      tab.removeItem(legacyKey);
    },
    async remove() {
      local.removeItem(key);
      tab.removeItem(legacyKey);
    },
  };
}
