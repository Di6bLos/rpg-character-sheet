<script setup lang="ts">
// The 5e sheet's resources, as Nimble's SheetResources shows mana and the class resource: each
// limited use (Rage, Channel Divinity, Focus Points, Sorcery Points, Superiority Dice, Lay on
// Hands…) with what's left, when it comes back and −/+; Font of Magic's conversions (SRD 5.2.1
// p. 66), Arcane Recovery (p. 77) and Magical Cunning (p. 72) beside theirs; a use bought back
// with a slot or another resource where a feature allows it; and Concentration,
// its own panel while the hero concentrates (p. 179). Rules in utils/dnd5ePlay.ts and
// utils/dnd5eSpells.ts.
import type { Dnd5eSheet } from '~/types/sheets'
import { dnd5eHero, endConcentration, restoreUses, spendUses, usesLeft } from '~/utils/dnd5ePlay'
import {
  FONT_COST,
  SORCERY_POINTS,
  arcaneRecovery,
  levelName,
  magicalCunning,
  type Dnd5eRestoreCost,
  pointsToSlot,
  restoreCost,
  restoreSlots,
  restoreUse,
  slotToPoints,
  slotsLeft,
  slotsMax,
} from '~/utils/dnd5eSpells'

const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim, resultIn } = useResultOwner()
const { entries } = useDnd5eSheet()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)

/**
 * What gives each resource a use back early: its feature's `restore` (a level 5 slot, a
 * Superiority Die), Font of Inspiration's spell slot for Bardic Inspiration (SRD 5.2.1 p. 34),
 * Mystic Focus's slot for Focus Points by its level, Wild Resurgence's slot for Wild Shape.
 */
const restores = computed(() => {
  const hero = dnd5eHero(sheet.value, level.value)
  const out: Record<string, Dnd5eRestoreCost> = {}
  for (const e of entries.value) {
    const c = e.resource === e.name ? restoreCost(e.restore) : null
    if (c && !out[e.name]) out[e.name] = c
  }
  if (hero.has('Font of Inspiration')) out['Bardic Inspiration'] = { slot: 1, n: 1 }
  if (hero.has('Mystic Focus')) out['Monk’s Focus'] = { slot: 1, n: 1, perLevel: true }
  if (hero.has('Wild Resurgence')) out['Wild Shape'] = { slot: 1, n: 1 }
  return out
})
const restoreAt = ref<Record<string, number>>({})

function restoreLabel(c: Dnd5eRestoreCost) {
  if (c.slot === 'pact') return 'a Pact slot'
  if (c.slot) return c.slot > 1 ? `a level ${c.slot}+ slot` : 'a spell slot'
  return `${c.n} ${c.resource}`
}

function restore(name: string) {
  const c = restores.value[name]
  if (!canEdit.value || !c) return
  const at = restoreAt.value[name] ?? restoreSlots(sheet.value, c)[0]
  run(name, restoreUse(sheet.value, name, c, at))
}

const RECHARGE = { short: 'Short Rest', long: 'Long Rest', dawn: 'dawn', turn: 'turn' }
const resources = computed(() =>
  (sheet.value.resources ?? []).map((r) => ({
    ...r,
    left: usesLeft(sheet.value, r.name),
    back: `${RECHARGE[r.recharge]}${r.short ? ` (${r.short === 'all' ? 'all' : r.short} on a Short Rest)` : ''}`,
  })),
)

function step(name: string, by: number) {
  if (!canEdit.value) return
  if (by < 0) spendUses(sheet.value, name, 1)
  else restoreUses(sheet.value, name, 1)
}

function run(key: string, line: string) {
  claim(`res:${key}`, () => say(line))
}

const slotLevels = computed(() =>
  slotsMax(sheet.value)
    .map((n, i) => ({ level: i + 1, max: n, left: slotsLeft(sheet.value)[i] ?? 0 }))
    .filter((x) => x.max > 0),
)
const fontSlot = ref(1)
const recover = ref<number[]>([])
const recoveryBudget = computed(() => Math.ceil(level.value / 2))

function toggleRecover(l: number) {
  const i = recover.value.indexOf(l)
  recover.value = i >= 0 ? recover.value.filter((_, k) => k !== i) : [...recover.value, l]
}

function doRecovery() {
  if (!canEdit.value) return
  run('Arcane Recovery', arcaneRecovery(sheet.value, level.value, recover.value))
  recover.value = []
}

function stopConcentrating() {
  if (!canEdit.value) return
  const name = endConcentration(sheet.value)
  if (name) claim('res:conc', () => say(`You stop concentrating on ${name}.`))
}
</script>

<template>
  <div v-if="resources.length || sheet.concentration" class="stack" style="gap: 24px; min-width: 0">
    <section v-if="sheet.concentration" class="panel stack is-on" aria-labelledby="conc-h">
      <UiFold name="Concentration" />
      <div class="panel-title" style="margin: 0">
        <span class="title-help">
          <h2 id="conc-h">Concentration</h2>
          <UiHelp
            label="About Concentration"
            text="One spell at a time. It ends when you cast another Concentration spell, have the Incapacitated condition or die; damage asks for a Constitution save, DC 10 or half the damage, up to 30 (SRD 5.2.1 p. 179)."
          />
        </span>
        <span class="badge badge--outline">{{ levelName(sheet.concentration.level) }}</span>
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap">
        <strong>{{ sheet.concentration.name }}</strong>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="stopConcentrating"
        >
          End Concentration
        </button>
      </div>
      <p v-if="resultIn('res:conc')" class="roll-status" role="status">
        {{ resultIn('res:conc') }}
      </p>
    </section>

    <Dnd5eWildShape v-if="resources.some((r) => r.name === 'Wild Shape')" />

    <section v-if="resources.length" class="panel stack" aria-labelledby="res-h">
      <UiFold name="Resources" />
      <div class="title-help">
        <h2 id="res-h">Resources</h2>
        <UiHelp
          label="About resources"
          text="Your limited uses and when they come back. Using a feature in Actions, Reactions or Attacks spends them; −/+ fixes a count by hand."
        />
      </div>
      <div class="res-grid">
        <div v-for="r in resources" :key="r.name" class="tile res">
          <div class="res__head">
            <strong>{{ r.name }}</strong>
            <small class="muted">{{ r.from }}</small>
          </div>
          <div class="row" style="gap: 8px">
            <button
              type="button"
              class="step step--xs"
              :aria-label="`Spend one ${r.name}`"
              :disabled="!canEdit || r.left < 1"
              @click="step(r.name, -1)"
            >
              −
            </button>
            <span
              v-if="r.max <= 10"
              class="pips"
              role="img"
              :aria-label="`${r.left} of ${r.max} left`"
            >
              <i v-for="n in r.max" :key="n" class="pip-dot" :class="{ on: n <= r.left }" />
            </span>
            <strong class="res__n" aria-live="polite">{{ r.left }} / {{ r.max }}</strong>
            <button
              type="button"
              class="step step--xs"
              :aria-label="`Get one ${r.name} back`"
              :disabled="!canEdit || r.left >= r.max"
              @click="step(r.name, 1)"
            >
              +
            </button>
          </div>
          <small class="muted">{{ r.dice ? `${r.dice} · ` : '' }}back on a {{ r.back }}</small>

          <div v-if="restores[r.name]" class="font">
            <select
              v-if="restoreSlots(sheet, restores[r.name]!).length > 1"
              class="input input--sm"
              :aria-label="`Slot to spend on ${r.name}`"
              :value="restoreAt[r.name] ?? restoreSlots(sheet, restores[r.name]!)[0]"
              @change="
                restoreAt = {
                  ...restoreAt,
                  [r.name]: Number(($event.target as HTMLSelectElement).value),
                }
              "
            >
              <option v-for="l in restoreSlots(sheet, restores[r.name]!)" :key="l" :value="l">
                {{ levelName(l) }} slot
              </option>
            </select>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit || r.left >= r.max"
              :title="`Spend ${restoreLabel(restores[r.name]!)} to get a use back`"
              @click="restore(r.name)"
            >
              Restore with {{ restoreLabel(restores[r.name]!) }}
            </button>
          </div>

          <div v-if="r.name === SORCERY_POINTS && slotLevels.length" class="font">
            <label class="sr-only" for="font-slot">Slot level</label>
            <select id="font-slot" v-model.number="fontSlot" class="input input--sm">
              <option
                v-for="s in slotLevels.filter((x) => x.level <= 5)"
                :key="s.level"
                :value="s.level"
              >
                {{ levelName(s.level) }} ({{ s.left }} left · {{ FONT_COST[s.level] }} SP)
              </option>
            </select>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit"
              @click="run(r.name, slotToPoints(sheet, fontSlot))"
            >
              Slot → points
            </button>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit"
              @click="run(r.name, pointsToSlot(sheet, fontSlot))"
            >
              Points → slot
            </button>
          </div>

          <div v-if="r.name === 'Arcane Recovery'" class="font">
            <span class="small">Regain up to {{ recoveryBudget }} levels of slots:</span>
            <button
              v-for="s in slotLevels.filter((x) => x.level < 6 && x.left < x.max)"
              :key="s.level"
              type="button"
              class="chip"
              :aria-pressed="recover.includes(s.level)"
              :disabled="!canEdit"
              @click="toggleRecover(s.level)"
            >
              {{ levelName(s.level) }}
            </button>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit || !recover.length || r.left < 1"
              @click="doRecovery"
            >
              Recover
            </button>
          </div>

          <button
            v-if="r.name === 'Magical Cunning'"
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit || r.left < 1 || !sheet.pactUsed"
            @click="run(r.name, magicalCunning(sheet))"
          >
            Regain Pact slots
          </button>
          <p v-if="resultIn(`res:${r.name}`)" class="roll-status" role="status">
            {{ resultIn(`res:${r.name}`) }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.is-on {
  border: 1.5px solid var(--accent);
}

.res-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 8px;
}

.res {
  gap: 8px;
  padding: 14px;
}

.res__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.res__n {
  font-variant-numeric: tabular-nums;
}

.pips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--secondary);

  &.on {
    background: var(--secondary);
  }
}

.font {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;

  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
}
</style>
