<script setup lang="ts">
// A hero's vitals on the battle board: portrait and identity, HP (the GM's controls
// send a change to the hero's own sheet through hero_hp_changes, applied there by
// useHeroHpChanges), mana for the GM, Wounds, Armor (AC off Nimble) / Speed / Init (PF2e:
// Perception, what it rolls for Initiative) and conditions (the GM
// adds and removes them through hero_condition_changes, applied by
// useHeroConditionChanges). The stats modal's side and the GM's left column (a hero picked
// on the initiative strip) both show it.
// For the viewer's own hero the page passes the hero column's HP (`own-hp`).
// Every system's sheet applies the GM's changes with its own rules; only Nimble conditions
// end on their own timing. Where Nimble shows the GM mana, PF2e
// (`gmPoints`) shows hero and focus points. PF2e damage also takes its type, From a spell and
// Shield Block (offered while the hero's shield is raised), so the hero's resistances,
// weaknesses and shield apply; the picker's Persistent damage sets persistent damage.
import type { HeroCard, RosterEntry } from '~/types'
import type { HeroLive } from '~/composables/useHeroCard'
import { sign } from '~/utils/dice'
import { PF2E_DAMAGE_TYPES } from '~/utils/pf2eDamage'
import { initiativeBonus, initiativeLabel } from '~/utils/heroCardStats'
import { conditionLabels, heroDown, hpTone } from '~/utils/roster'

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
/** The GM's HP, mana and condition tools (every system: each sheet applies its own rules). */
const controls = computed(() => props.gm)
/** PF2e rolls Perception for Initiative; the others their Init. */
const init = computed(() => initiativeBonus(props.card.system, props.card) ?? 0)

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
  return { deathSaves: l.deathSaves ?? undefined, dying: l.pf2e?.dying, doomed: l.pf2e?.doomed }
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
const { send: sendCondition, sendPersistent } = useSendHeroCondition()
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

/** PF2e persistent damage, through gm_set_hero_persistent (null dice ends it). */
async function setPersistent(type: string, dice: string | null) {
  if (!(await sendPersistent(props.characterId, props.card.name, type, dice))) return
  sent.value = dice
    ? `${props.card.name}: ${dice} persistent ${type} damage.`
    : `${props.card.name}: no longer taking persistent ${type} damage.`
}

/** Conditions as chips for the players, PF2e persistent damage too. */
const shownLabels = computed(() => [
  ...conditionLabels(props.live.conditions, props.card.system, props.live.conditionValues),
  ...props.live.persistent.map((p) => `${p.dice} persistent ${p.type}`),
])

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
/** PF2e: the damage's type ('' untyped), whether a spell dealt it, and Shield Block. */
const pf2e = computed(() => props.card.system === 'pf2e')
const dmgType = ref('')
const fromSpell = ref(false)
const block = ref(false)
const shieldUp = computed(() => !!props.live.shield?.name?.trim() && !!props.live.shield.raised)
watch(shieldUp, (up) => up || (block.value = false))
const { send } = useSendHeroHp()
const sent = ref('')
const uid = useId()
function resetDamage() {
  amount.value = null
  crit.value = false
  fromSpell.value = false
  block.value = false
}
watch(
  () => props.characterId,
  () => {
    resetDamage()
    dmgType.value = ''
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
  const typed = pf2e.value
    ? { type: dmgType.value, spell: fromSpell.value, shieldBlock: block.value && shieldUp.value }
    : {}
  if (!(await send(id, name, sign * n, isCrit, typed))) return
  resetDamage()
  const kind = sign < 0 && typed.type ? ` ${typed.type}` : ''
  const how = [
    isCrit ? 'crit' : '',
    typed.spell ? 'spell' : '',
    typed.shieldBlock ? 'Shield Block' : '',
  ]
    .filter(Boolean)
    .join(', ')
  const what = sign < 0 ? `${n}${kind} damage${how ? ` (${how})` : ''}` : `heal ${n}`
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
      <div v-if="pf2e" class="hc__ctl hc__typed">
        <label class="sr-only" :for="`${uid}-type`">Damage type</label>
        <select :id="`${uid}-type`" v-model="dmgType" class="input hc__type">
          <option value="">Untyped</option>
          <option v-for="t in PF2E_DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <button
          type="button"
          class="btn btn--ghost btn--sm hc__toggle"
          :aria-pressed="fromSpell"
          title="A spell dealt it (for resistances to spells)"
          @click="fromSpell = !fromSpell"
        >
          Spell
        </button>
        <button
          v-if="shieldUp"
          type="button"
          class="btn btn--ghost btn--sm hc__toggle"
          :aria-pressed="block"
          title="The hero Shield Blocks: their sheet checks the feat, the damage and the reaction"
          @click="block = !block"
        >
          Shield Block
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
        <b>{{ live.ac ?? '—' }}</b>
        <span>{{ features.nimbleHero ? 'Armor' : 'AC' }}</span>
      </div>
      <div class="hc__tile">
        <b>{{ card.speed || '—' }}</b>
        <span>Speed</span>
      </div>
      <div class="hc__tile">
        <b>{{ sign(init) }}</b>
        <span>{{ initiativeLabel(card.system) }}</span>
      </div>
    </div>

    <BattleConditionPicker
      v-if="controls"
      :name="card.name"
      :subject="characterId"
      :conditions="shownConditions"
      :values="live.conditionValues"
      :persistent="card.system === 'pf2e' ? live.persistent : undefined"
      :note="
        features.nimbleHero
          ? `Saved to ${card.name}'s sheet; it ends on its usual timing, or when you remove it.`
          : `Saved to ${card.name}'s sheet until you remove it.`
      "
      @toggle="toggleCondition"
      @persistent="setPersistent"
    />
    <div v-else>
      <span class="hc__sect">Conditions</span>
      <ul v-if="shownLabels.length" class="hc__chips">
        <li v-for="c in shownLabels" :key="c">
          {{ c }}
        </li>
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

  // Temp HP over the right end, as on HeroBasic, apart from the three bands.
  &--temp {
    background: var(--temp-hp);
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

.hc__typed {
  flex-wrap: wrap;
}

.hc__type {
  flex: 1 1 110px;
  min-width: 0;
  text-transform: capitalize;
}

.hc__toggle[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--page-text);
  font-weight: 700;
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
