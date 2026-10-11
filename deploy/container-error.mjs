// Emit only bounded BuildKit phase and fixed identifiers, never raw child output.
export function redactedContainerFailure(operation, error) {
  const command = ['build', 'run', 'exec', 'network', 'port', 'inspect', 'rm'].includes(operation) ? operation : 'command';
  const output = [error?.stdout, error?.stderr].filter(value => typeof value === 'string')
    .map(value => value.slice(-65_536)).join('\n');
  const phases = command === 'build' ? [...output.matchAll(/#\d+ \[([a-z][a-z0-9-]{0,31}) (\d{1,2})\/(\d{1,2})\]/g)] : [];
  const phase = phases.at(-1);
  const identifier = output.match(/\bERR_PNPM_[A-Z0-9_]{1,64}\b/)?.[0]
    ?? output.match(/Isolated dependency graph verification failed \((PNPM_SCRIPT_REQUIRED|SOURCE_CLOSURE_INCOMPLETE|ARTIFACT_VERSION_OUTSIDE_GRAPH|ROOT_LOCK_CHANGED|GRAPH_FAILED)\)/)?.[1]
    ?? output.match(/\b(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1]
    ?? (output.includes('Operator platform engine preparation failed.') ? 'OPERATOR_ENGINE_FAILED' : 'COMMAND_FAILED');
  return new Error(`Container ${command} failed (${phase ? `${phase[1]} ${phase[2]}/${phase[3]}, ` : ''}${identifier}); raw environment and SQL are not logged`);
}

export function redactedStartupStatus(output) {
  // These fixed diagnoses never include module paths, URLs, env or raw logs.
  const text = typeof output === 'string' ? output.slice(-65_536) : '';
  const signatures = [
    ['MODULE_MISSING', /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/],
    ['PERMISSION_DENIED', /EACCES|[Pp]ermission denied/],
    ['READ_ONLY_FILESYSTEM', /EROFS|[Rr]ead-only file system/],
    ['ADDRESS_IN_USE', /EADDRINUSE/],
    ['UPSTREAM_DNS_FAILED', /host not found in upstream/],
    ['NGINX_DIRECTIVE_FAILED', /unknown directive|invalid number of arguments/],
    ['FILE_MISSING', /ENOENT|No such file or directory/],
    ['NGINX_STARTUP_FAILED', /nginx: \[emerg\]/],
  ];
  return signatures.find(([, pattern]) => pattern.test(text))?.[0] ?? 'UNCLASSIFIED_STARTUP';
}
