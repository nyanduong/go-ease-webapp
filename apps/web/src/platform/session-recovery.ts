/** Preserve an explicit retry while startup/background work hands off between promises. */
export async function resumeAfterSessionWork(
  initialized: Promise<void> | null,
  pending: () => Promise<void> | null,
  isCurrent: () => boolean,
  retry: () => Promise<void>,
) {
  await initialized;
  while (isCurrent()) {
    const work = pending();
    if (!work) {
      // Invoke in this same turn: another background restore must not start in
      // an await gap between observing idle and handing off the explicit retry.
      return retry();
    }
    await work;
  }
}
