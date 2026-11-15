import type { z } from 'zod';
import type { MusicCapabilities, Operation } from '@songsmith/schemas';
export type { MusicCapabilities, Operation } from '@songsmith/schemas';
export interface ProviderContext {
  jobId: string;
  userId: string;
  correlationId: string;
  signal: AbortSignal;
}
export type StartResult<T> =
  | {
      kind: 'done';
      output: T;
      costMicroUsd: number | null;
      providerRequestId?: string;
    }
  | {
      kind: 'pending';
      taskId: string;
      pollAfterMs: number;
      providerRequestId?: string;
    };
export interface Timings {
  lines: {
    text: string;
    startMs: number;
    endMs: number;
    words: { text: string; startMs: number; endMs: number }[];
  }[];
}
export interface AudioRef {
  bytes: Uint8Array;
  format: 'mp3' | 'wav';
  durationMs: number;
  modelId?: string;
}
export interface GenerateRequest {
  description: string;
  lyrics?: string;
  language: string;
  durationSec: number;
  format: 'mp3' | 'wav';
  instrumental?: boolean;
  // Genre, mood, tempo and vocal type as one English string (T-20, FR-05).
  style?: string;
  image?: Uint8Array;
}
export interface ExtendRequest extends GenerateRequest {
  audio: AudioRef;
}
export interface StemsRequest {
  audio: AudioRef;
  stemSet: 'two_stems' | 'six_stems';
  format: 'mp3' | 'wav';
}
export type MusicRequest = GenerateRequest | ExtendRequest | StemsRequest;
export interface AudioOutput {
  bytes: Uint8Array | AsyncIterable<Uint8Array>;
  format: 'mp3' | 'wav';
  durationMs: number;
  timestamps?: Timings;
  lyrics?: string;
}
export interface StemsOutput {
  stems: { name: string; audio: AudioOutput }[];
}
export interface CoverRequest {
  title: string;
  description?: string;
}
// Members are function-typed properties (same shape as TRD §8.1) so callers can pass
// them around without binding `this`.
export interface MusicAdapter {
  readonly id: string;
  capabilities: () => MusicCapabilities;
  estimateCostMicroUsd: (op: Operation, req: MusicRequest) => number;
  generate: (
    req: GenerateRequest,
    ctx: ProviderContext,
  ) => Promise<StartResult<AudioOutput>>;
  extend?: (
    req: ExtendRequest,
    ctx: ProviderContext,
  ) => Promise<StartResult<AudioOutput>>;
  stems?: (
    req: StemsRequest,
    ctx: ProviderContext,
  ) => Promise<StartResult<StemsOutput>>;
  poll?: (
    taskId: string,
    ctx: ProviderContext,
  ) => Promise<StartResult<AudioOutput | StemsOutput>>;
}
export interface TextAdapter {
  readonly id: string;
  completeJson<T>(
    req: {
      system: string;
      user: string;
      schema: z.ZodType<T>;
      maxTokens: number;
    },
    ctx: ProviderContext,
  ): Promise<{ value: T; costMicroUsd: number | null }>;
}
export interface ImageAdapter {
  readonly id: string;
  cover(
    req: CoverRequest,
    ctx: ProviderContext,
  ): Promise<{ png: Uint8Array; costMicroUsd: number | null }>;
}
export interface ImageSafetyAdapter {
  readonly id: string;
  check(
    png: Uint8Array,
    ctx: ProviderContext,
  ): Promise<{ safe: boolean; categories: string[] }>;
}
export interface AlignmentAdapter {
  readonly id: string;
  align(
    audio: AudioRef,
    lyrics: string,
    language: string,
    ctx: ProviderContext,
  ): Promise<Timings>;
}
export type Adapter =
  | MusicAdapter
  | TextAdapter
  | ImageAdapter
  | ImageSafetyAdapter
  | AlignmentAdapter;
