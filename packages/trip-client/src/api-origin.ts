/** Account credentials require TLS, except for development on this machine. */
export function isAccountApiOrigin(value: string | undefined): boolean {
  try {
    if (!value) return false;
    const url = new URL(value);
    return (
      url.origin === value &&
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}
