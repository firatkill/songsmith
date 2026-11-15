import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { providerCall } from '../errors.js';
import type { ImageAdapter } from '../types.js';
import { simulate, type MockRuntime } from './latency.js';
export const IMAGE_COST_MICRO_USD = 40000;
export function createImage(runtime: MockRuntime): ImageAdapter {
  return {
    id: 'mock-image',
    cover: (req, ctx) =>
      providerCall(async () => {
        await simulate(
          runtime,
          `${req.title}\n${req.description ?? ''}`,
          ctx.signal,
        );
        const hash = createHash('sha256').update(req.title).digest();
        const png = new PNG({ width: 1024, height: 1024 });
        for (let y = 0; y < png.height; y++)
          for (let x = 0; x < png.width; x++) {
            const offset = (y * png.width + x) * 4;
            for (let c = 0; c < 3; c++)
              png.data[offset + c] =
                ((hash[c] ?? 0) + Math.floor(x / 8) + Math.floor(y / 8)) % 256;
            png.data[offset + 3] = 255;
          }
        return { png: PNG.sync.write(png), costMicroUsd: IMAGE_COST_MICRO_USD };
      }),
  };
}
