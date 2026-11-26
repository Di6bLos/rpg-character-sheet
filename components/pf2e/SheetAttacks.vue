<script setup lang="ts">
// The PF2e sheet's Attacks, laid out like Nimble's: the Target row (AC and the situations the
// hero's damage cares about), fortune / misfortune and the GM's circumstance bonus or penalty,
// then a Weapons group of cards, one per Strike: its traits and runes, cost, the chance of
// each degree against the target's AC (Player Core p. 401), damage, the 1st / 2nd / 3rd attack
// buttons for the multiple attack penalty (p. 402), Damage and Critical, and its result.
// With Manual dice the buttons ask for the dice and the app does the maths. Strikes from
// usePf2eStrikes; a Strike takes 1 action on your turn (p. 418).
import type { Pf2eSheet } from '~/types/sheets'
import { NOT_YOUR_TURN, cantAct, offTurn } from '~/utils/pf2eActions'
import { sign } from '~/utils/dice'
import { tipText } from '~/utils/ruleTips'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const { claim, resultFor } = useResultOwner()
const auth = useAuthStore()
const sheet = computed(() => draft.value.sheet)
const ownDice = computed(() => auth.profile?.own_dice ?? false)
const strikesApi = usePf2eStrikes()
const { strikes, nextAttack, situation, lastDegree, targetAc } = strikesApi
const turnActive = computed(() => !!sheet.value.turn?.active)

/** Attack and damage spells from the Spells panels, as Nimble's Attacks has a Spells group. */
const spellRegistry = usePf2eSpellAttacks()
const spellAttacks = computed(() => Object.values(spellRegistry.value).flat())
/** The hero's abilities that make a Strike (Sudden Charge, Double Slice), with their Use. */
const actions = usePf2eActions()
const strikeAbilities = computed(() =>
  actions.grouped.value
    .filter((g) => g.id !== 'reactions')
    .flatMap((g) => g.entries)
    .filter((e) => !!e.rules.strike),
)

const STRIKE_COST = { kind: 'actions', min: 1, max: 1 } as const
const ORD = ['1st', '2nd', '3rd']

/**
 * Why a Strike can't be made now, or '': off your turn in an encounter it waits ("Not your
 * turn"); a finisher ends your attacks for the turn; it needs an action left.
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

/** A roll waiting for the player's dice (Manual dice), by Strike. */
const pending = ref<{
  index: number
  kind: 'attack' | 'damage'
  step: number
  crit: boolean
} | null>(null)

function strike(index: number, step: number, d20?: number) {
  if (!canEdit.value) return
  if (strikeWhy.value) return say(`Strike: ${strikeWhy.value}.`)
  if (ownDice.value && d20 === undefined) {
    pending.value = { index, kind: 'attack', step, crit: false }
    return
  }
  claim(`strike:${index}`, () => {
    const t = sheet.value.turn
    if (t?.active) t.actions -= 1
    strikesApi.attack(index, { map: step, ...(d20 !== undefined ? { d20 } : {}) })
  })
}

function damage(index: number, crit: boolean, dice?: number[]) {
  if (!canEdit.value) return
  if (ownDice.value && !dice) {
    pending.value = { index, kind: 'damage', step: 0, crit }
    return
  }
  claim(`strike:${index}`, () => strikesApi.damage(index, crit, dice ? { dice } : {}))
}

function typed(values: number[]) {
  const p = pending.value
  if (!p) return
  pending.value = null
  if (p.kind === 'attack') strike(p.index, p.step, values[0])
  else damage(p.index, p.crit, values)
}

const pendingLabel = (index: number) => {
  const p = pending.value
  if (!p || p.index !== index) return ''
  if (p.kind === 'attack') return `d20 you rolled for the ${ORD[p.step]} attack`
  return `Dice you rolled: ${strikesApi.damageDice(index, p.crit).label}`
}

/** "vs AC 18: 55% hit · 5% crit" for the next attack, all three steps in its tooltip. */
function oddsText(w: (typeof strikes.value)[number]) {
  const a = w.atks[turnActive.value ? nextAttack.value : 0]?.chances
  return a && targetAc.value
    ? `vs AC ${targetAc.value}: ${a.hit + a.crit}% hit · ${a.crit}% crit`
    : ''
}
function oddsWhy(w: (typeof strikes.value)[number]) {
  return w.atks
    .map((a, i) => {
      const c = a.chances
      return c
        ? `${ORD[i]} (${a.text}): ${c.crit}% critical hit, ${c.hit}% hit, ${c.miss}% miss, ${c.fumble}% critical miss`
        : ''
    })
    .filter(Boolean)
    .join('\n')
}

const FORTUNE_CHIPS = [
  { key: 'fortune', label: 'Fortune' },
  { key: 'misfortune', label: 'Misfortune' },
] as const
const chips = computed(() =>
  FORTUNE_CHIPS.map((c) => ({ ...c, on: situation.value.fortune === c.key })),
)
const circumstance = computed(() => situation.value.bonus - situation.value.penalty)
/**
 * Nimble's Disadvantage and Advantage steppers, in PF2e terms: which attack of the turn the
 * next one is (the multiple attack penalty, p. 402) and the GM's circumstance bonus or
 * penalty (p. 400).
 */
const steppers = computed(() => [
  {
    key: 'map',
    label: 'Attack',
    hint: 'of the turn',
    value: nextAttack.value,
    min: 0,
    max: 2,
    text: ORD[nextAttack.value],
    title: 'Which attack of your turn the next Strike is: 2nd −5, 3rd −10 (agile −4, −8)',
  },
  {
    key: 'circumstance',
    label: 'Circumstance',
    hint: 'to the attack',
    value: circumstance.value,
    min: -4,
    max: 4,
    text: circumstance.value ? sign(circumstance.value) : '0',
    title: 'A circumstance bonus (Aid) or penalty the GM calls, until your turn starts or ends',
  },
])

function toggleChip(key: string) {
  const k = key as 'fortune' | 'misfortune'
  situation.value = { ...situation.value, fortune: situation.value.fortune === k ? 'normal' : k }
}

function step(key: string, by: number) {
  if (key === 'map') return strikesApi.setNextAttack(nextAttack.value + by)
  const v = Math.max(-4, Math.min(4, circumstance.value + by))
  situation.value = { ...situation.value, bonus: Math.max(0, v), penalty: Math.max(0, -v) }
}

/** A Strike's damage type and traits, each trait with its rules on hover (as Nimble's props). */
const traitParts = (w: (typeof strikes.value)[number]) => [
  ...(w.type ? [{ label: w.type.charAt(0).toUpperCase() + w.type.slice(1) }] : []),
  ...w.traits.map((t) => ({
    label: t.charAt(0).toUpperCase() + t.slice(1),
    title: t,
    text: traitText(t),
  })),
]

const { traitText, runeText } = usePf2eRuleTexts()

/** What makes up an attack's number: the sheet's bonus, then what changes it now, MAP. */
function attackWhy(w: (typeof strikes.value)[number], penalty: number) {
  const now = w.applied.reduce((n, m) => n + m.value, 0)
  return [
    `Attack ${sign(w.bonus - now)} on the sheet`,
    ...w.applied.map((m) => `${m.source} ${sign(m.value)} ${m.type}`),
    ...(penalty ? [`Multiple attack penalty −${penalty}`] : []),
  ].join('\n')
}

const critWanted = (index: number) => lastDegree.value[index] === 'critical success'
const hitWanted = (index: number) => lastDegree.value[index] === 'success'
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="atk-h">
    <UiFold name="Attacks" :open="turnActive" />
    <div class="title-help">
      <h2 id="atk-h">Attacks</h2>
      <UiHelp
        label="About attacks"
        text="Each Strike takes 1 action. Its three buttons are the 1st, 2nd and 3rd attack of your turn: the multiple attack penalty is −5 and −10 (agile −4 and −8, Player Core p. 402). With the target's AC the card shows the chance of each result and the roll says the degree: 10 or more over is a critical hit, a natural 20 or 1 moves it one step (p. 401). Roll Damage on a hit, Critical on a critical hit."
      />
    </div>
    <Pf2eTargetAc />
    <SheetSituation :chips="chips" :steppers="steppers" @toggle="toggleChip" @step="step" />
    <details v-if="strikes.length" class="atk-group" open>
      <summary>
        <span class="caps">Weapons</span>
        <span class="badge badge--outline">{{
          turnActive ? `Next: ${ORD[nextAttack]} attack` : 'Strike · 1 action'
        }}</span>
      </summary>
      <div class="attacks">
        <div v-for="w in strikes" :key="w.index" class="tile attack">
          <div class="attack__head">
            <div class="stack" style="gap: 2px">
              <strong style="font-size: 16px">{{ w.name }}</strong>
              <SheetRuleList class="muted" style="font-size: 12px" :parts="traitParts(w)" />
              <Pf2eCostPill :cost="STRIKE_COST" />
              <span
                v-if="oddsText(w)"
                class="odds"
                tabindex="0"
                :title="oddsWhy(w)"
                :aria-label="`${oddsText(w)}. ${oddsWhy(w)}`"
                >{{ oddsText(w) }}</span
              >
            </div>
            <SheetDmg
              :dmg="w.dice"
              :why="
                [
                  `${w.dice} ${w.type.toLowerCase()} damage`,
                  ...(w.dmgChanged ? w.dmgNote.split(', ') : []),
                ].join('\n')
              "
              style="font-size: 15px; white-space: nowrap"
            />
          </div>
          <p v-if="w.runes.length" class="small muted runes">
            Runes:
            <template v-for="(r, k) in w.runes" :key="r"
              >{{ k ? ', ' : ''
              }}<SheetRuleTip :title="r" :text="runeText(r)">{{ r }}</SheetRuleTip></template
            >
          </p>
          <div v-if="w.twoHandDie || w.versatile" class="grips">
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
          <UiTooltip
            :title="`${w.name}, ${ORD[nextAttack]} attack ${w.atks[nextAttack]?.text ?? ''}`"
            :text="attackWhy(w, w.atks[nextAttack]?.penalty ?? 0)"
          >
            <button
              type="button"
              class="btn"
              :disabled="!canEdit || !!strikeWhy"
              :aria-label="
                strikeWhy
                  ? `${w.name}: ${strikeWhy}`
                  : `${w.atks[nextAttack]?.label}, ${w.atks[nextAttack]?.text}`
              "
              @click="strike(w.index, nextAttack)"
            >
              <template v-if="strikeWhy">{{ strikeWhy }}</template>
              <template v-else
                >{{ ownDice ? 'Attack' : 'Roll' }} · {{ w.atks[nextAttack]?.text
                }}<template v-if="nextAttack"> ({{ ORD[nextAttack] }})</template></template
              >
            </button>
          </UiTooltip>
          <div class="maps">
            <button
              type="button"
              class="btn btn--sm"
              :class="{ 'btn--ghost': !hitWanted(w.index) }"
              :disabled="!canEdit"
              :aria-label="`Roll damage for ${w.name}`"
              @click="damage(w.index, false)"
            >
              Damage
            </button>
            <button
              type="button"
              class="btn btn--sm"
              :class="{ 'btn--ghost': !critWanted(w.index) }"
              :disabled="!canEdit"
              :aria-label="`Roll critical damage for ${w.name}`"
              :title="`Critical hit: double damage${w.critNote ? `, then ${w.critNote}` : ''}`"
              @click="damage(w.index, true)"
            >
              Critical
            </button>
          </div>
          <NimbleDiceEntry
            v-if="pendingLabel(w.index)"
            :label="pendingLabel(w.index)"
            :action="pending?.kind === 'attack' ? 'Attack' : 'Damage'"
            :disabled="!canEdit"
            @submit="typed"
          />
          <p v-if="resultFor(`strike:${w.index}`)" class="roll-status attack__result" role="status">
            {{ resultFor(`strike:${w.index}`) }}
          </p>
        </div>
      </div>
    </details>
    <p v-else class="empty">No strikes yet. Use “Edit sheet” to add one.</p>
    <details v-if="spellAttacks.length" class="atk-group" open>
      <summary>
        <span class="caps">Spells</span>
        <span class="badge badge--outline">Cast from your Spells</span>
      </summary>
      <div class="attacks">
        <div v-for="sp in spellAttacks" :key="sp.key" class="tile attack">
          <div class="attack__head">
            <div class="stack" style="gap: 2px">
              <strong style="font-size: 16px"
                ><SheetRuleTip :title="sp.name" :text="tipText(sp.text)">{{
                  sp.name
                }}</SheetRuleTip></strong
              >
              <span class="muted" style="font-size: 12px">{{ sp.group }} · {{ sp.line }}</span>
              <Pf2eCostPill :cost="sp.cost" />
            </div>
          </div>
          <button
            type="button"
            class="btn"
            :disabled="!canEdit || !!sp.why"
            :title="sp.why || undefined"
            @click="sp.cast()"
          >
            {{ sp.why || 'Cast' }}
          </button>
          <NimbleDiceEntry
            v-if="sp.prompt"
            :label="sp.prompt"
            action="Roll"
            :disabled="!canEdit"
            @submit="sp.typed"
          />
          <p v-if="resultFor(sp.key)" class="roll-status attack__result" role="status">
            {{ resultFor(sp.key) }}
          </p>
        </div>
      </div>
    </details>
    <details v-if="strikeAbilities.length" class="atk-group" open>
      <summary>
        <span class="caps">Abilities</span>
        <span class="badge badge--outline">Make a Strike</span>
      </summary>
      <div class="attacks">
        <Pf2eActionRow
          v-for="e in strikeAbilities"
          :key="e.key"
          :entry="e"
          :why="actions.why(e)"
          :left="actions.left(e)"
          :choices="actions.choicesFor(e)"
          :weapons="actions.weaponsFor(e)"
          :tiers="actions.tiersFor(e)"
          :dmg="actions.dmgPreview(e)"
          :result="resultFor(`act:${e.key}`)"
          @use="(st) => actions.act(e, st)"
          @damage="(crit, st) => actions.actDamage(e, crit, st)"
          :typed-label="actions.typedPrompt(e)"
          @typed="actions.typedSubmit"
        />
      </div>
    </details>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/attacks';

.traits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.odds {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: help;
}

.runes {
  margin: 0;
}

.grips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.grip {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
}

.maps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .btn {
    flex: 1 1 0;
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }

  small {
    font-weight: 500;
  }
}

@media (pointer: coarse) {
  .grip {
    min-height: 44px;
  }
}
</style>
