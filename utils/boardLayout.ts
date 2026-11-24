/** Size class of the battle board: phone < 768, tablet 768-1023, tablet-wide 1024-1199, desktop 1200+. */
export type BoardLayout = 'phone' | 'tablet' | 'tablet-wide' | 'desktop'

export function classifyLayout(width: number): BoardLayout {
  if (width >= 1200) return 'desktop'
  if (width >= 1024) return 'tablet-wide'
  if (width >= 768) return 'tablet'
  return 'phone'
}
