<script setup lang="ts">
// Vitals panel of the 5e sheet, laid out like Nimble's: HP with Crit (and Uncanny Dodge or
// Deflect Attacks while the hero has them) for the next damage, the draggable bar (temp HP
// first; halving, Deflect and Heavy Armor Master in the preview) and a temp HP stepper; the AC
// badge with its breakdown; death saves beside the Hit Point Dice and Heroic Inspiration;
// Speed, Initiative, Proficiency and Passive Perception; conditions; typed damage folded;
// Short and Long Rest. Damage and healing go through utils/dnd5ePlay.ts (SRD 5.2.1 pp. 16–18).
// The logic is useDnd5eVitals, shared with the battle board's hero column.
import { DND5E_DAMAGE_TYPES } from '~/utils/dnd5ePlay'

const {
  canEdit,
  resultIn,
  sheet,
  level,
  dead,
  dying,
  stable,
  hpTone,
  crit,
  dodge,
  deflect,
  reactionReady,
  canUncanny,
  canDeflect,
  takes,
  concDc,
  hurt,
  mend,
  changeHp,
  adjustTemp,
  hpState,
  ac,
  typing,
  rollDeath,
  rollConcentration,
  hitDie,
  setSaves,
  tiles,
  amount,
  dmgType,
  typedHurt,
  typedHeal,
  revive,
  stable5e,
  shortOpen,
  longOpen,
  diceLeft,
  confirmShort,
  confirmLong,
  toggleInspiration,
} = useDnd5eVitals()
</script>

<template>
  <section class="panel stack" aria-labelledby="vit-h">
    <UiFold name="Vitals" />
    <div class="title-help">
      <h2 id="vit-h">Vitals</h2>
      <UiHelp
        label="About HP and dying"
        text="Damage takes temporary HP first; resistance halves it, vulnerability doubles it (SRD 5.2.1 p. 16). At 0 HP you're Unconscious and make a death save at the start of each turn: 10 or more succeeds, three successes make you Stable, three failures kill you; a 20 gives back 1 HP and a 1 counts twice. Damage at 0 HP is a failure, two from a Critical Hit; damage left over that reaches your HP maximum kills outright (pp. 17–18). Drag the bar or use the arrow keys to preview a change; let go or press Enter to apply it."
      />
    </div>

    <div v-if="dead" class="notice notice--error dead-notice" role="alert">
      <strong>Your hero has died.</strong>
      <button
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        title="Revivify, Raise Dead and the like: back at 1 HP"
        @click="revive"
      >
        Resurrect
      </button>
    </div>
    <div v-else-if="dying" class="notice notice--error" role="alert">
      <strong>Unconscious at 0 HP.</strong> Roll a death save at the start of each of your turns;
      any healing brings you back.
    </div>

    <div class="vit-top">
      <div class="tile vit-block">
        <div class="vit-row">
          <div class="row" style="gap: 10px; flex-wrap: wrap">
            <div class="caps">Hit points</div>
            <label
              class="crit"
              title="Your next damage is from a Critical Hit (two death save failures at 0 HP)"
            >
              <input v-model="crit" type="checkbox" :disabled="!canEdit" />
              Crit
            </label>
            <label
              v-if="canUncanny"
              class="crit crit--react"
              :title="
                reactionReady
                  ? 'Your Reaction: halve the next attack’s damage (SRD 5.2.1 p. 63)'
                  : 'Reaction used'
              "
            >
              <input v-model="dodge" type="checkbox" :disabled="!canEdit || !reactionReady" />
              Uncanny Dodge
            </label>
            <label
              v-if="canDeflect"
              class="crit crit--react"
              :title="
                reactionReady
                  ? 'Your Reaction: cut the next attack’s damage by 1d10 + DEX + Monk level (SRD 5.2.1 p. 51)'
                  : 'Reaction used'
              "
            >
              <input v-model="deflect" type="checkbox" :disabled="!canEdit || !reactionReady" />
              Deflect
            </label>
          </div>
          <div class="row" style="gap: 8px">
            <button
              type="button"
              class="step"
              aria-label="Take 1 damage"
              :disabled="!canEdit"
              @click="hurt(1)"
            >
              −
            </button>
            <div class="hp-value" aria-live="polite">
              {{ sheet.hp }}<span> / {{ sheet.hpMax }}</span>
            </div>
            <button
              type="button"
              class="step"
              aria-label="Heal 1"
              :disabled="!canEdit || dead"
              @click="mend(1)"
            >
              +
            </button>
          </div>
        </div>
        <SheetHpBar
          :hp="sheet.hp"
          :max="sheet.hpMax"
          :temp="sheet.tempHp"
          :tone="hpTone"
          :disabled="!canEdit || dead"
          :takes="takes"
          @change="changeHp"
        />
        <div class="vit-row">
          <span class="hint">{{ hpState }}</span>
          <div class="row" style="gap: 6px">
            <span class="temp-label">Temp HP</span>
            <button
              type="button"
              class="step step--xs"
              aria-label="Lower temp HP"
              :disabled="!canEdit"
              @click="adjustTemp(-1)"
            >
              −
            </button>
            <span class="temp-value" aria-live="polite">{{ sheet.tempHp ?? 0 }}</span>
            <button
              type="button"
              class="step step--xs"
              aria-label="Raise temp HP"
              :disabled="!canEdit"
              @click="adjustTemp(1)"
            >
              +
            </button>
          </div>
        </div>
      </div>
      <div class="tile armor">
        <UiTooltip :title="`AC ${ac.value}`" :text="ac.lines.join('\n')">
          <span class="armor__badge" tabindex="0">
            <svg class="armor__shield" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6Z" />
            </svg>
            <span class="armor__value" :class="{ 'is-changed': ac.changed }">{{ ac.value }}</span>
          </span>
        </UiTooltip>
        <span class="armor__label">AC</span>
      </div>
    </div>

    <div v-if="concDc !== null && sheet.concentration" class="notice conc" role="status">
      <span
        >Concentration on <strong>{{ sheet.concentration.name }}</strong
        >: CON save DC {{ concDc }}.</span
      >
      <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="rollConcentration()">
        Roll the save
      </button>
      <button type="button" class="btn btn--quiet btn--sm" @click="concDc = null">Skip</button>
    </div>
    <NimbleDiceEntry
      v-if="typing === 'conc'"
      label="d20 you rolled for Concentration"
      action="Save"
      :disabled="!canEdit"
      @submit="rollConcentration"
    />

    <div class="tile vit-pair">
      <div class="vit-col vit-col--wounds">
        <div class="vit-head">
          <span class="caps">Death saves</span>
          <span class="hint">{{ stable ? 'Stable' : dying ? 'Dying' : 'Not needed' }}</span>
        </div>
        <div class="death-row">
          <span class="death-label">Successes</span>
          <div class="row" style="gap: 6px" role="group" aria-label="Death save successes">
            <button
              v-for="n in 3"
              :key="n"
              type="button"
              class="wound wound--ok"
              :aria-label="`Success ${n}`"
              :aria-pressed="(sheet.deathSaves?.successes ?? 0) >= n"
              :disabled="!canEdit"
              @click="setSaves('successes', n)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.6"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M5 12l5 5 9-10" />
              </svg>
            </button>
          </div>
        </div>
        <div class="death-row">
          <span class="death-label">Failures</span>
          <div class="row" style="gap: 6px" role="group" aria-label="Death save failures">
            <button
              v-for="n in 3"
              :key="n"
              type="button"
              class="wound"
              :aria-label="`Failure ${n}`"
              :aria-pressed="(sheet.deathSaves?.failures ?? 0) >= n"
              :disabled="!canEdit"
              @click="setSaves('failures', n)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div v-if="dying" class="row" style="gap: 6px; flex-wrap: wrap">
          <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="rollDeath()">
            Death save
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit"
            title="An ally's DC 10 Wisdom (Medicine) check or Spare the Dying"
            @click="stable5e"
          >
            Stabilize
          </button>
        </div>
        <NimbleDiceEntry
          v-if="typing === 'death'"
          label="d20 you rolled for the death save"
          action="Death save"
          :disabled="!canEdit"
          @submit="rollDeath"
        />
      </div>
      <div class="vit-col">
        <div class="vit-head">
          <span class="caps">Hit Point Dice</span>
          <span class="hint">{{ diceLeft }} / {{ level }} d{{ sheet.hitDie }}</span>
        </div>
        <div class="row" style="gap: 5px; flex-wrap: wrap" aria-hidden="true">
          <i v-for="n in level" :key="n" class="hd" :class="{ on: n <= diceLeft }" />
        </div>
        <button
          type="button"
          class="btn btn--ghost btn--sm hd-btn"
          :disabled="!canEdit || diceLeft < 1 || dead"
          :title="`Roll a d${sheet.hitDie} + CON and heal that much (at least 1), as on a Short Rest (SRD 5.2.1 p. 186)`"
          @click="hitDie()"
        >
          Spend a Hit Die
        </button>
        <NimbleDiceEntry
          v-if="typing === 'hd'"
          :label="`d${sheet.hitDie} you rolled`"
          action="Heal"
          :disabled="!canEdit"
          @submit="hitDie"
        />
        <label
          class="crit insp"
          title="Heroic Inspiration: spend it to reroll any die (SRD 5.2.1 p. 8)"
        >
          <input
            type="checkbox"
            :checked="!!sheet.heroicInspiration"
            :disabled="!canEdit"
            @change="toggleInspiration"
          />
          Heroic Inspiration
        </label>
      </div>
    </div>

    <p v-if="resultIn('vit:hp')" class="roll-status" role="status" aria-live="polite">
      {{ resultIn('vit:hp') }}
    </p>

    <div class="vitals vitals--four">
      <div v-for="v in tiles" :key="v.label" class="tile">
        <div class="tile__label">{{ v.label }}</div>
        <UiTooltip :title="`${v.label} ${v.value}`" :text="v.why">
          <div class="tile__value" :class="{ 'is-changed': v.changed }" tabindex="0">
            {{ v.value }}
          </div>
        </UiTooltip>
        <div class="hint" style="font-size: 11px">{{ v.sub }}</div>
      </div>
    </div>

    <Dnd5eSheetConditions />

    <details class="vit-more">
      <summary>Typed damage &amp; healing</summary>
      <form class="hurt" @submit.prevent="typedHurt">
        <label class="sr-only" for="d5-amount">Damage or healing</label>
        <input
          id="d5-amount"
          v-model.number="amount"
          class="input hurt__n"
          type="number"
          inputmode="numeric"
          min="1"
          placeholder="HP"
          :disabled="!canEdit"
        />
        <label class="sr-only" for="d5-dmg-type">Damage type</label>
        <select
          id="d5-dmg-type"
          v-model="dmgType"
          class="input hurt__type"
          :disabled="!canEdit"
          title="Damage type, for your resistances and immunities"
        >
          <option value="">Untyped</option>
          <option v-for="t in DND5E_DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <button type="submit" class="btn btn--sm" :disabled="!canEdit || !amount">Damage</button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit || !amount || dead"
          @click="typedHeal"
        >
          Heal
        </button>
      </form>
      <p class="hint">
        Resistances: {{ sheet.defenses?.resistances.join(', ') || 'none' }}. Crit and Uncanny Dodge
        beside Hit points apply here too.
      </p>
    </details>

    <div class="rest">
      <button type="button" class="btn btn--ghost" :disabled="!canEdit" @click="shortOpen = true">
        Short Rest
      </button>
      <button type="button" class="btn btn--ghost" :disabled="!canEdit" @click="longOpen = true">
        Long Rest
      </button>
    </div>
    <p v-if="resultIn('vit:rest')" class="roll-status" role="status" aria-live="polite">
      {{ resultIn('vit:rest') }}
    </p>

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
@use '../../assets/styles/sheet-vitals';

.crit--react input {
  accent-color: var(--secondary);
}

.insp {
  margin-top: 4px;
}

.hd-btn {
  align-self: flex-start;
}

.death-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.death-label {
  min-width: 72px;
  font-size: 12px;
  font-weight: 600;
  color: var(--page-soft);
}

.wound--ok[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

.conc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.vitals--four {
  grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr));
}

.vit-more {
  border-top: 1px solid var(--track);
  padding-top: 8px;

  > summary {
    min-height: 36px;
    display: flex;
    align-items: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--page-soft);
    cursor: pointer;
  }

  > .hint {
    margin: 6px 0 0;
  }
}

.hurt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.hurt__n {
  width: 96px;
}

.hurt__type {
  width: auto;
  min-width: 120px;
}

.rest {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .btn {
    flex: 1 1 140px;
  }
}

@media (pointer: coarse) {
  .vit-more > summary {
    min-height: 44px;
  }
}
</style>
