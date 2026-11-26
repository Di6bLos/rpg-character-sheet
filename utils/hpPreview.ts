/**
 * What the draggable HP bar (components/sheet/HpBar.vue) previews while it's dragged to
 * `shown`: the damage or healing, what a hit lands after the system's own rule (`takes`:
 * Nimble's Warded halves it, PF2e's Shield Block takes the shield's Hardness off), the temp HP
 * that soak it first, and the HP left. Both systems' bars use it.
 */
export type HpTakes = (damage: number) => { taken: number; note: string }

export interface HpPreview {
  delta: number
  damage: number
  taken: number
  absorbed: number
  result: number
  label: string
}

export function hpPreview(p: {
  hp: number
  shown: number
  temp?: number
  takes?: HpTakes
}): HpPreview {
  const delta = p.shown - p.hp
  const damage = Math.max(0, -delta)
  const rule = p.takes && damage > 0 ? p.takes(damage) : { taken: damage, note: '' }
  const taken = Math.max(0, Math.min(damage, rule.taken))
  const absorbed = Math.min(Math.max(0, p.temp ?? 0), taken)
  const result = delta < 0 ? p.hp - (taken - absorbed) : p.shown
  const label =
    delta < 0
      ? `−${damage} damage${rule.note ? ` (${rule.note})` : ''} → ${result} HP${absorbed ? ` (${absorbed} temp absorbed)` : ''}`
      : `+${delta} healing → ${result} HP`
  return { delta, damage, taken, absorbed, result, label }
}
