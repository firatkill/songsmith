import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
export const POLICY_VERSION = 'v1';
const policy = readFileSync(new URL('./policy/v1.md', import.meta.url), 'utf8');
// User text is data inside a per-call random boundary (SEC-08, UT-40).
export function buildPolicyPromptWith(text: string, boundary: string) {
  const data = text.replaceAll(boundary, '[boundary removed]');
  return {
    system: policy,
    user: `Classify the data between BEGIN ${boundary} and END ${boundary}.\nBEGIN ${boundary}\n${data}\nEND ${boundary}`,
    boundary,
  };
}
export function buildPolicyPrompt(text: string) {
  return buildPolicyPromptWith(
    text,
    `songsmith_data_${randomBytes(24).toString('hex')}`,
  );
}
