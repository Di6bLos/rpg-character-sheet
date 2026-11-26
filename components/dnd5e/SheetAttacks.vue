<script setup lang="ts">
// The 5e sheet's Attacks, laid out like Nimble's: the Target row (AC, resistance, Prone, an ally
// beside it), Advantage or Disadvantage the table calls, then folding groups of cards. Weapons
// (and the Unarmed Strike): properties and mastery with their rules on hover, the cost (one
// attack of the Attack action, or the Bonus Action off-hand), the chance to hit, damage with
// its types and what adds to it, grips (two hands, thrown, off-hand, long range), Sneak Attack,
// and Roll, which rolls the attack and its damage (utils/dnd5eAttacks.ts). Spells: attack and
// damage spells cast from here (useDnd5eCasting). Abilities: features that deal damage (Breath
// Weapon). On a hit: maneuvers, Arcane Shots and other riders that spend a die or use.
import type { Dnd5eSheet, Dnd5eWeapon } from '~/types/sheets'
import { showOutcome, sign } from '~/utils/dice'
import {
  type Dnd5eAttackPlan,
  type Dnd5eGrip,
  MASTERY_TEXT,
  WEAPON_PROPERTY_TEXT,
  damageText,
  damageWhy,
  hitChance,
  rollAttack5e,
  unarmedAttack,
  weaponAttack,
  weaponDef,
} from '~/utils/dnd5eAttacks'
import { costWhy, d20Mode, dnd5eHero, payCost } from '~/utils/dnd5ePlay'
import { levelName, spellCost } from '~/utils/dnd5eSpells'
import { tipText } from '~/utils/ruleTips'

const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim, resultFor } = useResultOwner()
const { data, columns, entries, target, attackMode } = useDnd5eSheet()
const casting = useDnd5eCasting()
const typed = useTypedRoll()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const turnActive = computed(() => !!sheet.value.turn?.active)

const grips = ref<Record<string, Dnd5eGrip>>({})
const sneakPick = ref<Record<string, boolean>>({})

function setGrip(key: string, part: keyof Dnd5eGrip) {
  const now = grips.value[key] ?? {}
  grips.value = { ...grips.value, [key]: { ...now, [part]: !now[part] } }
}

interface Card {
  key: string
  w: Dnd5eWeapon | null
  plan: Dnd5eAttackPlan
  props: { label: string; title?: string; text?: string }[]
  masteryName: string
  canGrip: { twoHands: boolean; thrown: boolean; offhand: boolean; long: boolean }
}

const cards = computed<Card[]>(() => {
  const seen = new Set<string>()
  const out: Card[] = []
  const t = target.value
  sheet.value.weapons.forEach((w, i) => {
    const id = `${w.name}|${w.slug ?? ''}`
    if (seen.has(id)) return
    seen.add(id)
    const key = `w:${i}`
    const def = weaponDef(w, data.value?.weapons ?? [])
    const plan = weaponAttack(sheet.value, level.value, w, def, {
      key,
      grip: grips.value[key] ?? {},
      target: t,
      columns: columns.value,
    })
    const props = def
      ? def.propertyText.map((p) => {
          const name = p.replace(/\s*\(.*$/, '')
          return { label: p, title: name, text: WEAPON_PROPERTY_TEXT[name] ?? '' }
        })
      : [{ label: w.range }]
    out.push({
      key,
      w,
      plan,
      props: [{ label: `${def?.category ?? ''} ${def?.type ?? ''}`.trim() || w.type }, ...props],
      masteryName: def?.mastery ?? '',
      canGrip: {
        twoHands: !!def?.properties.includes('Versatile'),
        thrown: !!def?.properties.includes('Thrown') && def.type === 'Melee',
        offhand: !!def?.properties.includes('Light'),
        long: !!def?.range,
      },
    })
  })
  const none = { twoHands: false, thrown: false, offhand: false, long: false }
  out.push({
    key: 'unarmed',
    w: null,
    plan: unarmedAttack(sheet.value, level.value, { target: t, columns: columns.value }),
    props: [{ label: 'Melee, 5 ft' }],
    masteryName: '',
    canGrip: none,
  })
  if (dnd5eHero(sheet.value, level.value).has('Martial Arts'))
    out.push({
      key: 'unarmed:bonus',
      w: null,
      plan: unarmedAttack(sheet.value, level.value, {
        target: t,
        columns: columns.value,
        bonusAction: true,
      }),
      props: [{ label: 'Bonus Action after the Attack action (Martial Arts)' }],
      masteryName: '',
      canGrip: none,
    })
  return out
})

const modeOf = (p: Dnd5eAttackPlan) => d20Mode(p.test, attackMode.value)
const sneakable = (p: Dnd5eAttackPlan) => p.extras.some((x) => x.once === 'sneak')
function sneakOn(c: Card) {
  if (!sneakable(c.plan)) return false
  const picked = sneakPick.value[c.key]
  if (picked !== undefined) return picked
  return modeOf(c.plan) === 'adv' || (!!target.value.allyNear && modeOf(c.plan) !== 'dis')
}

function oddsText(p: Dnd5eAttackPlan) {
  const ac = target.value.ac
  if (ac === null) return ''
  const c = hitChance(p.test.bonus, ac, modeOf(p), p.critOn)
  return `vs AC ${ac}: ${c.hit}% hit · ${c.crit}% crit`
}

function oddsWhy(p: Dnd5eAttackPlan) {
  return [
    ...p.test.lines,
    ...p.test.dice.map((d) => `${d.label} ${d.dice}`),
    ...p.test.adv.map((a) => `Advantage: ${a}`),
    ...p.test.dis.map((d) => `Disadvantage: ${d}`),
    ...(attackMode.value !== 'normal'
      ? [`Your call: ${attackMode.value === 'adv' ? 'Advantage' : 'Disadvantage'}`]
      : []),
  ].join('\n')
}

const modeLabel = (p: Dnd5eAttackPlan) => {
  const m = modeOf(p)
  return m === 'adv' ? 'Advantage' : m === 'dis' ? 'Disadvantage' : ''
}

function attack(c: Card) {
  if (!canEdit.value) return
  const why = costWhy(sheet.value, c.plan.cost)
  if (why) return claim(c.key, () => say(`${c.plan.name}: ${why}.`))
  const sneak = sneakOn(c)
  typed.run(c.key, c.plan.name, () => {
    payCost(sheet.value, level.value, c.plan.cost)
    const r = rollAttack5e(sheet.value, c.plan, {
      mode: attackMode.value,
      target: target.value,
      sneak,
    })
    claim(c.key, () => say(r.line))
    showOutcome({ label: c.plan.name, total: r.damage, detail: r.line })
  })
  attackMode.value = 'normal'
  delete sneakPick.value[c.key]
}

const MODES = [
  { key: 'adv', label: 'Advantage' },
  { key: 'dis', label: 'Disadvantage' },
] as const
const chips = computed(() => MODES.map((m) => ({ ...m, on: attackMode.value === m.key })))
function toggleMode(key: string) {
  attackMode.value = attackMode.value === key ? 'normal' : (key as 'adv' | 'dis')
}

const spellAttacks = computed(() =>
  casting.spells.value.filter((r) => {
    const d = casting.defOf(r.slug)
    return d && !r.book && (d.attack || d.damage?.length) && !!casting.damage(r)
  }),
)
const abilities = computed(() => entries.value.filter((e) => e.attack))
const riders = computed(() =>
  entries.value.filter((e) => e.kind === 'option' && !!e.resource && e.cost === 'special'),
)
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="atk-h">
    <UiFold name="Attacks" :open="turnActive" />
    <div class="title-help">
      <h2 id="atk-h">Attacks</h2>
      <UiHelp
        label="About attacks"
        text="Roll makes the attack roll and its damage together (SRD 5.2.1 p. 16). The Attack action makes all your Extra Attacks; the first one takes the action. A natural 20, or your crit range, is a Critical Hit: every damage die rolls twice. With the target's AC each card shows its chance to hit and the roll says hit or miss. Advantage and Disadvantage cancel each other (p. 6); a Light weapon's off-hand attack is a Bonus Action without your modifier (p. 89)."
      />
    </div>
    <Dnd5eTargetAc />
    <SheetSituation chips-label="Next attack" :chips="chips" :steppers="[]" @toggle="toggleMode" />

    <details class="atk-group" open>
      <summary>
        <span class="caps">Weapons</span>
        <span class="badge badge--outline">{{
          turnActive && sheet.turn?.attacks
            ? `${sheet.turn.attacks} more in this Attack`
            : 'Attack action'
        }}</span>
      </summary>
      <div class="attacks">
        <div v-for="c in cards" :key="c.key" class="tile attack">
          <div class="attack__head">
            <div class="stack" style="gap: 2px">
              <strong style="font-size: 16px">{{ c.plan.name }}</strong>
              <SheetRuleList class="muted" style="font-size: 12px" :parts="c.props" />
              <span class="row" style="gap: 8px; flex-wrap: wrap">
                <Dnd5eCostPill :cost="c.plan.cost" />
                <SheetRuleTip
                  v-if="c.masteryName"
                  :title="`${c.masteryName}${c.plan.mastery ? '' : ' (no mastery)'}`"
                  :text="MASTERY_TEXT[c.masteryName as keyof typeof MASTERY_TEXT]"
                  chip
                  ><span class="mastery" :class="{ 'mastery--off': !c.plan.mastery }">{{
                    c.masteryName
                  }}</span></SheetRuleTip
                >
              </span>
              <UiTooltip
                v-if="oddsText(c.plan) || modeLabel(c.plan)"
                :title="`${c.plan.name} ${sign(c.plan.test.bonus)}`"
                :text="oddsWhy(c.plan)"
              >
                <span class="odds" tabindex="0">{{
                  [oddsText(c.plan), modeLabel(c.plan)].filter(Boolean).join(' · ')
                }}</span>
              </UiTooltip>
            </div>
            <SheetDmg
              :dmg="damageText(c.plan, { sneak: sneakOn(c) })"
              :why="damageWhy(c.plan).join('\n')"
              style="font-size: 14px; text-align: right"
            />
          </div>
          <div v-if="Object.values(c.canGrip).some(Boolean) || sneakable(c.plan)" class="grips">
            <button
              v-if="c.canGrip.twoHands"
              type="button"
              class="chip grip"
              :aria-pressed="!!grips[c.key]?.twoHands"
              title="Versatile: the bigger damage die in two hands"
              @click="setGrip(c.key, 'twoHands')"
            >
              Two hands
            </button>
            <button
              v-if="c.canGrip.thrown"
              type="button"
              class="chip grip"
              :aria-pressed="!!grips[c.key]?.thrown"
              title="Thrown: a ranged attack with the same ability"
              @click="setGrip(c.key, 'thrown')"
            >
              Thrown
            </button>
            <button
              v-if="c.canGrip.offhand"
              type="button"
              class="chip grip"
              :aria-pressed="!!grips[c.key]?.offhand"
              title="Light: the extra attack with a second Light weapon (a Bonus Action, or part of the Attack action with Nick)"
              @click="setGrip(c.key, 'offhand')"
            >
              Off-hand
            </button>
            <button
              v-if="c.canGrip.long || grips[c.key]?.thrown"
              type="button"
              class="chip grip"
              :aria-pressed="!!grips[c.key]?.long"
              title="Beyond normal range: Disadvantage"
              @click="setGrip(c.key, 'long')"
            >
              Long range
            </button>
            <button
              v-if="sneakable(c.plan)"
              type="button"
              class="chip grip"
              :aria-pressed="sneakOn(c)"
              title="Sneak Attack, once a turn: with Advantage, or an ally within 5 ft of the target and no Disadvantage"
              @click="sneakPick = { ...sneakPick, [c.key]: !sneakOn(c) }"
            >
              Sneak Attack
            </button>
          </div>
          <button
            type="button"
            class="btn"
            :disabled="!canEdit || !!costWhy(sheet, c.plan.cost)"
            :aria-label="`${c.plan.name}: ${costWhy(sheet, c.plan.cost) || `attack ${sign(c.plan.test.bonus)}`}`"
            @click="attack(c)"
          >
            {{
              costWhy(sheet, c.plan.cost) ||
              `${sheet.ownDice ? 'Attack' : 'Roll'} · ${sign(c.plan.test.bonus)}`
            }}
          </button>
          <NimbleDiceEntry
            v-if="typed.prompt(c.key)"
            :label="typed.prompt(c.key)"
            action="Roll"
            :disabled="!canEdit"
            @submit="typed.submit"
          />
          <p v-if="resultFor(c.key)" class="roll-status attack__result" role="status">
            {{ resultFor(c.key) }}
          </p>
        </div>
      </div>
    </details>

    <details v-if="spellAttacks.length" class="atk-group" open>
      <summary>
        <span class="caps">Spells</span>
        <span class="badge badge--outline">Cast from here or Spells</span>
      </summary>
      <div class="attacks">
        <div v-for="r in spellAttacks" :key="r.slug" class="tile attack">
          <div class="attack__head">
            <div class="stack" style="gap: 2px">
              <strong style="font-size: 16px"
                ><SheetRuleTip
                  :title="r.name"
                  :text="
                    tipText(casting.defOf(r.slug)?.text ?? casting.defOf(r.slug)?.summary ?? '')
                  "
                  >{{ r.name }}</SheetRuleTip
                ></strong
              >
              <span class="muted" style="font-size: 12px"
                >{{ levelName(r.level) }} ·
                {{
                  casting.defOf(r.slug)?.attack
                    ? 'spell attack'
                    : `${casting.defOf(r.slug)?.save ?? ''} save`
                }}</span
              >
              <Dnd5eCostPill :cost="spellCost(casting.defOf(r.slug)!)" />
            </div>
            <SheetDmg :dmg="casting.damage(r)" style="font-size: 14px; text-align: right" />
          </div>
          <select
            v-if="casting.options(r).length > 1"
            class="input input--sm"
            :aria-label="`Cast ${r.name} with`"
            :value="casting.option(r)?.key"
            @change="casting.choose(r, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="o in casting.options(r)" :key="o.key" :value="o.key">
              {{ o.label }}{{ o.left !== undefined ? ` (${o.left} left)` : '' }}
            </option>
          </select>
          <button
            type="button"
            class="btn"
            :disabled="!canEdit || !!casting.why(r)"
            @click="casting.cast(r)"
          >
            {{ casting.why(r) || 'Cast' }}
          </button>
          <NimbleDiceEntry
            v-if="casting.typed.prompt(`spell:${r.slug}`)"
            :label="casting.typed.prompt(`spell:${r.slug}`)"
            action="Roll"
            :disabled="!canEdit"
            @submit="casting.typed.submit"
          />
          <p v-if="resultFor(`spell:${r.slug}`)" class="roll-status attack__result" role="status">
            {{ resultFor(`spell:${r.slug}`) }}
          </p>
        </div>
      </div>
    </details>

    <details v-if="abilities.length" class="atk-group" open>
      <summary>
        <span class="caps">Abilities</span>
        <span class="badge badge--outline">Deal damage</span>
      </summary>
      <div class="attacks">
        <Dnd5eEntryCard v-for="e in abilities" :key="e.key" :entry="e" />
      </div>
    </details>

    <details v-if="riders.length" class="atk-group" :open="turnActive">
      <summary>
        <span class="caps">On a hit</span>
        <span class="badge badge--outline">{{ riders[0]?.resource }}</span>
      </summary>
      <div class="attacks">
        <Dnd5eEntryCard v-for="e in riders" :key="e.key" :entry="e" compact />
      </div>
    </details>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/attacks';

.odds {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: help;
}

.mastery {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--secondary);

  &--off {
    color: var(--page-muted);
    font-weight: 600;
  }
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

  &[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--page-text);
  }
}

@media (pointer: coarse) {
  .grip {
    min-height: 44px;
  }
}
</style>
