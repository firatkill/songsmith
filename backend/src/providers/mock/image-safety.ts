import { PNG } from 'pngjs';
import { providerCall } from '../errors.js';
import type { ImageSafetyAdapter } from '../types.js';
import { simulate, type MockRuntime } from './latency.js';
// Plumbing only: an opaque magenta first pixel is the deterministic unsafe fixture.
export function createImageSafety(runtime: MockRuntime): ImageSafetyAdapter {
  return {
    id: 'mock-image-safety',
    check: (bytes, ctx) =>
      providerCall(async () => {
        await simulate(runtime, '', ctx.signal);
        const png = PNG.sync.read(Buffer.from(bytes));
        const unsafe =
          runtime.mode === 'mock' &&
          png.data[0] === 255 &&
          png.data[1] === 0 &&
          png.data[2] === 255 &&
          png.data[3] === 255;
        return { safe: !unsafe, categories: unsafe ? ['mock_unsafe'] : [] };
      }),
  };
}
