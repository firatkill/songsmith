import type { Adapter } from '../types.js';
import type { MockRuntime } from './latency.js';
import { createMusicA } from './music-a.js';
import { createMusicB } from './music-b.js';
import { createText } from './text.js';
import { createImage } from './image.js';
import { createImageSafety } from './image-safety.js';
import { createAlign } from './align.js';
export function mockFactories(
  runtime: MockRuntime,
): Map<string, () => Adapter> {
  return new Map(
    [
      createMusicA,
      createMusicB,
      createText,
      createImage,
      createImageSafety,
      createAlign,
    ].map((factory) => {
      const adapter = factory(runtime);
      return [adapter.id, () => factory(runtime)];
    }),
  );
}
