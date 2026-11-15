import { createRequire } from 'node:module';
import type NodeID3Type from 'node-id3';
// node-id3 is CommonJS; createRequire keeps the ESM build happy.
const NodeID3 = createRequire(import.meta.url)(
  'node-id3',
) as typeof NodeID3Type;

// CMP-09 / TRD §12.2: every stored MP3 says it is AI-generated and by which model.
export function tagMp3(
  audio: Uint8Array,
  meta: { title: string; artist: string; modelId: string },
): Uint8Array {
  const tagged = NodeID3.write(
    {
      title: meta.title,
      artist: meta.artist,
      comment: {
        language: 'eng',
        text: `AI-generated with ${meta.modelId}`,
      },
      userDefinedText: [
        { description: 'ai_generated', value: 'true' },
        { description: 'model', value: meta.modelId },
      ],
    },
    Buffer.from(audio),
  );
  return new Uint8Array(tagged);
}
export function readMp3Tags(audio: Uint8Array) {
  return NodeID3.read(Buffer.from(audio));
}
