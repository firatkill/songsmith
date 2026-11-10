// Provisional neutral tokens; visual design is decided in the first UI task (PRD D-16).
export const tokens = {
  colors: {
    light: {
      background: '#ffffff',
      surface: '#f5f5f5',
      text: '#171717',
      muted: '#525252',
      border: '#737373',
      accent: '#262626',
      onAccent: '#ffffff',
    },
    dark: {
      background: '#171717',
      surface: '#262626',
      text: '#fafafa',
      muted: '#d4d4d4',
      border: '#a3a3a3',
      accent: '#fafafa',
      onAccent: '#171717',
    },
  },
  spacing: { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radii: { none: 0, sm: 4, md: 8, lg: 16 },
  typeScale: { sm: 14, body: 16, heading: 24, title: 32 },
} as const;
export type ThemeMode = keyof typeof tokens.colors;
export function createTheme(mode: ThemeMode) {
  return {
    colors: tokens.colors[mode],
    spacing: tokens.spacing,
    radii: tokens.radii,
    typeScale: tokens.typeScale,
  };
}
export const nativeThemes = {
  light: createTheme('light'),
  dark: createTheme('dark'),
};
export const tokensCss = (['light', 'dark'] as const)
  .map((mode) => {
    const theme = createTheme(mode);
    const declarations = Object.entries(theme).flatMap(([group, values]) =>
      Object.entries<string | number>(values).map(
        ([key, value]) =>
          `  --${group}-${key}: ${typeof value === 'number' ? `${String(value)}px` : value};`,
      ),
    );
    return `${mode === 'light' ? ':root, ' : ''}[data-theme="${mode}"] {\n${declarations.join('\n')}\n}`;
  })
  .join('\n');
