<script setup lang="ts">
// The battle board's initiative strip: an endless carousel of tokens in turn order, the
// acting one centred and a little larger. The order repeats on both sides (a dashed line
// marks where a round starts again); each turn change slides it one step. Dragging or the
// wheel browses it, and the next turn change centres the acting token again.
// Heroes show their HP from the roster; creatures show theirs to the GM only (players
// see only that one is down). Summons sit under their summoner.
// The GM right-clicks a token (or uses the context-menu key) for its menu: make it the
// acting turn, change its initiative, remove it (`BattleTokenMenu`).
import type { RosterEntry } from '~/types'
import type { TurnRow, useInitiative } from '~/composables/useInitiative'
import { summonOwner } from '~/utils/initiative'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
  gm: boolean
}>()
const emit = defineEmits<{
  hero: [characterId: string]
  select: [combatantId: string]
}>()

const auth = useAuthStore()

function rosterFor(c: TurnRow) {
  return c.character_id ? props.roster.find((r) => r.character_id === c.character_id) : undefined
}

function isMine(c: TurnRow) {
  return c.kind === 'pc' && !!c.character_id && rosterFor(c)?.user_id === auth.userId
}

function isDead(c: TurnRow) {
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

function isLow(c: TurnRow): boolean {
  const f = hpFill(c)
  return isDown(c) || (f !== null && f <= 0.5)
}

/** HP as words for the tooltip and screen readers; the token itself only shows the bar. */
function hpLabel(c: TurnRow): string {
  if (isDown(c)) return c.kind === 'summon' ? 'Slain' : 'Down'
  const t = hpText(c)
  return t ? `HP ${t}` : ''
}

function tokenTitle(c: TurnRow): string {
  return unseated(c) ? `${c.name} (not seated at this table)` : c.name
}

function conditions(c: TurnRow): string[] {
  return c.kind === 'pc' ? (rosterFor(c)?.summary?.conditions ?? []) : (c.conditions ?? [])
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

/** Token width plus the gap between tokens; keep in step with the styles. */
const STEP = 106
/** Wheel travel per token step. */
const WHEEL_STEP = 60

const mod = (a: number, n: number) => ((a % n) + n) % n

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

/**
 * A running position in the endless row: slot keys are positions, so a step forward keeps
 * every token's element and slides it. It moves the shortest way to the acting token, so
 * Next turn (and a new round, wrapping) slides one step left and Prev one step right.
 */
const cursor = ref(0)
/** How far the reader has browsed off the acting token. */
const browse = ref(0)
watch(
  () => [props.init.activeId.value, props.init.order.value.map((c) => c.id).join()] as const,
  () => {
    const order = props.init.order.value
    const n = order.length
    if (!n) return
    const target = Math.max(
      0,
      order.findIndex((c) => c.id === props.init.activeId.value),
    )
    let d = target - mod(cursor.value, n)
    if (d > n / 2) d -= n
    else if (d <= -n / 2) d += n
    cursor.value += d
    browse.value = 0
  },
  { immediate: true },
)

interface Slot {
  key: number
  c: TurnRow
  /** The one copy screen readers and Tab reach: one full round around the centre. */
  primary: boolean
  /** The acting combatant, enlarged; every copy of it, so browsing never loses it. */
  now: boolean
  next: boolean
  roundStart: boolean
}

const slots = computed<Slot[]>(() => {
  const order = props.init.order.value
  const n = order.length
  if (!n) return []
  // One spare slot per side, so a drag never shows an empty edge.
  const half = Math.ceil(Math.max(1, Math.ceil(width.value / STEP)) / 2) + 1
  const center = cursor.value + browse.value
  const first = center - Math.floor((n - 1) / 2)
  const acting = !!props.init.activeId.value
  const out: Slot[] = []
  for (let k = -half; k <= half; k++) {
    const key = center + k
    const i = mod(key, n)
    const c = order[i]
    if (!c) continue
    out.push({
      key,
      c,
      primary: key >= first && key < first + n,
      now: acting && i === mod(cursor.value, n),
      // "Next": only the viewer's own hero, when it is up right after the acting one.
      next: acting && n > 1 && i === mod(cursor.value + 1, n) && isMine(c),
      roundStart: n > 1 && i === 0,
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
    browse.value += Math.sign(wheel)
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

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== pointer) return
  const dx = e.clientX - startX
  if (!dragged) {
    if (Math.abs(dx) < DRAG_START_PX) return
    // Capture only once it is a drag: capturing on press would steal plain clicks.
    dragged = true
    dragging.value = true
    viewport.value?.setPointerCapture(e.pointerId)
  }
  let d = offset.value + dx
  startX = e.clientX
  // Dragging right brings earlier tokens in: browse back one per step crossed.
  while (Math.abs(d) >= STEP) {
    browse.value -= Math.sign(d)
    d -= Math.sign(d) * STEP
  }
  offset.value = d
}

async function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointer) return
  pointer = null
  if (!dragging.value) return
  // Snap to the nearest token: past half a step counts as the next one.
  if (Math.abs(offset.value) > STEP / 2) {
    browse.value -= Math.sign(offset.value)
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
const menu = ref<{ c: TurnRow; key: number; anchor: HTMLElement } | null>(null)
/** Opened a tick after `menu` is set: the popover places itself when it turns on. */
const menuOpen = ref(false)
/** Which round the picked copy belongs to, from the current one: rounds start at index 0. */
const menuRoundOffset = computed(() => {
  const n = props.init.order.value.length
  if (!menu.value || !n) return 0
  return Math.floor(menu.value.key / n) - Math.floor(cursor.value / n)
})

/** The keyboard's context-menu key or Shift+F10, for browsers that don't send `contextmenu`. */
function onTokenKey(slot: Slot, e: KeyboardEvent) {
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) void onContextMenu(slot, e)
}

async function onContextMenu(slot: Slot, e: MouseEvent | KeyboardEvent) {
  // Players keep the browser's own menu.
  if (!props.gm) return
  e.preventDefault()
  menuOpen.value = false
  menu.value = { c: slot.c, key: slot.key, anchor: e.currentTarget as HTMLElement }
  await nextTick()
  menuOpen.value = true
}

// The row moving (a turn change, browsing, a new order) leaves the menu's token behind.
watch(
  () => [props.init.activeId.value, browse.value, props.init.order.value.map((c) => c.id).join()],
  () => (menuOpen.value = false),
)

/** Tabbing to a token off the visible part centres it (a click never moves the row). */
function onFocus(slot: Slot, e: FocusEvent) {
  if ((e.target as HTMLElement | null)?.matches(':focus-visible'))
    browse.value = slot.key - cursor.value
}
</script>

<template>
  <div
    v-if="init.order.value.length"
    ref="viewport"
    class="strip"
    role="group"
    aria-label="Turn order"
    :class="{ 'is-dragging': dragging }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
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
        v-for="{ key, c, primary, now, next, roundStart } in slots"
        :key="key"
        class="slot"
        :class="{ 'is-round-start': roundStart }"
        :aria-hidden="primary ? undefined : 'true'"
        :aria-current="now && primary ? 'step' : undefined"
        @focusin="onFocus({ key, c, primary, now, next, roundStart }, $event)"
      >
        <div
          class="tok"
          :class="{
            'is-now': now,
            'is-mine': isMine(c),
            'is-foe': c.kind !== 'pc',
            'is-down': isDown(c),
          }"
        >
          <UiTooltip :title="tokenTitle(c)" :sub="hpLabel(c)" :text="conditions(c).join(', ')">
            <button
              type="button"
              class="tok__main"
              :tabindex="primary ? undefined : -1"
              :aria-label="`${c.name}, ${c.initiative_rolled ? `initiative ${c.initiative}` : 'waiting for Initiative'}${hpLabel(c) ? `, ${hpLabel(c)}` : ''}`"
              @click="onToken(c)"
              @contextmenu="onContextMenu({ key, c, primary, now, next, roundStart }, $event)"
              @keydown="onTokenKey({ key, c, primary, now, next, roundStart }, $event)"
            >
              <span
                class="tok__score"
                :class="{ 'is-waiting': !c.initiative_rolled }"
                :title="c.initiative_rolled ? 'Initiative' : 'Waiting for their Initiative roll'"
                >{{ c.initiative_rolled ? c.initiative : '–' }}</span
              >
              <span v-if="now" class="tok__badge tok__badge--now">Acting</span>
              <span v-else-if="next" class="tok__badge">Next</span>
              <UiAvatar
                class="tok__avatar"
                :name="c.name"
                :portrait-path="portraitPath(c)"
                :src="c.kind === 'pc' ? null : npcImageUrl(c.portrait_path)"
                :class-slug="rosterFor(c)?.summary?.classSlug ?? null"
                :square="c.kind === 'monster'"
                :faded="isDown(c)"
                :dead="isDead(c)"
                :size="64"
              />
              <span class="tok__plate">
                <span class="tok__name"
                  >{{ c.name }}<span v-if="isDead(c)" class="tok__dead"> (dead)</span></span
                >
                <!-- No HP to show (a creature, to players): the bar keeps its room, unseen. -->
                <span
                  class="tok__bar"
                  :class="{ 'is-low': isLow(c), 'is-none': hpFill(c) === null }"
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
          <div v-if="c.kind === 'pc' && init.summonsOf(c.character_id).length" class="tok__summons">
            <button
              v-for="s in init.summonsOf(c.character_id)"
              :key="s.id"
              type="button"
              class="tok__summon"
              :tabindex="primary ? undefined : -1"
              :title="summonName(s)"
              :aria-label="`${summonName(s)}, summon of ${c.name}`"
              @click="emit('select', s.id)"
            >
              <UiAvatar
                :name="summonName(s)"
                :portrait-path="summonMember(s)?.portrait ?? null"
                :beast="summonMember(s)?.beast ?? null"
                :size="20"
              />
            </button>
          </div>
        </div>
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
  <p v-else class="strip__empty small muted">
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

  // Where the order starts over: a dashed line in the gap before the first token.
  &.is-round-start::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 10%;
    bottom: 10%;
    border-left: 1px dashed var(--line-strong);
  }
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
    background: var(--accent);
  }

  &.is-low span {
    background: var(--danger);
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
</style>
