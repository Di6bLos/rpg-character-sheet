<script setup lang="ts">
// The battle board's initiative strip: tokens in turn order, the acting one centred and a
// little larger. Each round opens with a "Round N" cap and closes with "Round end"; rounds
// already played stay on the left, dimmed like this round's turns already taken, and
// nothing past the current round shows (empty ghost slots fill the sides). Each turn
// change slides it, a new round slides on past the caps. Dragging or the wheel browses it
// (from round 1 to this round's end), and the next turn change centres the acting token.
// Heroes show their HP from the roster; creatures show theirs to the GM only (players
// see only that one is down). Summons sit under their summoner (Nimble only:
// `useBattleFeatures().summons`).
// The GM right-clicks a token (or uses the context-menu key) for its menu: make it the
// acting turn, change its initiative, remove it (`BattleTokenMenu`).
// Compact (phone): 38px portraits with the acting one at 48px, the name under the
// portrait, in a shorter strip.
import type { RosterEntry } from '~/types'
import type { TurnRow, useInitiative } from '~/composables/useInitiative'
import { summonOwner } from '~/utils/initiative'
import { conditionLabels, heroDead, hpClass } from '~/utils/roster'
import { activeKey, browseBounds, slotAt, type StripSlot } from '~/utils/initiativeStrip'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
  gm: boolean
  compact?: boolean
}>()
const emit = defineEmits<{
  hero: [characterId: string]
  select: [combatantId: string]
}>()

const auth = useAuthStore()
const { touch } = useBoardLayout()
const features = useBattleFeatures()

function rosterFor(c: TurnRow) {
  return c.character_id ? props.roster.find((r) => r.character_id === c.character_id) : undefined
}

function isMine(c: TurnRow) {
  return c.kind === 'pc' && !!c.character_id && rosterFor(c)?.user_id === auth.userId
}

/** A dead 5e / PF2e hero: three failed death saves or PF2e's death value (off Nimble, as DownStatus). */
function deadPc(c: TurnRow) {
  return c.kind === 'pc' && !features.value.nimbleHero && heroDead(rosterFor(c)?.summary)
}

function isDead(c: TurnRow) {
  if (deadPc(c)) return true
  const s = c.kind === 'pc' ? rosterFor(c)?.summary : undefined
  const max = s?.woundsMax ?? 0
  return !!s && max > 0 && (s.wounds ?? 0) >= max
}

function isDown(c: TurnRow) {
  if (c.kind === 'pc') {
    const hp = rosterFor(c)?.summary?.hp
    return hp !== undefined && hp <= 0
  }
  return c.hp_band === 'Down' || (c.kind === 'summon' && c.hp_max !== null && (c.hp ?? 0) <= 0)
}

function hpText(c: TurnRow): string {
  if (c.kind === 'pc') {
    const s = rosterFor(c)?.summary
    if (!s || s.hp === undefined) return ''
    const temp = s.tempHp ? ` +${s.tempHp}` : ''
    return `${s.hp} / ${s.hpMax ?? s.hp}${temp}`
  }
  // Players never see a creature's HP, only that it is down (hpLabel).
  return props.gm && c.hp !== null && (c.hp_max ?? 0) > 0 ? `${c.hp} / ${c.hp_max}` : ''
}

/** 0 to 1 for the minibar. Only the GM sees how hurt a creature is: players get no bar. */
function hpFill(c: TurnRow): number | null {
  if (c.kind === 'pc') {
    const s = rosterFor(c)?.summary
    if (!s || s.hp === undefined || !s.hpMax) return null
    return Math.min(1, Math.max(0, s.hp / s.hpMax))
  }
  if (props.gm && c.hp !== null && (c.hp_max ?? 0) > 0)
    return Math.min(1, Math.max(0, c.hp / (c.hp_max ?? 1)))
  return null
}

/** The minibar's band (`hpClass`): red when down, amber at half or less. */
function hpBand(c: TurnRow): string {
  if (isDown(c)) return 'hp--danger'
  const f = hpFill(c)
  return f === null ? '' : hpClass(f, 1)
}

/** HP as words for the tooltip and screen readers; the token itself only shows the bar. */
function hpLabel(c: TurnRow): string {
  if (isDown(c)) return c.kind === 'summon' ? 'Slain' : deadPc(c) ? 'Dead' : 'Down'
  const t = hpText(c)
  return t ? `HP ${t}` : ''
}

function tokenTitle(c: TurnRow): string {
  return unseated(c) ? `${c.name} (not seated at this table)` : c.name
}

function conditions(c: TurnRow): string[] {
  if (c.kind !== 'pc') return c.conditions ?? []
  const r = rosterFor(c)
  return conditionLabels(
    r?.summary?.conditions ?? [],
    r?.character_system,
    r?.summary?.conditionValues,
  )
}

function portraitPath(c: TurnRow): string | null {
  const r = rosterFor(c)
  return r?.summary?.portraitOverride || (r?.portrait_path ?? c.portrait_path)
}

function summonName(c: TurnRow): string {
  if (!c.summon_key) return c.name
  const owner = summonOwner(c.summon_key)
  const id = c.summon_key.slice(owner.length + 1)
  const m = props.roster
    .find((r) => r.character_id === owner)
    ?.summary?.summons?.find((s) => s.id === id)
  return m?.name ?? c.name
}

function summonMember(c: TurnRow) {
  if (!c.summon_key) return undefined
  const owner = summonOwner(c.summon_key)
  const id = c.summon_key.slice(owner.length + 1)
  return props.roster
    .find((r) => r.character_id === owner)
    ?.summary?.summons?.find((s) => s.id === id)
}

/** A hero in the encounter who isn't seated here has no card to open (the RPC refuses it). */
function unseated(c: TurnRow) {
  return c.kind === 'pc' && !rosterFor(c)
}

function onToken(c: TurnRow) {
  if (c.kind === 'pc' && c.character_id && rosterFor(c)) emit('hero', c.character_id)
  emit('select', c.id)
}

/** Token width plus the gap between tokens; keep in step with the styles (96 + 10, compact 52 + 8). */
const step = computed(() => (props.compact ? 60 : 106))
/** Wheel travel per token step. */
const WHEEL_STEP = 60

// The viewport's width decides how many slots to draw (one more on each side than fits).
const viewport = ref<HTMLElement | null>(null)
const width = ref(0)
let ro: ResizeObserver | undefined
watch(viewport, (el, old) => {
  ro ??= new ResizeObserver(([e]) => (width.value = e?.contentRect.width ?? 0))
  if (old) ro.unobserve(old)
  if (el) ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

/** The acting combatant's place in the order; -1 while no one is acting. */
const activeIndex = computed(() =>
  props.init.activeId.value
    ? props.init.order.value.findIndex((c) => c.id === props.init.activeId.value)
    : -1,
)

/**
 * The acting token's position in the row (`utils/initiativeStrip.ts`). Slot keys are
 * positions, so a turn change keeps every token's element and slides it, a new round
 * included (past the "Round end" and the new "Round" cap).
 */
const cursor = computed(() =>
  activeKey(props.init.round.value, activeIndex.value, props.init.order.value.length),
)
/** How far the reader has browsed off the acting token. */
const browse = ref(0)
watch(
  () => [cursor.value, props.init.order.value.map((c) => c.id).join()] as const,
  () => (browse.value = 0),
)

/** Browse to `v`, held between round 1's cap and this round's end. */
function setBrowse(v: number) {
  const { min, max } = browseBounds(
    props.init.order.value.length,
    props.init.round.value,
    cursor.value,
  )
  browse.value = Math.min(max, Math.max(min, v))
}

interface Slot {
  key: number
  kind: StripSlot['kind']
  /** The round a cap, end cap or token belongs to (0 for a ghost). */
  round: number
  /** The combatant, on token slots. */
  c: TurnRow | null
  /** A token of the current round: the copy screen readers and Tab reach. */
  primary: boolean
  /** The acting combatant, enlarged. */
  now: boolean
  next: boolean
  /** Already acted: an earlier round, or this round before the acting one. */
  done: boolean
}

const slots = computed<Slot[]>(() => {
  const order = props.init.order.value
  const n = order.length
  if (!n) return []
  // One spare slot per side, so a drag never shows an empty edge.
  const half = Math.ceil(Math.max(1, Math.ceil(width.value / step.value)) / 2) + 1
  const center = cursor.value + browse.value
  const round = props.init.round.value
  const active = activeIndex.value
  const out: Slot[] = []
  for (let k = -half; k <= half; k++) {
    const key = center + k
    const s = slotAt(key, n, round, active)
    if (s.kind !== 'token') {
      const r = s.kind === 'ghost' ? 0 : s.round
      out.push({
        key,
        kind: s.kind,
        round: r,
        c: null,
        primary: false,
        now: false,
        next: false,
        done: false,
      })
      continue
    }
    const c = order[s.index]
    if (!c) continue
    const primary = s.round === round
    out.push({
      key,
      kind: 'token',
      round: s.round,
      c,
      primary,
      now: primary && active >= 0 && s.index === active,
      // "Next": only the viewer's own hero, when it is up right after the acting one.
      next: primary && active >= 0 && s.index === active + 1 && isMine(c),
      done: s.done,
    })
  }
  return out
})

let wheel = 0
function onWheel(e: WheelEvent) {
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!d) return
  e.preventDefault()
  wheel += d
  while (Math.abs(wheel) >= WHEEL_STEP) {
    setBrowse(browse.value + Math.sign(wheel))
    wheel -= Math.sign(wheel) * WHEEL_STEP
  }
}

// --- Drag to browse -------------------------------------------------------------------
/** The row's offset under the pointer, under one step: whole steps move `browse`. */
const offset = ref(0)
const dragging = ref(false)
/** The pointer moved far enough to count as a drag, so the click that follows is not one. */
let dragged = false
let startX = 0
let pointer: number | null = null
const DRAG_START_PX = 6

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  pointer = e.pointerId
  startX = e.clientX
  dragged = false
}

/** Dragging by `d` px would pull the row past an end (right: before round 1; left: past now). */
function atEdge(d: number) {
  const { min, max } = browseBounds(
    props.init.order.value.length,
    props.init.round.value,
    cursor.value,
  )
  return (d > 0 && browse.value <= min) || (d < 0 && browse.value >= max)
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== pointer) return
  const dx = e.clientX - startX
  if (!dragged) {
    if (Math.abs(dx) < DRAG_START_PX) return
    // Capture only once it is a drag: capturing on press would steal plain clicks.
    dragged = true
    dragging.value = true
    // The capture sends the rest of the gesture here, never to the token: end its long
    // press now, or the GM's menu would open mid-drag and swallow the next tap.
    press.onPointercancel()
    viewport.value?.setPointerCapture(e.pointerId)
  }
  let d = offset.value + dx
  startX = e.clientX
  // Dragging right brings earlier tokens in: browse back one per step crossed.
  const STEP = step.value
  while (Math.abs(d) >= STEP && !atEdge(d)) {
    setBrowse(browse.value - Math.sign(d))
    d -= Math.sign(d) * STEP
  }
  // At either end the row stops following the pointer.
  offset.value = atEdge(d) ? 0 : d
}

async function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointer) return
  pointer = null
  if (!dragging.value) return
  press.onPointercancel()
  // Snap to the nearest token: past half a step counts as the next one.
  const STEP = step.value
  if (Math.abs(offset.value) > STEP / 2 && !atEdge(offset.value)) {
    setBrowse(browse.value - Math.sign(offset.value))
    offset.value -= Math.sign(offset.value) * STEP
  }
  // Let the re-keyed slots render with moves still off, then ease the rest back to 0.
  await nextTick()
  requestAnimationFrame(() => {
    dragging.value = false
    offset.value = 0
  })
}

function onClickCapture(e: MouseEvent) {
  if (!dragged) return
  dragged = false
  e.preventDefault()
  e.stopPropagation()
}

// --- GM token menu --------------------------------------------------------------------
const menu = ref<{ c: TurnRow; round: number; anchor: HTMLElement } | null>(null)
/** Opened a tick after `menu` is set: the popover places itself when it turns on. */
const menuOpen = ref(false)
/** Which round the picked copy belongs to, from the current one (0, or earlier rounds). */
const menuRoundOffset = computed(() => (menu.value ? menu.value.round - props.init.round.value : 0))

/** The keyboard's context-menu key or Shift+F10, for browsers that don't send `contextmenu`. */
function onTokenKey(slot: Slot, e: KeyboardEvent) {
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) void onContextMenu(slot, e)
}

async function onContextMenu(slot: Slot, e: MouseEvent | KeyboardEvent) {
  // Players keep the browser's own menu.
  if (!props.gm || !slot.c) return
  e.preventDefault()
  await openMenu(slot, e.currentTarget as HTMLElement)
}

async function openMenu(slot: Slot, anchor: HTMLElement) {
  if (!props.gm || !slot.c) return
  menuOpen.value = false
  menu.value = { c: slot.c, round: slot.round, anchor }
  await nextTick()
  menuOpen.value = true
}

// On touch, a long press on a token does what the right-click does (the GM's menu).
const press = useLongPress(
  (el) => {
    if (pressSlot) void openMenu(pressSlot, el)
  },
  // Players' long-press does nothing, so the browser's own behaviour stays.
  () => props.gm && !!pressSlot?.c,
)
let pressSlot: Slot | null = null
function onPressDown(slot: Slot, e: PointerEvent) {
  if (!touch.value) return
  pressSlot = slot
  press.onPointerdown(e)
}
function onPressMove(e: PointerEvent) {
  if (touch.value) press.onPointermove(e)
}
function onPressEnd() {
  if (touch.value) press.onPointerup()
}
/** A cancelled touch (the browser took it for a scroll) drops the guards at once. */
function onPressCancel() {
  if (touch.value) press.onPointercancel()
}

// The row moving (a turn change, browsing, a new order) leaves the menu's token behind.
watch(
  () => [cursor.value, browse.value, props.init.order.value.map((c) => c.id).join()],
  () => (menuOpen.value = false),
)

/** Tabbing to a token off the visible part centres it (a click never moves the row). */
function onFocus(slot: Slot, e: FocusEvent) {
  if ((e.target as HTMLElement | null)?.matches(':focus-visible'))
    setBrowse(slot.key - cursor.value)
}
</script>

<template>
  <div
    v-if="init.order.value.length"
    ref="viewport"
    class="strip"
    data-track-area="Initiative"
    role="group"
    aria-label="Turn order"
    :class="{ 'is-dragging': dragging, 'strip--compact': compact }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @lostpointercapture="onPointerUp"
    @click.capture="onClickCapture"
    @dragstart.prevent
  >
    <TransitionGroup
      tag="ol"
      name="slot"
      class="strip__row"
      :style="offset ? { transform: `translateX(${offset}px)` } : undefined"
    >
      <li
        v-for="slot in slots"
        :key="slot.key"
        class="slot"
        :aria-hidden="slot.primary ? undefined : 'true'"
        :aria-current="slot.now ? 'step' : undefined"
        @focusin="onFocus(slot, $event)"
      >
        <div v-if="slot.kind === 'cap'" class="mark mark--cap">
          <span class="mark__label">Round</span>
          <span class="mark__num">{{ slot.round }}</span>
        </div>
        <div v-else-if="slot.kind === 'end'" class="mark mark--end">
          <span class="mark__label">Round {{ slot.round }}</span>
          <span class="mark__end">end</span>
        </div>
        <div v-else-if="!slot.c" class="mark mark--ghost">
          <span class="mark__coin" />
        </div>
        <template v-else>
          <div
            v-for="c in [slot.c]"
            :key="c.id"
            class="tok"
            :class="{
              'is-now': slot.now,
              'is-done': slot.done,
              'is-mine': isMine(c),
              'is-foe': c.kind !== 'pc',
              'is-down': isDown(c),
            }"
          >
            <UiTooltip :title="tokenTitle(c)" :sub="hpLabel(c)" :text="conditions(c).join(', ')">
              <button
                type="button"
                class="tok__main"
                data-track="Initiative token"
                :tabindex="slot.primary ? undefined : -1"
                :aria-label="`${c.name}, ${c.initiative_rolled ? `initiative ${c.initiative}` : 'waiting for Initiative'}${hpLabel(c) ? `, ${hpLabel(c)}` : ''}`"
                @click="onToken(c)"
                @contextmenu="onContextMenu(slot, $event)"
                @pointerdown="onPressDown(slot, $event)"
                @pointermove="onPressMove"
                @pointerup="onPressEnd"
                @pointercancel="onPressCancel"
                @keydown="onTokenKey(slot, $event)"
              >
                <span
                  class="tok__score"
                  :class="{ 'is-waiting': !c.initiative_rolled }"
                  :title="c.initiative_rolled ? 'Initiative' : 'Waiting for their Initiative roll'"
                  >{{ c.initiative_rolled ? c.initiative : '–' }}</span
                >
                <span v-if="slot.now" class="tok__badge tok__badge--now">Acting</span>
                <span v-else-if="slot.next" class="tok__badge">Next</span>
                <UiAvatar
                  class="tok__avatar"
                  :name="c.name"
                  :portrait-path="portraitPath(c)"
                  :src="c.kind === 'pc' ? null : npcImageUrl(c.portrait_path)"
                  :class-slug="rosterFor(c)?.summary?.classSlug ?? null"
                  :square="c.kind === 'monster'"
                  :faded="isDown(c)"
                  :dead="isDead(c)"
                  :size="compact ? 38 : 64"
                />
                <span class="tok__plate">
                  <span class="tok__name"
                    >{{ c.name }}<span v-if="isDead(c)" class="tok__dead"> (dead)</span></span
                  >
                  <!-- No HP to show (a creature, to players): the bar keeps its room, unseen. -->
                  <span
                    class="tok__bar"
                    :class="[hpBand(c), { 'is-none': hpFill(c) === null }]"
                    aria-hidden="true"
                  >
                    <span
                      v-if="hpFill(c) !== null"
                      :style="{ width: `${(hpFill(c) ?? 0) * 100}%` }"
                    />
                  </span>
                </span>
              </button>
            </UiTooltip>
            <div
              v-if="features.summons && c.kind === 'pc' && init.summonsOf(c.character_id).length"
              class="tok__summons"
            >
              <button
                v-for="s in init.summonsOf(c.character_id)"
                :key="s.id"
                type="button"
                class="tok__summon"
                data-track="Initiative summon"
                :tabindex="slot.primary ? undefined : -1"
                :title="summonName(s)"
                :aria-label="`${summonName(s)}, summon of ${c.name}`"
                @click="emit('select', s.id)"
              >
                <UiAvatar
                  :name="summonName(s)"
                  :portrait-path="summonMember(s)?.portrait ?? null"
                  :beast="summonMember(s)?.beast ?? null"
                  :size="compact ? 16 : 20"
                />
              </button>
            </div>
          </div>
        </template>
      </li>
    </TransitionGroup>
    <BattleTokenMenu
      v-if="menu"
      v-model="menuOpen"
      :init="init"
      :c="menu.c"
      :anchor="menu.anchor"
      :round-offset="menuRoundOffset"
    />
  </div>
  <p v-else class="strip__empty small muted" :class="{ 'strip__empty--compact': compact }">
    No encounter running. Tokens appear here when the GM rolls initiative.
  </p>
</template>

<style scoped lang="scss">
// Tokens past the edges are clipped (clip, not hidden: focus must never scroll the row
// off centre) and fade out, so the row reads as endless.
.strip {
  overflow: clip;
  // Horizontal drags browse the row; vertical ones still scroll the page.
  touch-action: pan-y;
  user-select: none;
  cursor: grab;
  padding: 14px 0 8px;
  mask-image: linear-gradient(
    to right,
    transparent,
    #000 48px,
    #000 calc(100% - 48px),
    transparent
  );
}

// More slots than fit, centred: the acting token lands in the middle and the extras
// overflow evenly on both sides.
.strip.is-dragging {
  cursor: grabbing;

  // The row follows the pointer: no easing, and slots re-keyed mid-drag jump into place.
  .strip__row,
  .slot-move,
  .slot-enter-active {
    transition: none;
  }

  .tok__main {
    cursor: grabbing;
  }
}

.strip__row {
  // Eases back to the snapped token after a drag.
  transition: transform 0.25s ease;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: stretch;
  gap: 10px;
}

.slot {
  flex: 0 0 auto;
  position: relative;
  display: flex;
}

.slot-move {
  transition: transform 0.35s ease;
}

.slot-enter-active {
  transition: opacity 0.35s ease;
}

.slot-enter-from {
  opacity: 0;
}

// Round caps and the empty ghost slots: token-sized, so every step stays STEP wide.
.mark {
  flex: 1 1 auto;
  width: 96px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: var(--radius-control);
  color: var(--panel-muted);
  --line: var(--panel-line);
  --line-strong: var(--panel-line-strong);
}

.mark__label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.mark__num {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
  color: var(--accent-ink);
}

.mark__end {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.1;
}

.mark--cap {
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  background: linear-gradient(var(--accent-tint), var(--accent-tint)), var(--panel-bg);
}

.mark--end {
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-bg) 70%, transparent);
}

// An empty slot: a faint dashed coin where a token would stand.
.mark--ghost {
  border: 1px dashed var(--line);
  opacity: 0.45;
}

.mark__coin {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px dashed var(--line-strong);
}

.strip__empty {
  margin: 0;
  padding: 8px 2px;
}

.tok {
  flex: 1 1 auto;
  width: 96px;
  position: relative;
  transition: transform 0.35s ease;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--panel-bg);
  color: var(--panel-text);
  // The strip sits outside .panel, so take the panel palette here (as .panel does), or
  // page-palette text lands on Cursed parchment.
  --page-text: var(--panel-text);
  --page-soft: var(--panel-soft);
  --page-muted: var(--panel-muted);
  --line: var(--panel-line);
  --line-strong: var(--panel-line-strong);
  --track: var(--panel-track);
  --inset: var(--panel-inset);
  --accent-text: var(--accent-ink);

  &.is-foe {
    border-color: color-mix(in srgb, var(--danger) 45%, var(--line));
  }

  &.is-now {
    // Larger than the rest; the 10px gaps leave room for it.
    transform: scale(1.15);
    z-index: 1;
    // The tint is translucent: lay it over the panel, not the page behind the strip.
    background: linear-gradient(var(--accent-tint), var(--accent-tint)), var(--panel-bg);
    border-color: var(--accent);
  }

  &.is-mine {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  &.is-down {
    opacity: 0.7;
  }

  // Already acted (an earlier round, or this round before the acting token).
  &.is-done {
    opacity: 0.5;
    filter: saturate(0.4);

    &:hover,
    &:focus-within {
      opacity: 1;
      filter: none;
    }
  }
}

.tok__main {
  all: unset;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 6px 6px;
  cursor: pointer;
  border-radius: inherit;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}

// Initiative: a small coin on the token's top-left corner.
.tok__score {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 2;
  min-width: 20px;
  height: 20px;
  padding: 0 3px;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  border-radius: 10px;
  font-family: var(--font-display);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1;
  background: var(--panel-bg);
  color: color-mix(in srgb, var(--accent-text) 60%, var(--page-text));
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--line));

  .is-now & {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
}

// A hero still waiting for their Initiative: a dashed coin.
.tok__score.is-waiting {
  border-style: dashed;
  color: var(--page-muted);

  .is-now & {
    color: var(--on-accent);
  }
}

// Acting / Next sits on the token's top edge, so it costs no height.
.tok__badge {
  position: absolute;
  top: -7px;
  right: 6px;
  z-index: 2;
  font-size: 0.5625rem;
  line-height: 13px;
  padding: 0 5px;
  border-radius: 7px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--accent-text);
  border: 1px solid var(--accent);
  // Half of it sits over the page: give it the panel behind its text.
  background: var(--panel-bg);

  &--now {
    background: var(--accent);
    color: var(--on-accent);
  }
}

.tok__avatar {
  margin-top: 2px;
}

// Name and bar laid over the bottom of the portrait.
.tok__plate {
  position: relative;
  z-index: 1;
  align-self: stretch;
  margin-top: -16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 5px 4px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--panel-bg) 88%, transparent);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
}

.tok__name {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tok__dead {
  color: color-mix(in srgb, var(--danger) 35%, var(--page-text));
}

.tok__bar {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: var(--panel-track);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--hp-fill, var(--secondary));
  }

  &.is-none {
    visibility: hidden;
  }
}

.tok__summons {
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 4px 6px 6px;
  border-top: 1px dashed var(--line);
}

@media (prefers-reduced-motion: reduce) {
  .strip__row,
  .slot-move,
  .slot-enter-active,
  .tok {
    transition: none;
  }
}

.tok__summon {
  all: unset;
  display: inline-flex;
  cursor: pointer;
  border-radius: 50%;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
}

// --- Compact (phone) -------------------------------------------------------------------
// Every step is 60px (52px slots, 8px gaps). The acting token is scaled so its portrait
// is 48px; the gaps leave it room.
.strip--compact {
  // Room above and below for the acting token, scaled up, and its badge.
  padding: 16px 0 10px;
  mask-image: linear-gradient(
    to right,
    transparent,
    #000 24px,
    #000 calc(100% - 24px),
    transparent
  );

  .strip__row {
    gap: 8px;
  }

  .mark,
  .tok {
    width: 52px;
  }

  .mark__label {
    font-size: 0.5rem;
    letter-spacing: 0.04em;
  }

  .mark__num {
    font-size: 1.125rem;
  }

  .mark__end {
    font-size: 0.75rem;
  }

  .mark__coin {
    width: 30px;
    height: 30px;
  }

  .tok.is-now {
    transform: scale(1.2632);
  }

  .tok__main {
    gap: 2px;
    padding: 4px 3px 3px;
  }

  .tok__score {
    top: 2px;
    left: 2px;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    font-size: 0.5625rem;
  }

  .tok__badge {
    top: -6px;
    right: 50%;
    transform: translateX(50%);
    font-size: 0.5rem;
    line-height: 11px;
    padding: 0 4px;
  }

  .tok__avatar {
    margin-top: 0;
  }

  // The name and bar under the portrait, not over it.
  .tok__plate {
    margin-top: 0;
    gap: 2px;
    padding: 0 1px;
    background: none;
    box-shadow: none;
  }

  .tok__name {
    font-size: 0.625rem;
  }

  .tok__bar {
    height: 3px;
  }

  .tok__summons {
    gap: 2px;
    padding: 2px 2px 3px;
  }
}

.strip__empty--compact {
  padding: 8px 12px;
}
</style>
