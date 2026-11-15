import { mkdir, writeFile } from 'node:fs/promises';
import {
  encodeMp3,
  encodeWav,
  synthesize,
  TEMPOS,
} from '../src/providers/mock/audio.js';
const directory = new URL('../src/providers/mock/fixtures/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const tempo of TEMPOS) {
  const pcm = synthesize(tempo);
  await writeFile(new URL(`${String(tempo)}.wav`, directory), encodeWav(pcm));
  await writeFile(new URL(`${String(tempo)}.mp3`, directory), encodeMp3(pcm));
}
