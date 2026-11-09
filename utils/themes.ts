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

/** Luminance of the surface accent-coloured text sits on: the page, and a panel. */
const SURFACES: Record<ThemeId, { page: string; panel: string }> = {
  classic: { page: '#14110E', panel: '#1D1914' },
  gothic: { page: '#0B0A0A', panel: '#131111' },
  eldritch: { page: '#0A0812', panel: '#161222' },
  cursed: { page: '#0D0906', panel: '#DCC9A3' },
}

function mix(hex: string, toward: string, amount: number): string {
  const a = Number.parseInt(hex.slice(1), 16)
  const b = Number.parseInt(toward.slice(1), 16)
  const channel = (shift: number) => {
    const from = (a >> shift) & 255
    const to = (b >> shift) & 255
    return Math.round(from + (to - from) * amount)
  }
  const value = (channel(16) << 16) | (channel(8) << 8) | channel(0)
  return `#${value.toString(16).padStart(6, '0').toUpperCase()}`
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The accent as text on `surface`: nudged toward white (dark surfaces) or ink
 * (parchment) in steps until it reaches WCAG AA contrast, so any custom colour
 * stays readable.
 */
export function readableAccent(accent: string, surface: string, start = 0): string {
  const toward = luminance(surface) > 0.4 ? '#1E1209' : '#FFFFFF'
  for (let amount = start; amount < 1; amount += 0.08) {
    const candidate = mix(accent, toward, amount)
    if (contrast(candidate, surface) >= 4.5) return candidate
  }
  return toward
}

/**
 * CSS custom properties derived from the player's accent. `--accent` is for
 * fills; `--accent-text` / `--accent-ink` are the accent as readable text on
 * the page and on a panel (mixed toward ink on Cursed parchment, per tokens.json).
 */
export function accentVars(theme: ThemeId, accent: string): Record<string, string> {
  const surface = SURFACES[theme]
  return {
    '--accent': accent,
    '--on-accent': onAccent(accent),
    '--accent-text': readableAccent(accent, surface.page),
    '--accent-ink': readableAccent(accent, surface.panel, theme === 'cursed' ? 0.38 : 0),
    '--accent-tint': `color-mix(in srgb, ${accent} 16%, transparent)`,
  }
}

export function accentName(accent: string | null): string {
  if (accent === null) return 'Theme default'
  const preset = ACCENTS.find((a) => a.hex.toLowerCase() === accent.toLowerCase())
  return preset ? preset.name : `Custom ${accent.toUpperCase()}`
}
