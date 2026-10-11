// Expo evaluates app.config before EAS has built workspace dependencies.
// Keep this validator independent of runtime auth and contracts.
export function googleClientId(value: string | undefined): string | undefined {
  return value && /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(value) ? value : undefined;
}
