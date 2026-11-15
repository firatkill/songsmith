import { createHash } from 'node:crypto';
import type { Service } from '../lib/auth.js';
export const PRIVATE_BUCKET = 'private-media';
// Deterministic paths make the store step idempotent (TRD §9.2, §12.1).
export function songAssetPath(songId: string, file: 'audio.mp3' | 'audio.wav') {
  return `songs/${songId}/${file}`;
}
export async function storePrivate(
  service: Service,
  path: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const result = await service()
    .storage.from(PRIVATE_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (result.error) throw new Error('Storage upload failed');
  return {
    bucket: PRIVATE_BUCKET,
    path,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
