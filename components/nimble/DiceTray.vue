<script setup lang="ts">
// Throws the app's own rolls as 3D dice that land on the rolled values: one more
// die per step of advantage or disadvantage (the dropped ones fade), the Primary
// Die tagged, a crit's explosions thrown after, CRIT or MISS called out. Nothing
// shows for players who roll their own dice (the app rolls nothing), with reduced
// motion, or once turned off here or in Settings (`useDiceAnimation`, which also sets
// how fast the dice tumble). It stays until clicked or Esc. A modal dialog
// opened last, so it sits above the board's drawer and any other open dialog and
// still takes clicks (a popover outside a modal dialog would be inert).
import type DiceBox from '@3d-dice/dice-box-threejs'
import { isHex, onAccent } from '~/utils/contrast'
import { onDiceShown, type ShownRoll } from '~/utils/dice'

type Role = 'primary' | 'kept' | 'dropped' | 'crit' | 'extra'
interface Die {
  sides: number
  value: number
  role: Role
}

const SIDES = new Set([4, 6, 8, 10, 12, 20])
const TAGS: Partial<Record<Role, string>> = { primary: 'Primary', dropped: 'Dropped', crit: 'Crit' }

const auth = useAuthStore()
const tray = ref<HTMLDialogElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const rolls = ref<ShownRoll[]>([])
const settled = ref(false)
const tags = ref<{ x: number; y: number; text: string; role: Role }[]>([])
const prefs = useDiceAnimation()

let box: DiceBox | null = null
let pending: ShownRoll[] = []
let queued = false
let throwId = 0
let stop: (() => void) | undefined

onMounted(() => {
  stop = onDiceShown((roll) => {
    if (!prefs.animate.value || !SIDES.has(roll.sides)) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    pending.push(roll)
    // One action can roll several times (a stack of summons): throw them together.
    if (!queued) {
      queued = true
      queueMicrotask(() => void throwPending())
    }
  })
})

onBeforeUnmount(() => {
  stop?.()
})

function setSkip(on: boolean) {
  prefs.setAnimate(!on)
  if (on) close()
}
watch(prefs.animate, (on) => {
  if (!on) close()
})

/**
 * Speed: the library first simulates the throw to find where the dice land, then
 * replays the same physics steps on screen, as many per frame as the clock says.
 * Taking more (or fewer) of those steps per frame while it replays changes only how
 * fast the throw plays; the simulation, and so where the dice land, stays the same.
 */
function scaleSpeed(b: DiceBox) {
  const world = b.world
  const step = world.step.bind(world)
  let owed = 0
  world.step = (dt: number) => {
    if (b.animstate !== 'throw') return step(dt)
    owed += prefs.speed.value
    while (owed >= 1) {
      step(dt)
      owed -= 1
    }
  }
}

/** Lone dice of one size in a row (minions, mana dice, NPC Initiative) share a line. */
function compact(list: ShownRoll[]): ShownRoll[] {
  const out: ShownRoll[] = []
  for (const r of list) {
    const prev = out.at(-1)
    if (r.bare && prev?.bare && prev.sides === r.sides)
      out[out.length - 1] = {
        ...prev,
        dice: [...prev.dice, ...r.dice],
        total: prev.total + r.total,
      }
    else out.push(r)
  }
  return out
}

/** Every die in throw order: each roll's dice, then the dice it added on a hit. */
function diceOf(list: ShownRoll[]): Die[] {
  return list.flatMap((r) => [
    ...r.dice.map((value, i) => ({
      sides: r.sides,
      value,
      role: (i === r.primary ? 'primary' : r.dropped.includes(i) ? 'dropped' : 'kept') as Role,
    })),
    ...(r.extra && SIDES.has(r.extra.sides)
      ? r.extra.dice.map((value) => ({ sides: r.extra!.sides, value, role: 'extra' as Role }))
      : []),
  ])
}

/** "1d20+2d6@17,3,5": runs of one die size, then the values they land on, in order. */
function notation(dice: Die[]): string {
  const groups: string[] = []
  let run = 0
  dice.forEach((d, i) => {
    run += 1
    if (dice[i + 1]?.sides !== d.sides) {
      groups.push(`${run}d${d.sides}`)
      run = 0
    }
  })
  return `${groups.join('+')}@${dice.map((d) => d.value).join(',')}`
}

/** The strip under the table: kept dice left to right (the Primary first), then dropped. */
function strip(r: ShownRoll): Die[] {
  const own = diceOf([r])
  return [
    ...own.filter((d) => d.role === 'primary' || d.role === 'kept'),
    ...r.explosions.map((value) => ({ sides: r.sides, value, role: 'crit' as Role })),
    ...own.filter((d) => d.role === 'extra'),
    ...own.filter((d) => d.role === 'dropped'),
  ]
}

function oddsText(odds: number): string {
  if (!odds) return ''
  const n = Math.abs(odds)
  return `${n > 1 ? `${n}× ` : ''}${odds > 0 ? 'disadvantage' : 'advantage'}`
}

/** The player's dice colour (Settings), or their accent; numbers stay readable on it. */
const dieColor = computed(() => {
  const own = auth.profile?.dice_color
  if (own) return own
  const accent = import.meta.client
    ? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    : ''
  return isHex(accent) ? accent : '#D6A64A'
})

function colorset(hex: string) {
  const ink = onAccent(hex)
  return {
    name: `lantern-${hex}`,
    background: hex,
    foreground: ink,
    outline: ink,
    texture: 'none',
    material: 'plastic',
  }
}

let boxColor = ''

async function ensureBox(): Promise<DiceBox> {
  const hex = dieColor.value
  if (box) {
    box.setDimensions()
    if (hex !== boxColor) await box.updateConfig({ theme_customColorset: colorset(hex) })
    boxColor = hex
    return box
  }
  const { default: Box } = await import('@3d-dice/dice-box-threejs')
  boxColor = hex
  box = new Box('#dice-tray-stage', {
    theme_customColorset: colorset(hex),
    sounds: false,
    shadows: true,
    light_intensity: 0.9,
    strength: 1.3,
  })
  await box.initialize()
  scaleSpeed(box)
  return box
}

/** Tags the Primary, dropped and crit dice where they landed, and fades the dropped ones. */
function mark(b: DiceBox, dice: Die[]) {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return
  tags.value = dice.flatMap((d, i) => {
    const mesh = b.diceList[i]
    const text = TAGS[d.role]
    if (!mesh || !text) return []
    if (d.role === 'dropped')
      for (const m of [mesh.material].flat()) {
        m.transparent = true
        m.opacity = 0.3
      }
    const at = mesh.position.clone().project(b.camera)
    return [
      { x: ((at.x + 1) / 2) * rect.width, y: ((1 - at.y) / 2) * rect.height, text, role: d.role },
    ]
  })
  b.renderer.render(b.scene, b.camera)
}

async function throwPending() {
  queued = false
  const list = compact(pending)
  pending = []
  if (!list.length) return
  const id = ++throwId
  rolls.value = list
  settled.value = false
  tags.value = []
  if (tray.value && !tray.value.open) {
    tray.value.showModal()
    // Focus the tray itself, not the "Don't animate dice" box, so Space can't tick it.
    tray.value.focus()
  }
  await nextTick()
  const dice = diceOf(list)
  try {
    const b = await ensureBox()
    if (id !== throwId) return
    await b.roll(notation(dice))
    // A crit rolls its die again, and again on each max: throw them one at a time.
    const blasts = list.flatMap((r) =>
      r.explosions.map((value) => ({ sides: r.sides, value, role: 'crit' as Role })),
    )
    for (const blast of blasts) {
      if (id !== throwId) return
      await b.add(notation([blast]))
      dice.push(blast)
    }
    if (id !== throwId) return
    mark(b, dice)
  } catch {
    // No WebGL: the strip below still shows the roll.
  }
  settled.value = true
}

function close() {
  throwId += 1
  rolls.value = []
  tags.value = []
  box?.clearDice()
  if (tray.value?.open) tray.value.close()
}
</script>

<template>
  <dialog
    ref="tray"
    class="tray"
    aria-label="Dice roll"
    tabindex="-1"
    :style="{ '--die': dieColor, '--on-die': onAccent(dieColor) }"
    @click="close"
    @cancel.prevent="close"
  >
    <div id="dice-tray-stage" ref="stage" class="tray__stage" />
    <span
      v-for="(t, i) in tags"
      :key="i"
      class="tray__tag"
      :class="`tray__tag--${t.role}`"
      :style="{ left: `${t.x}px`, top: `${t.y}px` }"
      aria-hidden="true"
      >{{ t.text }}</span
    >
    <div class="tray__results" role="status" aria-live="polite" @click.stop>
      <template v-if="settled">
        <div v-for="(r, k) in rolls" :key="k" class="tray__roll">
          <strong v-if="r.miss" class="tray__call tray__call--miss">Miss</strong>
          <strong v-else-if="r.crit" class="tray__call tray__call--crit">Crit!</strong>
          <div class="tray__dice">
            <span
              v-for="(d, i) in strip(r)"
              :key="i"
              class="tray__die"
              :class="`tray__die--${d.role}`"
              :title="`d${d.sides}${d.role === 'primary' ? ', Primary Die' : d.role === 'dropped' ? ', dropped' : d.role === 'crit' ? ', crit' : ''}`"
              >{{ d.value }}</span
            >
            <span v-if="r.mod" class="tray__mod">{{ r.mod > 0 ? `+${r.mod}` : r.mod }}</span>
          </div>
          <span v-if="!r.bare" class="tray__total">{{ r.total }}</span>
          <small v-if="r.odds" class="tray__odds">{{ oddsText(r.odds) }}</small>
        </div>
      </template>
      <small v-if="settled" class="tray__hint">Click anywhere or press Esc to close</small>
      <label class="tray__skip">
        <input
          type="checkbox"
          :checked="!prefs.animate.value"
          @change="setSkip(($event.target as HTMLInputElement).checked)"
        />
        Don’t animate dice
      </label>
    </div>
  </dialog>
</template>

<style scoped lang="scss">
.tray {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: color-mix(in srgb, #06120e 72%, transparent);
  backdrop-filter: blur(2px);
  color: #f3ead6;
  cursor: pointer;
  overflow: hidden;
  outline: none;

  &::backdrop {
    background: transparent;
  }
}

.tray__stage {
  position: absolute;
  inset: 0;
}

.tray__tag {
  position: absolute;
  transform: translate(-50%, -260%);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
  background: #f3ead6;
  color: #1b1408;

  &--primary {
    background: var(--die);
    color: var(--on-die);
  }

  &--dropped {
    background: color-mix(in srgb, #f3ead6 40%, transparent);
    text-decoration: line-through;
  }

  &--crit {
    background: #e8703a;
    color: #fff;
  }
}

.tray__results {
  position: absolute;
  left: 50%;
  bottom: max(24px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(560px, calc(100% - 32px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: color-mix(in srgb, #06120e 85%, transparent);
  cursor: default;
}

.tray__roll {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.tray__call {
  font-family: var(--font-heading);
  font-size: 22px;
  letter-spacing: 0.04em;
  text-transform: uppercase;

  &--crit {
    color: #f5b13d;
  }

  &--miss {
    color: #ef8a7a;
  }
}

.tray__dice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.tray__die {
  min-width: 34px;
  height: 34px;
  padding: 0 6px;
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  font-weight: 700;
  background: #f3ead6;
  color: #1b1408;

  &--primary {
    background: var(--die);
    color: var(--on-die);
    box-shadow: 0 0 0 2px #f3ead6;
  }

  &--dropped {
    opacity: 0.4;
    text-decoration: line-through;
  }

  &--crit {
    background: #e8703a;
    color: #fff;
  }
}

.tray__mod {
  font-weight: 700;
}

.tray__total {
  margin-left: auto;
  font-family: var(--font-heading);
  font-size: 28px;
  font-weight: 700;
}

.tray__odds {
  flex-basis: 100%;
  color: color-mix(in srgb, #f3ead6 70%, transparent);
}

.tray__hint {
  color: color-mix(in srgb, #f3ead6 60%, transparent);
}

.tray__skip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: color-mix(in srgb, #f3ead6 75%, transparent);
  cursor: pointer;
}
</style>
