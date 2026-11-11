// Pop studio: owner-selected visual direction, 2026-11-11 (PRD D-42).
export const tokens = {
  colors: {
    light: {
      background: '#FFFFFF',
      surface: '#FFFFFF',
      surfaceAccent: '#FFE45C',
      text: '#111111',
      muted: '#444444',
      border: '#111111',
      primary: '#111111',
      onPrimary: '#FFE45C',
      accent: '#2340D8',
      accentSoft: '#EEF1FF',
      onAccentSoft: '#1A2C96',
      pink: '#FF5DA2',
      onPink: '#3A0620',
      danger: '#B00020',
      dangerSurface: '#FFE8EC',
      onSurfaceAccent: '#111111',
      mutedOnSurfaceAccent: '#444444',
      accentOnSurfaceAccent: '#2340D8',
      borderOnSurfaceAccent: '#111111',
      surfaceOnAccent: '#FFFFFF',
      shadow: '#111111',
    },
    dark: {
      background: '#111111',
      surface: '#1C1C1C',
      surfaceAccent: '#FFE45C',
      text: '#FFFFFF',
      muted: '#C4C4C4',
      border: '#F5F5F5',
      primary: '#111111',
      onPrimary: '#FFE45C',
      accent: '#9CB3FF',
      accentSoft: '#273358',
      onAccentSoft: '#DCE4FF',
      pink: '#651735',
      onPink: '#FFB8D7',
      danger: '#FF9EAB',
      dangerSurface: '#381D26',
      onSurfaceAccent: '#111111',
      mutedOnSurfaceAccent: '#444444',
      accentOnSurfaceAccent: '#2340D8',
      borderOnSurfaceAccent: '#111111',
      surfaceOnAccent: '#FFFFFF',
      shadow: '#F5F5F5',
    },
  },
  fontFamily: { display: 'Bricolage Grotesque', body: 'Inter' },
  fontWeight: { body: 400, medium: 500, display: 800 },
  lineHeight: { body: 1.6, heading: 1.1 },
  spacing: { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, hero: 80 },
  radii: { none: 0, sm: 4, control: 10, card: 14, pill: 999 },
  typeScale: {
    sm: 14,
    body: 16,
    lead: 20,
    heading: 24,
    title: 40,
    display: 72,
  },
  borderWidth: { default: 2, focus: 3 },
  shadow: { offsetX: 4, offsetY: 4, blur: 0, spread: 0 },
} as const;
export type ThemeMode = keyof typeof tokens.colors;
export function createTheme(mode: ThemeMode) {
  return {
    colors: tokens.colors[mode],
    fontFamily: tokens.fontFamily,
    fontWeight: tokens.fontWeight,
    lineHeight: tokens.lineHeight,
    spacing: tokens.spacing,
    radii: tokens.radii,
    typeScale: tokens.typeScale,
    borderWidth: tokens.borderWidth,
    shadow: tokens.shadow,
  };
}
export const nativeThemes = {
  light: createTheme('light'),
  dark: createTheme('dark'),
};
function cssDeclarations(mode: ThemeMode): string {
  return Object.entries(createTheme(mode))
    .flatMap(([group, values]) =>
      Object.entries<string | number>(values).map(([key, value]) => {
        const cssValue =
          group === 'fontFamily'
            ? `"${String(value)}"`
            : typeof value === 'number' &&
                group !== 'fontWeight' &&
                group !== 'lineHeight'
              ? `${String(value)}px`
              : String(value);
        return `  --${group}-${key}: ${cssValue};`;
      }),
    )
    .join('\n');
}
export const tokensCss = (['light', 'dark'] as const)
  .map(
    (mode) =>
      `${mode === 'light' ? ':root, ' : ''}[data-theme="${mode}"] {\n${cssDeclarations(mode)}\n}`,
  )
  .join('\n');
export const systemTokensCss = `@media (prefers-color-scheme: dark) { :root:not([data-theme]) {\n${cssDeclarations('dark')}\n} }`;

// Supported foreground/background contracts, shared by the web and native themes.
// All text pairs meet body AA, so large text also exceeds its 3:1 requirement.
type Color = keyof typeof tokens.colors.light;
export const contrastPairs: readonly {
  foreground: Color;
  background: Color;
  minimum: number;
  use: string;
}[] = [
  {
    foreground: 'text',
    background: 'background',
    minimum: 4.5,
    use: 'Page text',
  },
  {
    foreground: 'text',
    background: 'surface',
    minimum: 4.5,
    use: 'Card and input text',
  },
  {
    foreground: 'muted',
    background: 'background',
    minimum: 4.5,
    use: 'Page supporting text',
  },
  {
    foreground: 'muted',
    background: 'surface',
    minimum: 4.5,
    use: 'Card supporting text',
  },
  {
    foreground: 'onSurfaceAccent',
    background: 'surfaceAccent',
    minimum: 4.5,
    use: 'Yellow card and brand text',
  },
  {
    foreground: 'mutedOnSurfaceAccent',
    background: 'surfaceAccent',
    minimum: 4.5,
    use: 'Yellow supporting text',
  },
  {
    foreground: 'onSurfaceAccent',
    background: 'surfaceOnAccent',
    minimum: 4.5,
    use: 'Yellow card input text',
  },
  {
    foreground: 'onPrimary',
    background: 'primary',
    minimum: 4.5,
    use: 'Primary button and check mark',
  },
  {
    foreground: 'accent',
    background: 'background',
    minimum: 4.5,
    use: 'Page links and focus',
  },
  {
    foreground: 'accent',
    background: 'surface',
    minimum: 4.5,
    use: 'Card links and focus',
  },
  {
    foreground: 'accentOnSurfaceAccent',
    background: 'surfaceAccent',
    minimum: 4.5,
    use: 'Yellow links and focus',
  },
  {
    foreground: 'accentOnSurfaceAccent',
    background: 'surfaceOnAccent',
    minimum: 4.5,
    use: 'Yellow card secondary button and focus',
  },
  {
    foreground: 'onAccentSoft',
    background: 'accentSoft',
    minimum: 4.5,
    use: 'Blue chip and notice text',
  },
  {
    foreground: 'onPink',
    background: 'pink',
    minimum: 4.5,
    use: 'Pink chip text',
  },
  {
    foreground: 'danger',
    background: 'dangerSurface',
    minimum: 4.5,
    use: 'Alert text',
  },
  ...(
    ['background', 'surface', 'accentSoft', 'pink', 'dangerSurface'] as const
  ).map((background) => ({
    foreground: 'border' as const,
    background,
    minimum: 3,
    use: 'UI outline',
  })),
  ...(['surfaceAccent', 'surfaceOnAccent'] as const).map((background) => ({
    foreground: 'borderOnSurfaceAccent' as const,
    background,
    minimum: 3,
    use: 'Yellow card UI outline',
  })),
];
