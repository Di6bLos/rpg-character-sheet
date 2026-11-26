<script setup lang="ts">
// PF2e sheet, laid out like the Nimble sheet: identity (portrait, name, the identity and
// details lines, the six attribute tiles), then the play panels in Nimble's two columns
// (components/pf2e/Sheet*.vue), then Feats & features.
import type { Pf2eAttr, Pf2eSheet } from '~/types/sheets'
import { rollCheck, showOutcome, sign } from '~/utils/dice'
import { type Pf2eStatContext, SAVE_ATTR, adjusted, degreeOf, isDead } from '~/utils/pf2ePlay'
import { shiftedDegree } from '~/utils/pf2eEffects'
import { NOT_YOUR_TURN, cantAct, offTurn } from '~/utils/pf2eActions'
import { PF2E_RANK_NAME } from '~/utils/heroCardStats'

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

const saveContext = (label: string): Pf2eStatContext =>
  label === 'Perception'
    ? { kind: 'perception', attr: 'WIS' }
    : label === 'Class DC'
      ? { kind: 'classDc', attr: sheet.value.keyAttr }
      : { kind: 'save', attr: SAVE_ATTR[label], save: label as 'Fortitude' | 'Reflex' | 'Will' }
const saves = computed(() =>
  sheet.value.saves.map((x) => ({
    ...x,
    now: adjusted(sheet.value, x.value, saveContext(x.label)),
  })),
)
const skills = computed(() =>
  sheet.value.skills.map((x) => ({
    ...x,
    now: adjusted(sheet.value, x.value, { kind: 'skill', attr: x.attr, skill: x.name }),
  })),
)

const natNote = (n: number | null) => (n === 20 ? ', natural 20' : n === 1 ? ', natural 1' : '')

/** A check with this modifier; the dice tray shows the die, modifier and total. */
function check(name: string, bonus: number) {
  const r = rollCheck(bonus)
  const line = `${name}: ${r.total} (${r.d20} ${sign(bonus)}${natNote(r.natural)})`
  showOutcome({ label: name, total: r.total, detail: line })
  say(line)
}

/** The DC of the effect the hero is saving against, for the save's degree. */
const saveDc = ref<number | null>(null)

/**
 * A saving throw: with a DC it says the degree of success (p. 401) after the hero's
 * upgrades (Juggernaut: a success is a critical success), and notes the ones that hold only
 * against some effects (Bravery against fear).
 */
function rollSave(label: string, bonus: number) {
  if (label !== 'Fortitude' && label !== 'Reflex' && label !== 'Will') return check(label, bonus)
  const r = rollCheck(bonus)
  const head = `${label}: ${r.total} (${r.d20} ${sign(bonus)}${natNote(r.natural)})`
  const dc = saveDc.value
  if (!dc) {
    showOutcome({ label, total: r.total, detail: head })
    return say(head)
  }
  const rolled = degreeOf(r.total, r.d20, dc)
  const shift = shiftedDegree(sheet.value, label, rolled)
  const by = shift.by ? ` → ${shift.degree} (${shift.by})` : ''
  const notes = shift.notes.length ? ` ${shift.notes.join('; ')}.` : ''
  const line = `${head} vs DC ${dc}: ${rolled}${by}.${notes}`
  const degree = shift.degree.replace(/^\w/, (c) => c.toUpperCase())
  showOutcome({ label: `${label} save`, total: r.total, detail: line, degree })
  say(line)
}

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
      <section class="panel stack" style="gap: 12px; order: 11" aria-labelledby="sk-h">
        <UiFold name="Skills" />
        <div class="title-help" style="margin: 0">
          <h2 id="sk-h">Skills</h2>
          <UiHelp
            label="About skills and saves"
            text="A check is d20 + the modifier. Proficiency adds your level + 2 trained (T), 4 expert (E), 6 master (M), 8 legendary (L); untrained (U) adds nothing (Player Core p. 11). Saves and Perception come first; give a Save DC for the degree of success."
          />
        </div>
        <label class="target">
          Save DC
          <input
            v-model.number="saveDc"
            class="input"
            type="number"
            inputmode="numeric"
            min="0"
            placeholder="—"
            aria-describedby="save-dc-help"
          />
          <span id="save-dc-help" class="small muted">for the degree of success</span>
        </label>
        <div class="skills">
          <button
            v-for="x in saves.filter((v) => v.label !== 'Class DC')"
            :key="x.label"
            type="button"
            class="skill is-trained"
            :title="x.now.changed ? `${sign(x.value)} ${x.now.note}` : `Roll ${x.label}`"
            :aria-label="`Roll ${x.label} ${sign(x.now.value)}`"
            @click="claim('skills:save', () => rollSave(x.label, x.now.value))"
          >
            <span class="rank" :class="`rank--${x.rank}`" :title="PF2E_RANK_NAME[x.rank]">{{
              x.rank
            }}</span>
            <span class="skill__name">{{ x.label }}</span>
            <strong :class="{ 'is-changed': x.now.changed }">{{ sign(x.now.value) }}</strong>
          </button>
        </div>
        <div class="skills">
          <button
            v-for="x in skills"
            :key="x.name"
            type="button"
            class="skill"
            :class="{ 'is-trained': x.rank !== 'U' }"
            :title="x.now.changed ? `${sign(x.value)} ${x.now.note}` : `Roll ${x.name}`"
            :aria-label="`Roll ${x.name} ${sign(x.now.value)}`"
            @click="claim('skills:check', () => check(x.name, x.now.value))"
          >
            <span class="rank" :class="`rank--${x.rank}`" :title="PF2E_RANK_NAME[x.rank]">{{
              x.rank
            }}</span>
            <span class="skill__name"
              >{{ x.name }} <small>{{ x.attr }}</small></span
            >
            <strong :class="{ 'is-changed': x.now.changed }">{{ sign(x.now.value) }}</strong>
          </button>
        </div>
        <p v-if="resultIn('skills:')" class="roll-status" role="status" aria-live="polite">
          {{ resultIn('skills:') }}
        </p>
      </section>
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

.roll-value {
  border: 0;
  background: none;
  padding: 0;
  text-align: left;
  color: inherit;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
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

.rank {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  background: var(--track);
  color: var(--page-muted);
  font-family: Inter, system-ui, sans-serif;

  &--T {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--page-text);
    color: var(--page-text);
  }

  &--E {
    background: var(--secondary);
    color: var(--on-secondary);
  }

  &--M,
  &--L {
    background: var(--accent);
    color: var(--on-accent);
  }
}

.skills {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  column-gap: 20px;
}

.skill {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--track);
  background: none;
  font: inherit;
  font-size: 14px;
  text-align: left;
  color: var(--page-soft);
  cursor: pointer;

  &:hover .skill__name {
    text-decoration: underline;
  }

  &.is-trained {
    color: var(--page-text);

    .skill__name {
      font-weight: 600;
    }
  }

  strong {
    font-size: 15px;
    color: var(--page-text);
    font-variant-numeric: tabular-nums;
  }
}

.skill__name {
  flex: 1 1 auto;

  small {
    font-size: 11px;
    font-weight: 400;
    color: var(--page-muted);
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
