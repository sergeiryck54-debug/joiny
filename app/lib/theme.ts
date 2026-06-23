// Joiny brand design tokens — from the design handoff.
// Use these instead of hardcoded hex/fonts so screens share one visual language.

export const colors = {
  // Brand
  brandTeal: '#46D6C6',
  brandBlue: '#2A86C4',
  brandBlueDeep: '#2A6E94',
  // Navy (onboarding / stories backgrounds)
  navy1: '#163A57',
  navy2: '#10243C',
  storyNavy1: '#2A6E94',
  storyNavy2: '#16263E',
  // Text
  text: '#16263E',
  textSub: '#54657A',
  textMuted: '#8A97A8',
  textFaint: '#A6B1C0',
  // Surfaces
  bg: '#F6F8FA',
  chatBg: '#EEF3F6',
  surface: '#FFFFFF',
  soft: '#F4F8FA',
  soft2: '#F0F4F7',
  soft3: '#EDF1F4',
  hairline: '#F0F2F6',
  // Accents
  chipBg: '#E8F4F4',
  chipText: '#1E9AA0',
  like: '#E06A8C',
  white: '#FFFFFF',
};

// Gradients (LinearGradient colors arrays).
export const gradients = {
  brand: ['#46D6C6', '#2A86C4'] as const,   // CTAs, logo
  hero: ['#2A86C4', '#2A6E94'] as const,     // event hero
  navy: ['#163A57', '#10243C'] as const,     // onboarding / login
  story: ['#2A6E94', '#16263E'] as const,
};

// Font families (loaded in app/_layout.tsx). With custom fonts, weight lives in
// the family name — set fontFamily, not fontWeight.
export const font = {
  // Baloo 2 — headings / brand (rounded, friendly)
  heading: 'Baloo2_800ExtraBold',
  headingBold: 'Baloo2_700Bold',
  headingSemi: 'Baloo2_600SemiBold',
  // Manrope — UI / body
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
};

export const radius = { card: 18, tile: 14, chip: 18, cta: 16, sheet: 26, pill: 22, avatar: 999 };

// iOS shadows + Android elevation.
export const shadow = {
  card: { shadowColor: '#142846', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  float: { shadowColor: '#142846', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  cta: { shadowColor: '#2A86C4', shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
};
