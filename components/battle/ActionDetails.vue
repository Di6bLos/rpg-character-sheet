<script setup lang="ts">
// An action's details on touch, opened by a tap on its tile (a tap never uses it): the
// name, kind and tier line, costs, the rules text, why it is unavailable, its picks
// (Opportunity Attack, Help) or upcast stepper, and one big button that uses it. On a
// phone it is a bottom sheet (UiDialog, closed by Escape, the backdrop or a swipe down);
// elsewhere a popover under the tile. Using the action closes it. The tile is read live,
// so an action that becomes unavailable while open disables the button.
import type { BattleChoice, BattleTile } from '~/composables/useBattleActions'
import { guarded, tileButton, tileSub } from '~/utils/battleActions'

const props = defineProps<{
  action: BattleTile
  anchor: HTMLElement | null
  mode: 'sheet' | 'popover'
  readonly?: boolean
}>()
const open = defineModel<boolean>({ required: true })

const a = computed(() => props.action)
const button = computed(() => tileButton(a.value))
const sub = computed(() => tileSub(a.value))
const facts = computed(() =>
  [
    a.value.dice ? { value: a.value.dice, label: 'Damage' } : null,
    { value: String(a.value.actions), label: a.value.actions === 1 ? 'Action' : 'Actions' },
    a.value.mana ? { value: String(a.value.mana), label: 'Mana' } : null,
  ].filter((f) => f !== null),
)

function close() {
  open.value = false
}

function use() {
  if (props.readonly || button.value.disabled) return
  guarded(a.value)
  close()
}

function pick(choice: BattleChoice) {
  if (props.readonly || choice.unavailable !== '') return
  choice.use()
  close()
}

// Swipe down on the sheet closes it, unless its content is scrolled (then the finger
// scrolls it back up first).
const body = ref<HTMLElement | null>(null)
const SWIPE_PX = 80
let startY: number | null = null

function onTouchStart(event: TouchEvent) {
  const scroller = body.value?.closest('.dialog__scroll')
  startY = scroller && scroller.scrollTop > 0 ? null : (event.touches[0]?.clientY ?? null)
}

function onTouchEnd(event: TouchEvent) {
  const end = event.changedTouches[0]?.clientY
  if (startY !== null && end !== undefined && end - startY > SWIPE_PX) close()
  startY = null
}

// One body, two frames: the sheet (UiDialog, which titles it) or the popover.
const UiDialog = resolveComponent('UiDialog')
const ActionPop = resolveComponent('BattleActionPop')
const sheet = computed(() => props.mode === 'sheet')
const frame = computed(() => (sheet.value ? UiDialog : ActionPop))
const frameProps = computed(() =>
  sheet.value
    ? { sheet: true, width: '420px', title: a.value.name }
    : { anchor: props.anchor, label: a.value.name },
)
const swipe = computed(() =>
  sheet.value ? { touchstart: onTouchStart, touchend: onTouchEnd } : {},
)
</script>

<template>
  <component :is="frame" v-bind="frameProps" v-model="open" v-on="swipe">
    <div ref="body" class="det" :class="{ 'det--pop': !sheet }">
      <h3 v-if="!sheet" class="det__name">{{ a.name }}</h3>
      <p v-if="sub" class="det__sub">{{ sub }}</p>
      <dl class="det__facts">
        <div v-for="f in facts" :key="f.label" class="det__fact">
          <dt>{{ f.label }}</dt>
          <dd>{{ f.value }}</dd>
        </div>
      </dl>
      <p v-if="a.desc" class="det__desc">{{ a.desc }}</p>
      <p v-if="button.reason" class="det__why" role="status">{{ button.reason }}</p>

      <div v-if="a.choices" class="det__picks" role="group" :aria-label="`Choose for ${a.name}`">
        <button
          v-for="c in a.choices"
          :key="c.key"
          type="button"
          class="det__pick"
          :aria-disabled="readonly || c.unavailable !== '' || undefined"
          @click="pick(c)"
        >
          <span>{{ c.label }}</span>
          <small v-if="c.unavailable">{{ c.unavailable }}</small>
        </button>
      </div>
      <template v-else>
        <NimbleUpcast
          v-if="a.upcast"
          class="det__upcast"
          :name="a.name"
          :tier="a.tier ?? 0"
          :at="a.upcast.at"
          :max="a.upcast.max"
          :price="a.mana ? `${a.mana} mana` : undefined"
          :disabled="readonly"
          @set="a.upcast.set"
        />
        <button
          type="button"
          class="btn btn--block det__use"
          :disabled="readonly || button.disabled"
          @click="use"
        >
          {{ button.label }}
        </button>
      </template>
      <p class="det__note">Posts to party chat</p>
    </div>
  </component>
</template>

<style scoped lang="scss">
.det {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.det--pop {
  width: min(300px, calc(100vw - 32px));
  padding: 4px;
}

.det__name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.det__sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--page-muted);
}

.det__facts {
  display: flex;
  gap: 8px;
  margin: 0;
}

.det__fact {
  flex: 1 1 0;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);

  dt {
    font-size: 11px;
    color: var(--page-muted);
  }

  dd {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.det__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-line;
}

.det__why {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: color-mix(in srgb, var(--warn-text) 55%, var(--page-text));
}

.det__picks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.det__pick {
  min-height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  color: var(--page-text);
  font: inherit;
  font-size: 14px;
  text-align: left;

  &:hover,
  &:focus-visible {
    border-color: var(--accent);
  }

  &[aria-disabled='true'] {
    opacity: 0.55;
    cursor: not-allowed;
  }

  small {
    font-size: 11.5px;
    color: var(--page-muted);
  }
}

// The stepper's buttons are touch targets here.
.det__upcast :deep(.step) {
  min-width: 44px;
  min-height: 44px;
}

.det__use {
  min-height: 48px;
  width: 100%;
  justify-content: center;
}

.det__note {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--page-muted);
}
</style>
