import { expect, test } from 'vitest';
import { nativeThemes, tokens, tokensCss } from './index.js';

test('CSS and native themes contain every source token with numeric native dimensions', () => {
  for (const mode of ['light', 'dark'] as const) {
    const theme = nativeThemes[mode];
    expect(theme).toEqual({
      colors: tokens.colors[mode],
      spacing: tokens.spacing,
      radii: tokens.radii,
      typeScale: tokens.typeScale,
    });
    expect(Object.keys(theme.colors)).toEqual(Object.keys(tokens.colors.light));
    for (const [group, values] of Object.entries(theme))
      for (const [key, value] of Object.entries<string | number>(values)) {
        if (group !== 'colors') expect(typeof value).toBe('number');
        expect(tokensCss).toContain(
          `--${group}-${key}: ${typeof value === 'number' ? `${String(value)}px` : value};`,
        );
      }
  }
});
function luminance(hex: string): number {
  const components = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    (components[0] ?? 0) * 0.2126 +
    (components[1] ?? 0) * 0.7152 +
    (components[2] ?? 0) * 0.0722
  );
}
test('provisional text pairs meet 4.5:1 contrast in both modes', () => {
  for (const { colors } of Object.values(nativeThemes))
    for (const [foreground, background] of [
      [colors.text, colors.background],
      [colors.muted, colors.surface],
      [colors.onAccent, colors.accent],
    ] as const) {
      const a = luminance(foreground),
        b = luminance(background);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
});
