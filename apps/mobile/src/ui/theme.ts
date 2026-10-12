// Shared native identity. Orange actions use dark text for readable contrast.
export const colors = {
  teal: '#006D75', selected: '#007F86', sunset: '#FF8428', cream: '#FFF9F0',
  ink: '#123449', muted: '#52707A', white: '#FFFFFF', soft: '#EAF4F3',
  line: '#D8E5E4', inputBorder: '#7B9299', warning: '#A94305', warningSurface: '#FFF0DF',
  tealPressed: '#00565E', softPressed: '#D9ECEA', sunsetPressed: '#F27820',
} as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 } as const;
export const radius = { input: 12, button: 16, card: 20, hero: 24 } as const;
export const typography = {
  heading: { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 21 },
  eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: 1.2 },
} as const;
