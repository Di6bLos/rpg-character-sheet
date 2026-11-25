<script setup lang="ts">
// A hero's vitals on the battle board: portrait and identity, HP (the GM's controls
// send a change to the hero's own sheet through hero_hp_changes, applied there by
// useHeroHpChanges), mana for the GM, Wounds, Armor / Speed / Init and conditions (the GM
// adds and removes them through hero_condition_changes, applied by
// useHeroConditionChanges). The stats modal's side and the GM's left column (a hero picked
// on the initiative strip) both show it.
// For the viewer's own hero the page passes the hero column's HP (`own-hp`).
// Every system's sheet applies the GM's changes with its own rules (`gmHeroControls`); only
// Nimble conditions end on their own timing. Where Nimble shows the GM mana, PF2e
// (`gmPoints`) shows hero and focus points.
import type { HeroCard, RosterEntry } from '~/types'
import { heroArmor } from '~/utils/nimbleConditions'
import type { HeroLive } from '~/composables/useHeroCard'
import { sign } from '~/utils/dice'
import { heroDown, hpTone } from '~/utils/roster'

const props = defineProps<{
  characterId: string
  card: HeroCard
  live: HeroLive
  entry: RosterEntry | undefined
  gm: boolean
}>()
const slots = defineSlots<{ 'own-hp'?: () => unknown }>()

const auth = useAuthStore()
const features = useBattleFeatures()
/** The GM's HP, mana and condition tools; read-only vitals where the sheet can't take them. */
const controls = computed(() => props.gm && features.value.gmHeroControls)

const own = computed(() => !!props.entry && props.entry.user_id === auth.userId)
/**
 * The viewer's own hero, with the hero column's HP (it has Wounds too). Slots aren't
 * reactive, so not a computed.
 */
function ownHp(): boolean {
  return own.value && !!slots['own-hp']
}
/**
 * Where Nimble shows Wounds: a downed 5e / PF2e hero's DownStatus (the death saves or
 * PF2e's Dying value); null for Nimble and while up.
 */
const downSummary = computed(() => {
  const l = props.live
  if (!l.deathSaves && !l.pf2e) return null
  if (!heroDown(l.hp, l.hpMax)) return null
  return { deathSaves: l.deathSaves ?? undefined, dying: l.pf2e?.dying }
})
/** PF2e's Wounded value while up. */
const wounded = computed(() => {
  const w = props.live.pf2e?.wounded ?? 0
  return !downSummary.value && w > 0 ? w : 0
})
/** The bar's band, as the hero column and HeroBasic have it. */
const tone = computed(() => hpTone(props.live.hp, props.live.hpMax))
const dead = computed(() => props.live.woundsMax > 0 && props.live.wounds >= props.live.woundsMax)

const identity = computed(() => {
  const c = props.card
  return [[c.lineage, c.class].filter(Boolean).join(' '), c.subclass, `Lvl ${c.level}`]
    .filter(Boolean)
    .join(' · ')
})

function pct(n: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, (n / max) * 100)) : 0
}

// --- GM: add or remove conditions (sent to the hero's sheet like HP) ------------------
const { send: sendCondition } = useSendHeroCondition()
/** Toggles sent but not in the roster yet, so the chips answer at once. */
const pending = ref(new Map<string, boolean>())
watch(
  () => props.characterId,
  () => pending.value.clear(),
)
// Drop each toggle once the roster shows it; later clicks still in flight stay.
watch(
  () => props.live.conditions.join(),
  () => {
    for (const [n, on] of pending.value)
      if (props.live.conditions.includes(n) === on) pending.value.delete(n)
  },
)
const shownConditions = computed(() => {
  const list = props.live.conditions.filter((n) => pending.value.get(n) !== false)
  for (const [n, on] of pending.value) if (on && !list.includes(n)) list.push(n)
  return list
})

async function toggleCondition(name: string, on: boolean) {
  pending.value.set(name, on)
  if (!(await sendCondition(props.characterId, props.card.name, name, on))) {
    pending.value.delete(name)
    return
  }
  sent.value = `${props.card.name}: ${on ? name : `no longer ${name}`}.`
}

// --- GM: send an HP change to the hero's sheet ---------------------------------------
const amount = ref<number | null>(null)
const crit = ref(false)
const { send } = useSendHeroHp()
const sent = ref('')
const uid = useId()
watch(
  () => props.characterId,
  () => {
    amount.value = null
    crit.value = false
    sent.value = ''
  },
)

/** What − and + send: the amount typed (1 when empty), whole and at most 999. */
const step = computed(() => Math.min(999, Math.max(1, Math.floor(Number(amount.value) || 1))))

/** − sends the amount as damage (with Crit if on), + as healing; an empty field means 1. */
async function adjust(sign: 1 | -1) {
  const id = props.characterId
  const name = props.card.name
  const n = step.value
  const isCrit = sign < 0 && crit.value
  if (!(await send(id, name, sign * n, isCrit))) return
  amount.value = null
  crit.value = false
  const what = sign < 0 ? `${n} damage${isCrit ? ' (crit)' : ''}` : `heal ${n}`
  sent.value = `Sent to ${name}: ${what}. Their sheet applies it.`
}
</script>

<template>
  <div class="hc__side">
    <div class="hc__id">
      <UiAvatar
        :name="card.name"
        :portrait-path="entry?.summary?.portraitOverride || card.portrait_path"
        :class-slug="entry?.summary?.classSlug ?? null"
        :dead="dead"
        :size="56"
      />
      <p class="hc__sub">{{ identity }}</p>
    </div>

    <slot v-if="ownHp()" name="own-hp" />
    <div v-else class="hc__hp">
      <div class="hc__hp-head">
        <span class="hc__sect">Hit points</span>
        <span class="hc__hp-num"
          >{{ live.hp }} / {{ live.hpMax
          }}<b v-if="live.tempHp" class="hc__temp"> +{{ live.tempHp }} temp</b></span
        >
      </div>
      <div class="hc__bar" aria-hidden="true">
        <span
          class="hc__fill"
          :class="tone ? `hc__fill--${tone}` : undefined"
          :style="{ width: `${pct(live.hp, live.hpMax)}%` }"
        />
        <span
          v-if="live.tempHp"
          class="hc__fill hc__fill--temp"
          :style="{ width: `${pct(live.tempHp, live.hpMax)}%` }"
        />
      </div>
      <p v-if="own" class="hc__hint">
        {{
          features.nimbleHero
            ? 'Change your HP in the hero column on the left.'
            : 'Change your HP on your full sheet.'
        }}
      </p>
    </div>

    <div v-if="controls" class="hc__gm">
      <span class="hc__sect">Change HP</span>
      <div class="hc__ctl">
        <button
          type="button"
          class="step step--xs"
          :aria-label="`${card.name}: take ${step} damage`"
          @click="adjust(-1)"
        >
          −
        </button>
        <label class="sr-only" :for="`${uid}-amt`">HP amount</label>
        <input
          :id="`${uid}-amt`"
          v-model.number="amount"
          class="input hc__amt"
          type="number"
          min="1"
          inputmode="numeric"
          placeholder="amount"
          @keydown.enter.prevent="adjust(-1)"
        />
        <button
          type="button"
          class="step step--xs"
          :aria-label="`${card.name}: heal ${step}`"
          @click="adjust(1)"
        >
          +
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm hc__crit"
          :aria-pressed="crit"
          title="The damage is from a critical hit"
          @click="crit = !crit"
        >
          Crit
        </button>
      </div>
      <p class="hc__hint" role="status">{{ sent }}</p>
    </div>

    <!-- The GM sees the hero's mana (read only: the player spends it on their sheet). -->
    <BoardManaGauge
      v-if="controls && live.mana"
      class="hc__mana"
      :mana="live.mana"
      :name="card.name"
    />

    <!-- PF2e: the GM sees the hero's hero and focus points (read only, like mana). -->
    <div v-if="gm && features.gmPoints && live.pf2e" class="hc__points">
      <div class="hc__wounds">
        <span class="hc__sect">Hero points</span>
        <span
          class="hc__pips hc__pips--good"
          role="img"
          :aria-label="`${live.pf2e.heroPoints} of 3 hero points`"
        >
          <i v-for="n in 3" :key="n" :class="{ 'is-on': n <= live.pf2e.heroPoints }" />
        </span>
      </div>
      <div v-if="live.pf2e.focus.max > 0" class="hc__wounds">
        <span class="hc__sect">Focus points</span>
        <span
          class="hc__pips hc__pips--good"
          role="img"
          :aria-label="`${live.pf2e.focus.current} of ${live.pf2e.focus.max} focus points`"
        >
          <i
            v-for="n in live.pf2e.focus.max"
            :key="n"
            :class="{ 'is-on': n <= live.pf2e.focus.current }"
          />
        </span>
      </div>
    </div>

    <div v-if="live.woundsMax && !ownHp()" class="hc__wounds">
      <span class="hc__sect">Wounds</span>
      <span class="hc__pips" role="img" :aria-label="`${live.wounds} of ${live.woundsMax} Wounds`">
        <i v-for="n in live.woundsMax" :key="n" :class="{ 'is-on': n <= live.wounds }" />
      </span>
    </div>

    <BattleDownStatus v-if="downSummary && !ownHp()" :summary="downSummary" />
    <div v-else-if="wounded && !ownHp()" class="hc__wounds">
      <span class="hc__sect">Wounded</span>
      <span class="hc__dying">{{ wounded }}</span>
    </div>

    <div class="hc__tiles">
      <div class="hc__tile">
        <b>{{ heroArmor(card.ac, card.conditions, card.level) }}</b>
        <span>Armor</span>
      </div>
      <div class="hc__tile">
        <b>{{ card.speed || '—' }}</b>
        <span>Speed</span>
      </div>
      <div class="hc__tile">
        <b>{{ sign(card.initMod) }}</b>
        <span>Init</span>
      </div>
    </div>

    <BattleConditionPicker
      v-if="controls"
      :name="card.name"
      :subject="characterId"
      :conditions="shownConditions"
      :note="
        features.nimbleHero
          ? `Saved to ${card.name}'s sheet; it ends on its usual timing, or when you remove it.`
          : `Saved to ${card.name}'s sheet until you remove it.`
      "
      @toggle="toggleCondition"
    />
    <div v-else>
      <span class="hc__sect">Conditions</span>
      <ul v-if="live.conditions.length" class="hc__chips">
        <li v-for="c in live.conditions" :key="c">{{ c }}</li>
      </ul>
      <p v-else class="hc__none">No conditions</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hc__side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;

  // The own hero's HP block (HeroHp) uses the hero column's section label.
  :deep(.sect) {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.hc__id {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hc__sub {
  margin: 0;
  font-size: 13px;
  color: var(--page-soft);
}

.hc__sect {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.hc__hp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hc__hp-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.hc__hp-num {
  font-family: var(--font-heading);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.hc__temp {
  font-family: var(--font-body);
  font-size: 12px;
  color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
}

.hc__bar {
  position: relative;
  height: 10px;
  border-radius: 5px;
  background: var(--track);
  overflow: hidden;
}

.hc__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--secondary);

  &--accent {
    background: var(--accent);
  }

  &--danger {
    background: var(--danger);
  }

  // Temp HP over the right end, as on HeroBasic.
  &--temp {
    background: var(--accent);
    opacity: 0.75;
    left: auto;
    right: 0;
  }
}

.hc__hint,
.hc__none {
  margin: 0;
  font-size: 12px;
  color: var(--page-muted);
}

.hc__gm {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hc__ctl {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hc__amt {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 32px;
  padding: 4px 8px;
  text-align: center;
}

.hc__crit[aria-pressed='true'] {
  background: var(--danger-bg);
  color: var(--danger-text);
  border-color: var(--danger);
}

.hc__mana {
  :deep(.mana__bar) {
    max-width: none;
  }

  :deep(.caps) {
    font-size: 10px;
    letter-spacing: 0.1em;
  }
}

.hc__wounds {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hc__dying {
  font-size: 13px;
  font-weight: 600;
  color: var(--page-soft);
}

.hc__pips {
  display: inline-flex;
  gap: 4px;

  i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--page-muted);

    &.is-on {
      background: var(--danger);
      box-shadow: none;
    }
  }

  &--good i.is-on {
    background: var(--accent);
  }
}

.hc__points {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hc__tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.hc__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--field);
  border: 1px solid var(--line);
  min-width: 0;

  b {
    font-family: var(--font-heading);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.hc__chips {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  li {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--field);
    border: 1px solid var(--line);
    color: var(--page-soft);
  }
}
</style>
