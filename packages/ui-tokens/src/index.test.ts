import { expect, test } from 'vitest';
import {
  contrastPairs,
  nativeThemes,
  tokens,
  tokensCss,
  systemTokensCss,
} from './index.js';

test('CSS and native themes keep fonts, dimensions and unitless values portable', () => {
  for (const mode of ['light', 'dark'] as const) {
    const theme = nativeThemes[mode];
    expect(Object.keys(theme.colors)).toEqual(Object.keys(tokens.colors.light));
    expect(theme.fontFamily).toEqual({
      display: 'Bricolage Grotesque',
      body: 'Inter',
    });
    for (const [group, values] of Object.entries(theme)) {
      for (const [key, value] of Object.entries<string | number>(values)) {
        if (group !== 'colors' && group !== 'fontFamily')
          expect(typeof value).toBe('number');
        const cssValue =
          group === 'fontFamily'
            ? `"${String(value)}"`
            : typeof value === 'number' &&
                group !== 'fontWeight' &&
                group !== 'lineHeight'
              ? `${String(value)}px`
              : String(value);
        expect(tokensCss).toContain(`--${group}-${key}: ${cssValue};`);
      }
    }
  }
  expect(systemTokensCss).toContain(':root:not([data-theme])');
  expect(nativeThemes.light.shadow.blur).toBe(0);
  expect(nativeThemes.dark.borderWidth.default).toBe(2);
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
test.each(['light', 'dark'] as const)(
  '%s Pop studio text, focus and component boundaries meet AA',
  (mode) => {
    const colors = tokens.colors[mode];
    for (const pair of contrastPairs) {
      const a = luminance(colors[pair.foreground]);
      const b = luminance(colors[pair.background]);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      expect(
        ratio,
        `${pair.use}: ${pair.foreground}/${pair.background}`,
      ).toBeGreaterThanOrEqual(pair.minimum);
    }
  },
);
