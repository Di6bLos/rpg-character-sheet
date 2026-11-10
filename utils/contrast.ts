const HEX = /^#[0-9a-fA-F]{6}$/

export function isHex(value: string): boolean {
  return HEX.test(value)
}

/** WCAG relative luminance of a #RRGGBB colour (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  )
}

/** Text colour to use on top of an accent fill. */
export function onAccent(hex: string): string {
  return luminance(hex) > 0.28 ? '#141010' : '#FFFFFF'
}
