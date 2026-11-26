<script setup lang="ts">
// PF2e sheet, laid out like the Nimble sheet: identity (portrait, name, the identity and
// details lines, the six attribute tiles), then the play panels in Nimble's two columns
// (components/pf2e/Sheet*.vue), then Feats & features.
import type { Pf2eAttr, Pf2eSheet } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { isDead } from '~/utils/pf2ePlay'
import { NOT_YOUR_TURN, cantAct, offTurn } from '~/utils/pf2eActions'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
// The GM's HP and condition changes from the battle board.
useHeroHpChanges()
useHeroConditionChanges()
/** Results show in the panel that made them. */
const { claim, resultIn } = useResultOwner()
const sheet = computed(() => draft.value.sheet)

const ATTR_NAME: Record<Pf2eAttr, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}

const dead = computed(() => isDead(sheet.value))

const identityBits = computed(() =>
  [
    sheet.value.lineage,
    sheet.value.heritage,
    sheet.value.background,
    sheet.value.class,
    sheet.value.subclass,
    sheet.value.deity,
  ].filter((b) => b?.trim()),
)

const details = computed(() => [
  { label: 'Key attribute', value: ATTR_NAME[sheet.value.keyAttr] },
  {
    label: 'XP',
    value: `${sheet.value.xp.toLocaleString()} / ${sheet.value.xpNext.toLocaleString()}`,
  },
])

const attrs = computed(() =>
  (Object.keys(ATTR_NAME) as Pf2eAttr[]).map((k) => ({
    k,
    v: sign(sheet.value.attrs[k]),
    name: ATTR_NAME[k],
    key: sheet.value.keyAttr === k,
  })),
)

watch(
  () => draft.value.level,
  (level) => {
    if (canEdit.value && sheet.value.level !== level) sheet.value.level = level
  },
  { immediate: true },
)

const strikesApi = providePf2eStrikes()
providePf2eActions(strikesApi)
const { targetAc, damageFlags, conditionsOffered, strikes, nextAttack } = strikesApi
const turnActive = computed(() => !!sheet.value.turn?.active)

/**
 * Why a Strike can't be made now, or '': it takes one action on your turn (Player Core
 * p. 418), so off your turn in an encounter it waits ("Not your turn"); a finisher ends
 * your attacks for the turn.
 */
const strikeWhy = computed(() => {
  const s = sheet.value
  const stopped = cantAct(s)
  if (stopped) return stopped
  if (offTurn(s)) return NOT_YOUR_TURN
  const t = s.turn
  if (t?.active && t.finisher) return 'Finisher used'
  if (t?.active && t.actions < 1) return 'No actions left'
  return ''
})
const STRIKE_COST = { kind: 'actions', min: 1, max: 1 } as const

/** A Strike from the table: one action while the turn tracker runs (Player Core p. 418). */
function strikeFromTable(index: number, step: number) {
  if (!canEdit.value) return
  if (strikeWhy.value) return say(`Strike: ${strikeWhy.value}.`)
  const t = sheet.value.turn
  if (t?.active) t.actions -= 1
  strikesApi.attack(index, { map: step })
}
</script>

<template>
  <section class="identity" aria-label="Identity">
    <SheetPortrait placeholder="Portrait" class="id-portrait">
      <template v-if="dead" #overlay>
        <SheetDeadOverlay :name="draft.name" />
      </template>
    </SheetPortrait>
    <div class="identity__body">
      <div class="stack" style="gap: 8px">
        <div class="row" style="gap: 10px">
          <span class="badge badge--pf2e">Pathfinder 2e</span>
          <span class="small muted"><SheetCampaignLink /></span>
        </div>
        <h1>{{ draft.name }}<span v-if="dead" class="dead-tag"> (dead)</span></h1>
        <div class="identity__line">
          <span
            >Level <strong>{{ draft.level }}</strong></span
          >
          <template v-for="bit in identityBits" :key="bit">
            <span aria-hidden="true">·</span><span>{{ bit }}</span>
          </template>
        </div>
        <div class="identity__details">
          <span v-for="d in details" :key="d.label"
            >{{ d.label }} <strong>{{ d.value }}</strong></span
          >
        </div>
      </div>
      <div class="stats">
        <div v-for="a in attrs" :key="a.k" class="stat" :class="{ 'stat--key': a.key }">
          <div class="stat__k">
            {{ a.k }}<template v-if="a.key"> · <abbr title="Key attribute">KEY</abbr></template>
          </div>
          <div class="stat__v">{{ a.v }}</div>
          <div class="stat__save">{{ a.name }}</div>
        </div>
      </div>
    </div>
  </section>

  <div class="play">
    <div class="play__col">
      <Pf2eSheetVitals style="order: 1" />
      <Pf2eSheetSpells v-if="sheet.spellcasting || sheet.focusSpells?.length" style="order: 8" />
      <Pf2eSheetSpells
        v-for="c in sheet.archetypeCasting ?? []"
        :key="c.archetype"
        :archetype="c.archetype"
        style="order: 8"
      />
      <Pf2eSheetInventory style="order: 12" />
    </div>
    <div class="play__col">
      <Pf2eSheetTurn style="order: 2" />
      <section
        class="panel stack"
        :style="{ gap: '14px', order: turnActive ? 3 : 4 }"
        aria-labelledby="atk-h"
      >
        <UiFold name="Attacks" :open="turnActive" />
        <div class="panel-title" style="margin: 0">
          <div class="title-help">
            <h2 id="atk-h">Attacks</h2>
            <UiHelp
              label="About attacks"
              text="Each Strike takes 1 action. Its three buttons are the 1st, 2nd and 3rd attack of your turn: the multiple attack penalty is −5 and −10 (agile −4 and −8). With the target's AC the result says the degree: 10 or more over is a critical hit, a natural 20 or 1 moves it one step (Player Core pp. 401–402)."
            />
          </div>
          <label class="target">
            Target AC
            <input
              v-model.number="targetAc"
              class="input"
              type="number"
              inputmode="numeric"
              min="0"
              placeholder="—"
            />
          </label>
          <label v-if="conditionsOffered.includes('offGuard')" class="target">
            <input v-model="damageFlags.offGuard" type="checkbox" />
            Target off-guard
          </label>
          <label v-if="conditionsOffered.includes('huntedPrey')" class="target">
            <input v-model="damageFlags.huntedPrey" type="checkbox" />
            First hit on your prey this round
          </label>
          <label v-if="conditionsOffered.includes('stratagem')" class="target">
            <input v-model="damageFlags.stratagem" type="checkbox" />
            Devise a Stratagem (next Strike: INT to the attack)
          </label>
        </div>
        <div
          v-if="strikes.length"
          class="table-wrap"
          tabindex="0"
          role="region"
          aria-label="Table, scroll sideways for more"
        >
          <table class="table" style="min-width: 480px">
            <thead>
              <tr>
                <th scope="col">Strike</th>
                <th scope="col">Attack (MAP)</th>
                <th scope="col">Damage</th>
                <th scope="col">Traits</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(w, i) in strikes" :key="i">
                <td>
                  <div class="row" style="gap: 8px; flex-wrap: nowrap">
                    <strong>{{ w.name }}</strong>
                    <Pf2eCostPill :cost="STRIKE_COST" />
                  </div>
                </td>
                <td>
                  <button
                    v-if="strikeWhy && canEdit"
                    type="button"
                    class="atk atk--why"
                    disabled
                    :aria-label="`${w.name}: ${strikeWhy}`"
                  >
                    {{ strikeWhy }}
                  </button>
                  <div v-else class="row" style="gap: 6px; flex-wrap: nowrap">
                    <button
                      v-for="(a, n) in w.atks"
                      :key="n"
                      type="button"
                      class="atk"
                      :class="{
                        'atk--first': n === (turnActive ? nextAttack : 0),
                        'is-changed': w.changed,
                      }"
                      :title="w.changed ? w.note : undefined"
                      :aria-label="a.label"
                      :disabled="!canEdit"
                      @click="claim(`strike:${w.index}`, () => strikeFromTable(w.index, n))"
                    >
                      {{ a.text }}
                    </button>
                  </div>
                </td>
                <td>
                  <div class="row" style="gap: 6px; flex-wrap: nowrap">
                    <button
                      type="button"
                      class="dmg dmg-btn"
                      :class="{ 'is-changed': w.dmgChanged }"
                      :title="w.dmgChanged ? w.dmgNote : undefined"
                      :aria-label="`Roll damage for ${w.name}`"
                      @click="claim(`strike:${w.index}`, () => strikesApi.damage(w.index, false))"
                    >
                      {{ w.dmg }}
                    </button>
                    <button
                      type="button"
                      class="atk crit-btn"
                      :aria-label="`Roll critical damage for ${w.name}`"
                      :title="`Critical hit: double damage${w.critNote ? `, then ${w.critNote}` : ''}`"
                      @click="claim(`strike:${w.index}`, () => strikesApi.damage(w.index, true))"
                    >
                      ×2
                    </button>
                  </div>
                </td>
                <td>
                  <div class="row" style="gap: 6px">
                    <span v-for="t in w.traits" :key="t" class="trait">{{ t }}</span>
                    <button
                      v-if="w.twoHandDie"
                      type="button"
                      class="chip grip"
                      :aria-pressed="w.twoHands"
                      :title="`Two-hand: d${w.twoHandDie} damage dice while held in two hands`"
                      @click="strikesApi.toggleTwoHands(w.index)"
                    >
                      Two hands
                    </button>
                    <button
                      v-if="w.versatile"
                      type="button"
                      class="chip grip"
                      :aria-pressed="w.versatileOn"
                      :title="`Versatile: deal ${w.versatile.toLowerCase()} damage instead`"
                      @click="strikesApi.toggleVersatile(w.index)"
                    >
                      {{ w.versatile }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty">No strikes yet. Use “Edit sheet” to add one.</p>
        <p v-if="resultIn('strike:')" class="roll-status" role="status" aria-live="polite">
          {{ resultIn('strike:') }}
        </p>
      </section>
      <Pf2eSheetReactions :style="{ order: turnActive ? 4 : 3 }" />
      <Pf2eSheetResources style="order: 5" />
      <Pf2eSheetActions style="order: 6" />
      <Pf2eSheetSkills style="order: 11" />
    </div>
  </div>

  <section class="panel stack" style="gap: 12px" aria-labelledby="ft-h">
    <UiFold name="All abilities" />
    <h2 id="ft-h">Feats &amp; features</h2>
    <Pf2eSheetFeats />
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/sheet-layout';

.is-changed {
  color: var(--warn-text);
}

.target {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;

  .input {
    width: 80px;
  }
}

.atk {
  min-height: 40px;
  min-width: 52px;
  padding: 0 10px;
  border-radius: min(var(--radius-control), 8px);
  border: 1px solid var(--line);
  background: var(--field);
  color: var(--page-soft);
  font-weight: 700;
  font-size: 14px;
  font-variant-numeric: tabular-nums;

  &--first {
    border-color: var(--secondary);
    background: color-mix(in srgb, var(--secondary) 14%, var(--field));
    color: var(--page-text);
  }
}

.atk--why {
  font-weight: 600;
  font-size: 13px;
}

.dmg-btn {
  min-height: 40px;
  padding: 0 12px;
  border-radius: min(var(--radius-control), 8px);
  font-size: 14px;
}

.grip {
  min-height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

.trait {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--track);
  border: 1px solid var(--line);
  color: var(--page-soft);
}
</style>
