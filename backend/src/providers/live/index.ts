import type { Adapter } from '../types.js';
// UT-12 sentinel. No SDK, credentials or network calls before M6.
if ((process.env['PROVIDER_MODE'] ?? 'mock') === 'mock')
  throw new Error('Live providers imported in mock mode');
export function liveFactories(): Map<string, () => Adapter> {
  return new Map();
}
