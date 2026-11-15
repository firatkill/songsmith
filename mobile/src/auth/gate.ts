export type Stage = 'sign-in' | 'age-gate' | 'consent' | 'refused' | 'ready';
export function gateStage(
  signedIn: boolean,
  me: { needsAgeGate: boolean; missingConsents: readonly unknown[] } | null,
  refused = false,
): Stage {
  if (refused) return 'refused';
  if (!signedIn) return 'sign-in';
  if (!me || me.needsAgeGate) return 'age-gate';
  return me.missingConsents.length ? 'consent' : 'ready';
}

/** Initial failures block entry; refreshes never replace an already-mounted navigator. */
export function gatePresentation(
  initialized: boolean,
  loading: boolean,
  error: boolean,
) {
  if (initialized) return error ? 'background-error' : 'navigator';
  return !loading && error ? 'initial-error' : 'initial-loading';
}
