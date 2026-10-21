// Select only; the server list remains in its existing cursor/ID order.
export function mostRecentlyUpdated<T extends { updatedAt: string }>(
  items: readonly T[],
): T | undefined {
  return items.reduce<T | undefined>(
    (latest, item) =>
      !latest || Date.parse(item.updatedAt) > Date.parse(latest.updatedAt) ? item : latest,
    undefined,
  );
}
