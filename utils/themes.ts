import { isHex, luminance, onAccent } from './contrast'

export type ThemeId = 'classic' | 'gothic' | 'eldritch' | 'cursed'

export interface ThemeMeta {
  id: ThemeId
  name: string
  desc: string
  defaultAccent: string
  /** Swatch values for the Settings theme picker. */
  swatchBg: string
  swatchText: string
  display: string
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'classic',
    name: 'Classic',
    desc: 'Lantern-lit tavern',
    defaultAccent: '#E0B054',
    swatchBg: '#14110E',
    swatchText: '#EFE6D4',
    display: 'Cinzel, Georgia, serif',
  },
  {
    id: 'gothic',
    name: 'Gothic grimdark',
    desc: 'Iron, bone and blood',
    defaultAccent: '#B8443A',
    swatchBg: 'radial-gradient(ellipse 1100px 520px at 50% -12%, #2B1414 0%, #0B0A0A 62%)',
    swatchText: '#E8E0D0',
    display: 'UnifrakturMaguntia, Georgia, serif',
  },
  {
    id: 'eldritch',
    name: 'Eldritch arcane',
    desc: 'Void, sigils, witchlight',
    defaultAccent: '#6FCF8E',
    swatchBg: 'radial-gradient(900px 600px at 50% 0%, #241A3D 0%, #0A0812 65%)',
    swatchText: '#E6E0F5',
    display: '"Cinzel Decorative", Cinzel, serif',
  },
  {
    id: 'cursed',
    name: 'Cursed parchment',
    desc: 'Charred vellum, wax seals',
    defaultAccent: '#C8551F',
    swatchBg: '#DCC9A3',
    swatchText: '#2B1A0E',
    display: '"IM Fell English", Georgia, serif',
  },
]

export const ACCENTS: { id: string; name: string; hex: string }[] = [
  { id: 'oxblood', name: 'Oxblood', hex: '#B8443A' },
  { id: 'ember', name: 'Ember', hex: '#D9822B' },
  { id: 'gold', name: 'Old gold', hex: '#D9A441' },
  { id: 'witchlight', name: 'Witchlight', hex: '#6FCF8E' },
  { id: 'arcane', name: 'Arcane', hex: '#9B7BE0' },
  { id: 'frost', name: 'Frost', hex: '#79A7D3' },
]

export function themeMeta(id: string | null | undefined): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? (THEMES[0] as ThemeMeta)
}

export function resolveAccent(theme: ThemeId, accent: string | null | undefined): string {
  return accent && isHex(accent) ? accent : themeMeta(theme).defaultAccent
}

/**
 * CSS custom properties derived from the player's accent. `--accent-ink` is the
 * accent as readable text on a panel: mixed toward ink on Cursed parchment, and
 * lifted toward white when a custom colour is too dark for the dark themes.
 */
export function accentVars(theme: ThemeId, accent: string): Record<string, string> {
  const lift = luminance(accent) < 0.12 ? `color-mix(in srgb, ${accent} 55%, #fff)` : accent
  return {
    '--accent': accent,
    '--on-accent': onAccent(accent),
    '--accent-text': lift,
    '--accent-ink': theme === 'cursed' ? `color-mix(in srgb, ${accent} 62%, #1E1209)` : lift,
    '--accent-tint': `color-mix(in srgb, ${accent} 16%, transparent)`,
  }
}

export function accentName(accent: string): string {
  const preset = ACCENTS.find((a) => a.hex.toLowerCase() === accent.toLowerCase())
  return preset ? preset.name : `Custom ${accent.toUpperCase()}`
}
