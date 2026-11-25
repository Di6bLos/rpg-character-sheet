<script setup lang="ts">
// The PF2e sheet's damage, healing and dying controls (Player Core pp. 410–411): an amount
// to take (Crit, and Shield Block while a shield is raised) or heal; dying, wounded and
// doomed steppers; the recovery check and Heroic Recovery while dying. Rules in utils/pf2ePlay.ts.
import type { Pf2eSheet } from '~/types/sheets'
import { rollDie } from '~/utils/dice'
import {
  deathAt,
  heal,
  heroicRecovery,
  isDead,
  recoveryCheck,
  shieldBroken,
  takeDamage,
} from '~/utils/pf2ePlay'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)

const amount = ref<number | null>(null)
const crit = ref(false)
const block = ref(false)
const canBlock = computed(
  () => !!sheet.value.shield.name && sheet.value.shield.raised && !shieldBroken(sheet.value),
)
watch(canBlock, (ok) => !ok && (block.value = false))

const dead = computed(() => isDead(sheet.value))
const dying = computed(() => sheet.value.dying > 0 && !dead.value)

function hurt() {
  if (!canEdit.value || !amount.value) return
  say(takeDamage(sheet.value, amount.value, { crit: crit.value, shieldBlock: block.value }))
  amount.value = null
  crit.value = false
  block.value = false
}

function mend() {
  if (!canEdit.value || !amount.value || dead.value) return
  say(heal(sheet.value, amount.value))
  amount.value = null
}

function recover() {
  if (canEdit.value) say(recoveryCheck(sheet.value, rollDie(20)))
}

function heroic() {
  if (canEdit.value) say(heroicRecovery(sheet.value))
}

type Track = 'dying' | 'wounded' | 'doomed'
const TRACKS: { key: Track; label: string; max: number }[] = [
  { key: 'dying', label: 'Dying', max: 4 },
  { key: 'wounded', label: 'Wounded', max: 4 },
  { key: 'doomed', label: 'Doomed', max: 4 },
]
const value = (k: Track) => sheet.value[k] ?? 0
function adjust(k: Track, by: number) {
  if (!canEdit.value) return
  sheet.value[k] = Math.max(0, Math.min(4, value(k) + by))
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
        {{ deathAt(sheet) }}. Roll a recovery check (DC {{ 10 + sheet.dying }}) at the start of your
        turn.
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
      <label
        v-if="canBlock"
        class="check"
        title="Your raised shield takes up to its Hardness, then you both take the rest"
      >
        <input v-model="block" type="checkbox" :disabled="!canEdit" />
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
