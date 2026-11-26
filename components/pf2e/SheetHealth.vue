<script setup lang="ts">
// The PF2e sheet's damage, healing and dying controls (Player Core pp. 407–411): an amount
// to take with its damage type (for immunities, weaknesses and resistances, p. 408), Crit,
// From a spell (when a resistance cares), and Shield Block while a shield is raised (with the
// feat, against physical damage, spending the reaction: Player Core p. 262), or heal;
// dying, wounded and doomed steppers; the recovery check and Heroic Recovery while dying.
// Rules in utils/pf2ePlay.ts and utils/pf2eDamage.ts.
import type { Pf2eSheet } from '~/types/sheets'
import { rollCheck, showOutcome } from '~/utils/dice'
import { PF2E_DAMAGE_TYPES, defensesOf } from '~/utils/pf2eDamage'
import { baseDeathAt } from '~/utils/pf2eEffects'
import {
  degreeOf,
  deathAt,
  heal,
  heroicRecovery,
  isDead,
  recoveryCheck,
  recoveryDc,
  shieldBlockProblem,
  takeDamage,
} from '~/utils/pf2ePlay'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)

const amount = ref<number | null>(null)
const crit = ref(false)
const block = ref(false)
/** The damage's type ('' untyped) and whether a spell dealt it, for the hero's defenses. */
const dmgType = ref('')
const fromSpell = ref(false)
const spellMatters = computed(() =>
  defensesOf(sheet.value, draft.value.level).resistances.some((r) => /spell/i.test(r.type)),
)
/** A resistance to one tradition's spells (Superstition) asks which tradition dealt it. */
const traditionMatters = computed(() =>
  defensesOf(sheet.value, draft.value.level).resistances.some((r) =>
    /\b(?:arcane|divine|occult|primal) spells?\b/i.test(r.type),
  ),
)
const tradition = ref('')
/** Shield Block needs the feat, physical damage and the reaction (Player Core p. 262). */
const shieldUp = computed(() => !!sheet.value.shield.name && sheet.value.shield.raised)
const blockProblem = computed(() => shieldBlockProblem(sheet.value, [dmgType.value]))
watch(blockProblem, (why) => why && (block.value = false))

const dead = computed(() => isDead(sheet.value))
const dying = computed(() => sheet.value.dying > 0 && !dead.value)

function hurt() {
  if (!canEdit.value || !amount.value) return
  say(
    takeDamage(sheet.value, amount.value, {
      crit: crit.value,
      shieldBlock: block.value,
      type: dmgType.value,
      spell: fromSpell.value,
      ...(fromSpell.value && tradition.value ? { tradition: tradition.value } : {}),
    }),
  )
  amount.value = null
  crit.value = false
  block.value = false
  fromSpell.value = false
}

function mend() {
  if (!canEdit.value || !amount.value || dead.value) return
  say(heal(sheet.value, amount.value))
  amount.value = null
}

/** The recovery check is a flat check (p. 411): the tray shows the die and its degree. */
function recover() {
  if (!canEdit.value) return
  const dc = recoveryDc(sheet.value)
  const r = rollCheck(0)
  const line = recoveryCheck(sheet.value, r.d20)
  const degree = degreeOf(r.d20, r.d20, dc)
  showOutcome({ label: 'Recovery check', total: r.d20, detail: line, degree })
  say(line)
}

function heroic() {
  if (canEdit.value) say(heroicRecovery(sheet.value))
}

type Track = 'dying' | 'wounded' | 'doomed'
// Diehard lets dying reach 5 (Player Core p. 254).
const TRACKS = computed<{ key: Track; label: string; max: number }[]>(() => [
  { key: 'dying', label: 'Dying', max: baseDeathAt(sheet.value) },
  { key: 'wounded', label: 'Wounded', max: 4 },
  { key: 'doomed', label: 'Doomed', max: 4 },
])
const value = (k: Track) => sheet.value[k] ?? 0
function adjust(k: Track, by: number) {
  if (!canEdit.value) return
  const max = TRACKS.value.find((t) => t.key === k)?.max ?? 4
  sheet.value[k] = Math.max(0, Math.min(max, value(k) + by))
}
</script>

<template>
  <div class="health stack">
    <div v-if="dead" class="notice notice--error" role="alert">
      <strong>Dying {{ sheet.dying }}: your hero has died.</strong>
      <template v-if="sheet.doomed">
        Doomed {{ sheet.doomed }} brought death to dying {{ deathAt(sheet) }}.</template
      >
    </div>
    <div v-else-if="dying" class="notice notice--error dying" role="alert">
      <span>
        <strong>Dying {{ sheet.dying }}</strong> — unconscious; you die at dying
        {{ deathAt(sheet) }}. Roll a recovery check (DC {{ recoveryDc(sheet) }}) at the start of
        your turn.
      </span>
      <span class="row" style="gap: 6px">
        <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="recover">
          Recovery check
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit || sheet.heroPoints < 1"
          :title="
            sheet.heroPoints < 1
              ? 'No Hero Points left'
              : 'Spend all your Hero Points to stabilize at 0 HP'
          "
          @click="heroic"
        >
          Heroic recovery
        </button>
      </span>
    </div>

    <form class="hurt" @submit.prevent="hurt">
      <label class="sr-only" for="pf-amount">Damage or healing</label>
      <input
        id="pf-amount"
        v-model.number="amount"
        class="input hurt__n"
        type="number"
        inputmode="numeric"
        min="1"
        placeholder="HP"
        :disabled="!canEdit"
      />
      <label class="sr-only" for="pf-dmg-type">Damage type</label>
      <select
        id="pf-dmg-type"
        v-model="dmgType"
        class="input hurt__type"
        :disabled="!canEdit"
        title="Damage type, for your immunities, weaknesses and resistances"
      >
        <option value="">Untyped</option>
        <option v-for="t in PF2E_DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
      <button type="submit" class="btn btn--sm" :disabled="!canEdit || !amount">Damage</button>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit || !amount || dead"
        :title="dead ? 'Your hero has died' : undefined"
        @click="mend"
      >
        Heal
      </button>
      <label class="check">
        <input v-model="crit" type="checkbox" :disabled="!canEdit" />
        Crit
      </label>
      <label v-if="spellMatters" class="check" title="A resistance of yours is to spells">
        <input v-model="fromSpell" type="checkbox" :disabled="!canEdit" />
        From a spell
      </label>
      <template v-if="fromSpell && traditionMatters">
        <label class="sr-only" for="pf-dmg-tradition">The spell's tradition</label>
        <select id="pf-dmg-tradition" v-model="tradition" class="input hurt__type">
          <option value="">Tradition?</option>
          <option v-for="t in ['Arcane', 'Divine', 'Occult', 'Primal']" :key="t" :value="t">
            {{ t }}
          </option>
        </select>
      </template>
      <label
        v-if="shieldUp"
        class="check"
        :title="
          blockProblem ||
          'Your reaction: the raised shield takes up to its Hardness, then you both take the rest'
        "
      >
        <input v-model="block" type="checkbox" :disabled="!canEdit || !!blockProblem" />
        Shield Block
      </label>
    </form>

    <div class="tracks">
      <div
        v-for="t in TRACKS"
        :key="t.key"
        class="track"
        role="group"
        :aria-label="`${t.label} ${value(t.key)}`"
      >
        <span class="track__label">{{ t.label }}</span>
        <button
          type="button"
          class="step step--xs"
          :aria-label="`Lower ${t.label.toLowerCase()}`"
          :disabled="!canEdit || value(t.key) === 0"
          @click="adjust(t.key, -1)"
        >
          −
        </button>
        <strong aria-live="polite">{{ value(t.key) }}</strong>
        <button
          type="button"
          class="step step--xs"
          :aria-label="`Raise ${t.label.toLowerCase()}`"
          :disabled="!canEdit || value(t.key) >= t.max"
          @click="adjust(t.key, 1)"
        >
          +
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.health {
  gap: 10px;
}

.dying {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.hurt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.hurt__n {
  width: 96px;
}

.hurt__type {
  width: auto;
  min-width: 120px;
  text-transform: capitalize;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  min-height: 36px;

  input {
    accent-color: var(--accent);
  }
}

.tracks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.track {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;

  strong {
    min-width: 1ch;
    text-align: center;
  }
}

.track__label {
  font-weight: 600;
  color: var(--page-soft);
}
</style>
