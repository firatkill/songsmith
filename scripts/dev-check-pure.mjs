export function parseVersion(text) {
  const match = /(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:\s|$|[-+])/.exec(text.trim());
  return match ? match.slice(1, 4).map(Number) : null;
}
export function versionAtLeast(text, minimum) {
  const value = parseVersion(text);
  if (!value) return false;
  for (let i = 0; i < minimum.length; i++) {
    if (value[i] !== minimum[i]) return value[i] > minimum[i];
  }
  return true;
}
export function classifyPort(listeners, ownPids, ownContainer = false) {
  if (!listeners.length) return 'free';
  if (
    listeners.every(
      ({ pid, command }) =>
        ownPids.includes(pid) ||
        (ownContainer && /docker|com\.docker|vpnkit/i.test(command)),
    )
  )
    return 'ours';
  return 'conflict';
}
// Credentials are injected from supabase status, never required in a checked-in file.
// Defaults make optional empty names from .env.example valid; live mode is forbidden here.
export function checkMockEnv(input) {
  const env = Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) => typeof value !== 'string' || value.trim() !== '',
    ),
  );
  const failures = [];
  if (env.APP_ENV && env.APP_ENV !== 'local') failures.push('APP_ENV');
  if (env.PROVIDER_MODE && env.PROVIDER_MODE !== 'mock')
    failures.push('PROVIDER_MODE');
  if (env.ALLOW_LIVE_PROVIDERS === 'true')
    failures.push('ALLOW_LIVE_PROVIDERS');
  if (env.API_PORT && env.API_PORT !== '4000') failures.push('API_PORT');
  return failures;
}

export const minimumXcode = '26.4';
export function checkXcode(output) {
  const match = /^Xcode (\d+)\.(\d+)(?:\.(\d+))?/m.exec(output);
  const installed = match
    ? `${match[1]}.${match[2]}${match[3] ? `.${match[3]}` : ''}`
    : 'unknown';
  return {
    installed,
    required: minimumXcode,
    supported: Boolean(
      match &&
      versionAtLeast(`${match[1]}.${match[2]}.${match[3] || '0'}`, [26, 4, 0]),
    ),
  };
}
