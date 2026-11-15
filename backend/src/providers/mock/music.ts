import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  musicCapabilitiesSchema,
  type MusicCapabilities,
  type Operation,
} from '@songsmith/schemas';
import { ProviderError } from '../errors.js';
import type {
  GenerateRequest,
  ProviderContext,
  StemsRequest,
} from '../types.js';
import { TEMPOS } from './audio.js';
export const MUSIC_COST_MICRO_USD = 100000;
export const STEMS_COST_MICRO_USD = 200000;
export function capabilities(which: 'a' | 'b'): MusicCapabilities {
  return musicCapabilitiesSchema.parse({
    operations:
      which === 'a'
        ? ['generate', 'instrumental', 'custom_lyrics', 'image_input']
        : ['generate', 'instrumental', 'custom_lyrics', 'extend', 'stems'],
    minDurationSec: 1,
    maxDurationSec: which === 'a' ? 180 : 300,
    outputFormats: which === 'a' ? ['mp3', 'wav'] : ['mp3'],
    controls: { bpm: false, lengthControl: false, vocalType: false },
    returnsTimestamps: 'none',
    returnsLyrics: false,
    acceptsExternalAudio: which === 'b',
    stemSets: which === 'a' ? [] : ['two_stems', 'six_stems'],
    watermark: which === 'a' ? ['synthid'] : ['none'],
  });
}
export function invalid(): never {
  throw new ProviderError('invalid_request', false);
}
export function estimate(cap: MusicCapabilities, op: Operation) {
  if (!cap.operations.includes(op)) invalid();
  return op === 'stems' ? STEMS_COST_MICRO_USD : MUSIC_COST_MICRO_USD;
}
export function validateMusic(
  cap: MusicCapabilities,
  req: GenerateRequest | StemsRequest,
  op: Operation,
) {
  if (!cap.operations.includes(op)) invalid();
  const duration =
    'durationSec' in req ? req.durationSec : req.audio.durationMs / 1000;
  if (
    !Number.isFinite(duration) ||
    duration < cap.minDurationSec ||
    duration > cap.maxDurationSec ||
    !cap.outputFormats.includes(req.format)
  )
    invalid();
  if ('description' in req) {
    if (typeof req.description !== 'string' || typeof req.language !== 'string')
      invalid();
    if (req.image && !cap.operations.includes('image_input')) invalid();
    if (req.lyrics && !cap.operations.includes('custom_lyrics')) invalid();
    if (req.instrumental && !cap.operations.includes('instrumental')) invalid();
  }
  if ('stemSet' in req && !cap.stemSets.includes(req.stemSet)) invalid();
  if (
    'audio' in req &&
    (!(req.audio.bytes instanceof Uint8Array) ||
      !req.audio.bytes.length ||
      !Number.isFinite(req.audio.durationMs) ||
      req.audio.durationMs <= 0)
  )
    invalid();
  return Math.round(duration * 1000);
}
export function requestText(req: GenerateRequest) {
  return `${req.description}\n${req.lyrics ?? ''}`;
}
export function tempoFor(text: string) {
  const byte = createHash('sha256').update(text).digest().readUInt8(0);
  return TEMPOS[byte % TEMPOS.length] ?? TEMPOS[0];
}
export function ownerKey(ctx: ProviderContext) {
  return createHash('sha256')
    .update(`${ctx.userId}:${ctx.jobId}`)
    .digest('hex');
}
export const taskSchema = z.strictObject({
  version: z.literal(1),
  owner: z.string().length(64),
  durationMs: z.number().int().min(1000).max(300000),
  tempo: z
    .number()
    .refine((v) => TEMPOS.includes(v as (typeof TEMPOS)[number])),
  stemSet: z.enum(['two_stems', 'six_stems']).optional(),
});
