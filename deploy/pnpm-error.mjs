// Only a bounded pnpm error identifier may leave captured child output.
// Package URLs, arguments, environment and raw messages remain private.
export function redactedPnpmFailure(stage, error) {
  const output = [error?.stdout, error?.stderr].filter(value => typeof value === 'string')
    .map(value => value.slice(0, 65_536)).join('\n');
  const identifier = output.match(/\bERR_PNPM_[A-Z0-9_]{1,64}\b/)?.[0]
    ?? (error?.code === 'ETIMEDOUT' ? 'ETIMEDOUT' : 'COMMAND_FAILED');
  const safeStage = stage === 'production' ? 'production' : 'operator';
  return new Error(`Isolated ${safeStage} deploy failed (${identifier}); raw child output is not logged`);
}
