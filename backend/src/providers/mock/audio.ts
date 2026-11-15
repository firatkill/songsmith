import { Mp3Encoder } from '@breezystack/lamejs';
import type { AudioOutput, StemsOutput } from '../types.js';
export const SAMPLE_RATE = 22050;
export const TEMPOS = [80, 100, 120, 140] as const;
// PCM resolution is one sample; MP3 adds at most two 1152-sample frames.
export const AUDIO_GRANULARITY_MS = Math.ceil((2304 / SAMPLE_RATE) * 1000);
const FALLBACK_CHORD = [130.81, 164.81, 196];
export function synthesize(tempo: number) {
  const length = Math.round((SAMPLE_RATE * 240) / tempo);
  const pcm = new Int16Array(length);
  const chords = [
    [130.81, 164.81, 196],
    [110, 130.81, 164.81],
    [87.31, 110, 130.81],
    [98, 123.47, 146.83],
  ];
  for (let i = 0; i < length; i++) {
    const beat = ((i / SAMPLE_RATE) * tempo) / 60;
    const chord = chords[Math.min(3, Math.floor(beat))] ?? FALLBACK_CHORD;
    const envelope =
      Math.min(1, (beat % 1) * 20) * Math.min(1, (1 - (beat % 1)) * 20);
    const tone =
      chord.reduce(
        (sum, hz) => sum + Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE),
        0,
      ) / 3;
    const click =
      Math.sin((2 * Math.PI * 1800 * i) / SAMPLE_RATE) *
      Math.exp(-(beat % 1) * 80);
    pcm[i] = Math.round((tone * envelope * 0.35 + click * 0.15) * 32767);
  }
  return pcm;
}
export function encodeWav(pcm: Int16Array): Uint8Array {
  const out = Buffer.alloc(44 + pcm.length * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(out.length - 8, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SAMPLE_RATE, 24);
  out.writeUInt32LE(SAMPLE_RATE * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++)
    out.writeInt16LE(pcm[i] ?? 0, 44 + i * 2);
  return out;
}
export function encodeMp3(pcm: Int16Array): Uint8Array {
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, 64);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152)
    chunks.push(
      new Uint8Array(encoder.encodeBuffer(pcm.subarray(i, i + 1152))),
    );
  chunks.push(new Uint8Array(encoder.flush()));
  return Buffer.concat(chunks);
}
export function loopPcm(durationMs: number, tempo: number, filter = 0) {
  const loop = synthesize(tempo);
  const pcm = new Int16Array(Math.round((durationMs / 1000) * SAMPLE_RATE));
  let low = 0;
  for (let i = 0; i < pcm.length; i++) {
    const sample = loop[i % loop.length] ?? 0;
    low += (sample - low) * (0.02 + filter * 0.025);
    pcm[i] = Math.round(
      filter === 0
        ? sample
        : filter % 2
          ? low / filter
          : (sample - low) / filter,
    );
  }
  return pcm;
}
export function makeAudio(
  durationMs: number,
  format: 'mp3' | 'wav',
  tempo: number,
  filter = 0,
): AudioOutput {
  const pcm = loopPcm(durationMs, tempo, filter);
  return {
    bytes: format === 'wav' ? encodeWav(pcm) : encodeMp3(pcm),
    format,
    durationMs: (pcm.length / SAMPLE_RATE) * 1000,
  };
}
export function makeStems(
  durationMs: number,
  tempo: number,
  stemSet: 'two_stems' | 'six_stems',
): StemsOutput {
  const names =
    stemSet === 'two_stems'
      ? ['vocals', 'instrumental']
      : ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
  return {
    stems: names.map((name, index) => ({
      name,
      audio: makeAudio(durationMs, 'mp3', tempo, index + 1),
    })),
  };
}
