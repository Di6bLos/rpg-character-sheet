<script setup lang="ts">
// A 5e hero on the battle board (left column; the phone's Hero tab), the Nimble Hero's twin,
// top to bottom: who they are, HP and death saves (HeroHp), AC / Speed / Initiative / Passive
// Perception / Proficiency, the turn's economy on the phone (its one-row turn bar has no room),
// Concentration with End, spell slots and the limited uses with −/+, conditions with
// Exhaustion's level and the effects on the hero (Edit opens the sheet's own Conditions
// panel), the six abilities with their saves, and Short / Long Rest. Runs inside HeroScope's
// sheet editor with the 5e sheet's own rules (useDnd5eVitals, utils/dnd5ePlay.ts); read-only
// when the player can't edit. On touch every one-tap control is a 44px target.
import type { Dnd5eAbility, Dnd5eSheet } from '~/types/sheets'
import { abilityMod, sign } from '~/utils/dice'
import { exhaustionOf } from '~/utils/dnd5eConditions'
import { DND5E_ABILITY_NAME } from '~/utils/dnd5eBuild'
import { endConcentration, restoreUses, saveRow, spendUses, usesLeft } from '~/utils/dnd5ePlay'
import { levelName, pactLeft, slotsLeft, slotsMax } from '~/utils/dnd5eSpells'

defineProps<{ compact?: boolean }>()

const { draft, canEdit, portrait, say } = useSheet<Dnd5eSheet>()
const { touch } = useBoardLayout()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const {
  dead,
  ac,
  tiles: vitalTiles,
  diceLeft,
  typing,
  hitDie,
  shortOpen,
  longOpen,
  confirmShort,
  confirmLong,
  toggleInspiration,
  resultIn,
} = useDnd5eVitals()
const { model: turn } = useDnd5eTurnSteps({ onResult: useAnnounce() })

const identity = computed(() =>
  [[sheet.value.lineage, sheet.value.class].filter(Boolean).join(' '), `Lvl ${level.value}`]
    .filter(Boolean)
    .join(' · '),
)

const SHORT: Record<string, string> = {
  Initiative: 'Init',
  'Passive Perception': 'Passive',
  Proficiency: 'Prof',
}
const tiles = computed(() => [
  {
    label: 'AC',
    value: String(ac.value.value),
    title: ac.value.lines.join('\n'),
    changed: ac.value.changed,
  },
  ...vitalTiles.value.map((t) => ({
    label: SHORT[t.label] ?? t.label,
    value: t.value.replace(/ ft$/, ''),
    title: t.why || t.sub,
    changed: t.changed,
  })),
])

// --- Concentration, slots and limited uses -------------------------------------------
function stopConcentrating() {
  if (!canEdit.value) return
  const name = endConcentration(sheet.value)
  if (name) say(`You stop concentrating on ${name}.`)
}

const slots = computed(() => {
  const max = slotsMax(sheet.value)
  const left = slotsLeft(sheet.value)
  const rows = max
    .map((n, i) => ({ key: `L${i + 1}`, label: levelName(i + 1), max: n, left: left[i] ?? 0 }))
    .filter((r) => r.max > 0)
  const pact = sheet.value.castingStats?.pact
  if (pact && pact.slots > 0)
    rows.push({
      key: 'pact',
      label: `Pact (${levelName(pact.level)})`,
      max: pact.slots,
      left: pactLeft(sheet.value),
    })
  return rows
})

const PIPS = 8
const resources = computed(() =>
  (sheet.value.resources ?? []).map((r) => ({
    name: r.name,
    max: r.max,
    left: usesLeft(sheet.value, r.name),
  })),
)

function stepUse(name: string, by: number) {
  if (!canEdit.value) return
  if (by < 0) spendUses(sheet.value, name, 1)
  else restoreUses(sheet.value, name, 1)
}

// --- Conditions and effects ----------------------------------------------------------
const conditionsOpen = ref(false)
const chips = computed(() => [
  ...sheet.value.conditions.map((c) => ({
    key: `c:${c}`,
    label: c === 'Exhaustion' ? `Exhaustion ${exhaustionOf(sheet.value)}` : c,
    status: false,
  })),
  ...(sheet.value.effects ?? []).map((e) => ({ key: `e:${e.key}`, label: e.name, status: true })),
])

// --- Abilities and saves -------------------------------------------------------------
const ABILITIES: Dnd5eAbility[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const abilities = computed(() =>
  ABILITIES.map((k) => {
    const save = saveRow(sheet.value, level.value, k)
    return {
      k,
      mod: sign(abilityMod(sheet.value.abilities[k])),
      save: save.test.fail ? 'fails' : sign(save.test.bonus),
      prof: save.prof > 0,
      title: `${DND5E_ABILITY_NAME[k]} ${sheet.value.abilities[k]} · save ${save.test.fail ? 'fails' : sign(save.test.bonus)}${save.prof > 0 ? ' (proficient)' : ''}`,
    }
  }),
)
</script>

<template>
  <section class="panel hero" :class="{ 'hero--touch': touch }" aria-label="Your hero">
    <header class="hero__id">
      <UiAvatar
        :name="draft.name"
        :src="portrait"
        :class-slug="sheet.classSlug || null"
        :dead="dead"
        :size="38"
      />
      <div class="hero__who">
        <h2 class="hero__name">
          {{ draft.name }}<span v-if="dead" class="hero__dead"> (dead)</span>
        </h2>
        <div class="hero__sub">{{ identity }}</div>
      </div>
    </header>

    <BattleDnd5eHeroHp />

    <div class="hero__tiles hero__tiles--five">
      <UiTooltip v-for="t in tiles" :key="t.label" :title="`${t.label} ${t.value}`" :text="t.title">
        <div class="hero__tile" tabindex="0">
          <b :class="{ 'is-changed': t.changed }">{{ t.value }}</b>
          <span>{{ t.label }}</span>
        </div>
      </UiTooltip>
    </div>

    <div v-if="compact" class="hero__block">
      <span class="sect">This turn · {{ turn.leftText }}</span>
      <BattleDnd5eEconomy :turn="turn" compact />
      <span v-if="turn.note" class="hero__note">{{ turn.note }}</span>
    </div>

    <div v-if="sheet.concentration" class="hero__conc">
      <span
        >Concentrating on <strong>{{ sheet.concentration.name }}</strong></span
      >
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="stopConcentrating"
      >
        End
      </button>
    </div>

    <div v-if="slots.length" class="hero__block">
      <span class="sect">Spell slots</span>
      <div v-for="s in slots" :key="s.key" class="hero__res">
        <span>{{ s.label }}</span>
        <span
          class="hero__pips"
          role="img"
          :aria-label="`${s.left} of ${s.max} ${s.label} slots left`"
        >
          <i v-for="n in s.max" :key="n" :class="{ on: n <= s.left }" />
        </span>
      </div>
    </div>

    <div v-if="resources.length" class="hero__block">
      <span class="sect">Limited uses</span>
      <div v-for="r in resources" :key="r.name" class="hero__res">
        <span class="hero__res-name">{{ r.name }}</span>
        <span class="hero__res-ctl">
          <span
            v-if="r.max <= PIPS"
            class="hero__pips"
            role="img"
            :aria-label="`${r.left} of ${r.max} left`"
          >
            <i v-for="n in r.max" :key="n" :class="{ on: n <= r.left }" />
          </span>
          <b v-else>{{ r.left }}/{{ r.max }}</b>
          <button
            type="button"
            class="step hero__mini"
            :aria-label="`Spend one ${r.name}`"
            :disabled="!canEdit || r.left < 1"
            @click="stepUse(r.name, -1)"
          >
            −
          </button>
          <button
            type="button"
            class="step hero__mini"
            :aria-label="`Get one ${r.name} back`"
            :disabled="!canEdit || r.left >= r.max"
            @click="stepUse(r.name, 1)"
          >
            +
          </button>
        </span>
      </div>
    </div>

    <div class="hero__block">
      <div class="hero__head">
        <span class="sect">Conditions</span>
        <button
          type="button"
          class="btn btn--ghost btn--sm hero__add"
          :disabled="!canEdit"
          @click="conditionsOpen = true"
        >
          Edit
        </button>
      </div>
      <div v-if="chips.length" class="hero__chips">
        <span
          v-for="c in chips"
          :key="c.key"
          class="hero__chip"
          :class="c.status ? 'hero__chip--status' : 'hero__chip--set'"
          >{{ c.label }}</span
        >
      </div>
      <p v-else class="hero__none">No conditions</p>
      <UiDialog v-model="conditionsOpen" title="Conditions" width="560px">
        <Dnd5eSheetConditions />
      </UiDialog>
    </div>

    <div class="hero__block">
      <span class="sect">Abilities &amp; saves</span>
      <div class="hero__stats hero__stats--six">
        <div
          v-for="s in abilities"
          :key="s.k"
          class="hero__stat"
          :class="{ 'hero__stat--adv': s.prof }"
          :title="s.title"
        >
          <b>{{ s.mod }}</b>
          <span>{{ s.k }}{{ s.prof ? ' ✦' : '' }} {{ s.save }}</span>
        </div>
      </div>
    </div>

    <div class="hero__block">
      <span class="sect">Rest · Hit Point Dice {{ diceLeft }}/{{ level }} d{{ sheet.hitDie }}</span>
      <div class="hero__rest">
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit || diceLeft < 1 || dead"
          :title="`Roll a d${sheet.hitDie} + CON and heal that much (at least 1), as on a Short Rest (SRD 5.2.1 p. 186)`"
          @click="hitDie()"
        >
          Spend a Hit Die
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="shortOpen = true"
        >
          Short Rest
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="longOpen = true"
        >
          Long Rest
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :aria-pressed="!!sheet.heroicInspiration"
          title="Heroic Inspiration: spend it to reroll any die (SRD 5.2.1 p. 8)"
          :disabled="!canEdit"
          @click="toggleInspiration"
        >
          Inspiration
        </button>
      </div>
      <NimbleDiceEntry
        v-if="typing === 'hd'"
        :label="`d${sheet.hitDie} you rolled`"
        action="Heal"
        :disabled="!canEdit"
        @submit="hitDie"
      />
      <p v-if="resultIn('vit:rest')" class="hero__note" role="status">{{ resultIn('vit:rest') }}</p>
    </div>

    <UiDialog v-model="shortOpen" title="Take a Short Rest?" width="460px">
      <p>
        An hour of rest (SRD 5.2.1 p. 186). Spend Hit Point Dice to heal with “Spend a Hit Die” ({{
          diceLeft
        }}
        left). Features that recharge on a Short Rest and Pact Magic slots come back.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="shortOpen = false">Not yet</button>
        <button type="button" class="btn" @click="confirmShort">Rest</button>
      </template>
    </UiDialog>
    <UiDialog v-model="longOpen" title="Take a Long Rest?" width="460px">
      <p>
        Eight hours (SRD 5.2.1 p. 186): all HP and all spent Hit Point Dice, spell slots and limited
        uses come back, temporary HP go, Exhaustion drops by 1, and Concentration ends.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="longOpen = false">Not yet</button>
        <button type="button" class="btn" @click="confirmLong">Rest</button>
      </template>
    </UiDialog>
  </section>
</template>

<style scoped lang="scss">
@use '../../../assets/styles/battle-hero';

.hero__tiles--five {
  grid-template-columns: repeat(5, minmax(0, 1fr));

  .hero__tile {
    height: 100%;
  }
}

.hero__stats--six {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.hero__note {
  margin: 0;
  font-size: 12px;
  color: var(--page-soft);
}

.hero__conc,
.hero__res,
.hero__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.hero__conc {
  padding: 6px 10px;
  border-radius: min(var(--radius-control), 8px);
  border: 1px solid var(--secondary);
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
}

.hero__res-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero__res-ctl {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.hero__pips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;

  i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--line-strong);

    &.on {
      background: var(--secondary);
      border-color: var(--secondary);
    }
  }
}

.hero__mini {
  width: 24px;
  height: 24px;
  font-size: 14px;

  &:disabled {
    opacity: 1;
    color: var(--page-muted);
  }
}

.hero__add {
  min-height: 26px;
  padding: 0 8px;
  font-size: 12px;
}

.hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.hero__chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  font-size: 12px;
  font-weight: 600;

  &--set {
    background: var(--warn-bg);
    color: var(--warn-text);
    border-color: var(--accent);
  }

  &--status {
    background: color-mix(in srgb, var(--secondary) 16%, transparent);
    border-color: var(--secondary);
    color: var(--page-text);
  }
}

.hero__none {
  margin: 0;
  font-size: 12px;
  color: var(--page-muted);
}

.hero__rest {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .btn[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--warn-bg);
    color: var(--warn-text);
  }
}

// --- Touch: 44px targets, 8px apart; the HP block's controls too. -----------------------
.hero--touch {
  gap: 10px;
  padding: 12px 14px;

  .hero__mini,
  :deep(.hp__mini),
  :deep(.hp__ctl .step) {
    width: 44px;
    height: 44px;
    font-size: 18px;
  }

  .hero__res-ctl,
  .hero__rest,
  :deep(.hp__ctl),
  :deep(.hp__tempctl) {
    gap: 8px;
  }

  :deep(.hp__amt) {
    min-height: 44px;
    padding-inline: 4px;
    font-size: 16px;

    &::placeholder {
      font-size: 13px;
    }
  }

  .hero__add,
  .hero__conc .btn,
  .hero__rest .btn,
  :deep(.hp__crit),
  :deep(.hp__notice .btn) {
    min-height: 44px;
  }
}
</style>
