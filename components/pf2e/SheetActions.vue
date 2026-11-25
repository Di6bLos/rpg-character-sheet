<script setup lang="ts">
// The PF2e sheet's Actions: the hero's abilities that take an action, a reaction or time, or
// have a frequency or trigger (and the actions written inside them, like Rage), grouped as
// Actions / Reactions / Free actions / Activities / Limited uses; then the basic actions, the
// skill actions of skills the hero is trained in, and their class's actions. Use pays the
// cost from the turn tracker, spends the frequency, rolls the check (vs the target's DC),
// Strike, damage or healing, and turns on the bonus it gives. Rules read from text by
// utils/pf2eAbilityRules.ts, used by utils/pf2eActions.ts; Strikes by usePf2eStrikes.
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eActionDef } from '~/data/pf2e/types'
import type { Pf2eFeat, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import {
  type Pf2eAbilityRules,
  clean,
  diceAt,
  readAbility,
  usedAction,
} from '~/utils/pf2eAbilityRules'
import {
  type Pf2eActionEntry as Entry,
  type Pf2eActionGroup,
  type Pf2eRowState,
  type Pf2eStatLines,
  attacked,
  blockedReason,
  checkChoices,
  costGlyph,
  featPatches,
  featStatLines,
  frequencyLabel,
  groupOf,
  payFor,
  resolveUse,
  skillRank,
  timePasses,
  usesLeft,
} from '~/utils/pf2eActions'
import { showOutcome } from '~/utils/dice'
import { championReaction, isChampionReaction, strikeAfter } from '~/utils/pf2eClassActions'
import { featRules } from '~/utils/pf2eEffects'
import { dailyPreparations } from '~/utils/pf2eSpells'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const strikesApi = usePf2eStrikes()

/** Basic actions everyone has (Player Core pp. 416–419) and untrained skill actions for fights. */
const BASIC = [
  'Strike',
  'Stride',
  'Step',
  'Interact',
  'Raise a Shield',
  'Seek',
  'Sense Motive',
  'Recall Knowledge',
  'Demoralize',
  'Trip',
  'Grapple',
  'Shove',
  'Reposition',
  'Escape',
  'Tumble Through',
  'Create a Diversion',
  'Hide',
  'Sneak',
  'Take Cover',
  'Aid',
  'Ready',
  'Delay',
  'Drop Prone',
  'Stand',
  'Point Out',
  'Leap',
  'Crawl',
  'Release',
  'Sustain',
  'Avert Gaze',
  'Administer First Aid',
]
const CORE_BOOKS = new Set(['Player Core', 'Player Core 2'])

const actionData = ref<Pf2eActionDef[]>([])
const patches = ref(new Map<number, Partial<Pf2eFeat>>())

/** Cost and Usage lines from the data, by feat index (sheets don't store them). */
const statLines = ref(new Map<number, Pf2eStatLines>())

onMounted(async () => {
  actionData.value = await loadPf2e('actions')
  const own = sheet.value.feats
  if (!own.some((f) => f.id || !f.traits)) return
  const feats = await loadPf2e('feats')
  const known = new Set([...feats, ...actionData.value].map((x) => x.id))
  const options = own.some((f) => f.id && !known.has(f.id))
    ? (await loadPf2e('classes')).flatMap((c) => [...c.features, ...c.subclasses])
    : []
  statLines.value = featStatLines(own, [...feats, ...actionData.value, ...options])
  if (!own.some((f) => !f.traits)) return
  patches.value = featPatches(own, { feats, actions: actionData.value })
  if (!canEdit.value) return
  for (const [i, patch] of patches.value) {
    const f = sheet.value.feats[i]
    if (f) Object.assign(f, patch)
  }
})

const actionRules = computed(() => {
  const out = new Map<string, Pf2eAbilityRules>()
  for (const a of actionData.value) out.set(a.name, readAbility(a))
  const strike = out.get('Strike')
  if (strike) out.set('Strike', { ...strike, strike: { count: 1, strides: 0, mapCount: 1 } })
  return out
})
/** Actions with a check another ability can make ("you can Demoralize"). */
const checkActionNames = computed(() =>
  [...actionRules.value].filter(([, r]) => r.check && r.outcomes.length).map(([n]) => n),
)

function summaryOf(text: string) {
  const plain = clean(text)
    .replace(/\*\*|_|#+ /g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const two = plain
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(' ')
  return two.length > 260 ? `${two.slice(0, 257)}…` : two
}

const usable = (r: Pf2eAbilityRules) =>
  !!(r.cost || r.frequency || r.trigger || r.strike || (r.check && r.cost))

function entryFor(
  key: string,
  name: string,
  rules: Pf2eAbilityRules,
  text: string,
  from?: string,
): Entry {
  const e: Entry = { key, name, rules, summary: summaryOf(text), text, ...(from ? { from } : {}) }
  if (!rules.check && !rules.strike) {
    const used = usedAction(text, checkActionNames.value)
    const usedRules = used && used !== name ? actionRules.value.get(used) : undefined
    if (used && usedRules) e.via = { name: used, rules: usedRules }
  }
  return e
}

const mine = computed<Entry[]>(() =>
  sheet.value.feats.flatMap((raw, i) => {
    const f = { ...raw, ...patches.value.get(i), desc: raw.desc.replace(/\\n/g, '\n') }
    const lines = statLines.value.get(i)
    const read = featRules(f)
    const r = lines
      ? {
          ...read,
          ...(lines.cost && !read.costNote ? { costNote: lines.cost } : {}),
          ...(lines.usage ? { usage: lines.usage } : {}),
        }
      : read
    const same = r.embedded.some((e) => e.name === f.name)
    const own = usable(r) && !same ? [entryFor(`f${i}`, f.name, r, f.desc)] : []
    const inner = r.embedded
      .filter((e) => e.cost || e.frequency || e.trigger)
      .map((e, j) =>
        entryFor(`f${i}e${j}`, e.name, e, e.body ?? '', e.name === f.name ? undefined : f.name),
      )
    return [...own, ...inner]
  }),
)

const mineNames = computed(() => new Set(mine.value.map((e) => e.name)))

const basic = computed<Entry[]>(() =>
  BASIC.flatMap((name) => {
    const a = actionData.value.find((x) => x.name === name)
    const r = actionRules.value.get(name)
    if (!a || !r || mineNames.value.has(name)) return []
    if (name === 'Raise a Shield' && !sheet.value.shield.name.trim()) return []
    return [entryFor(`b-${name}`, name, r, a.text)]
  }),
)

const skillActions = computed<Entry[]>(() =>
  actionData.value
    .filter((a) => CORE_BOOKS.has(a.source.book) && !BASIC.includes(a.name))
    .flatMap((a) => {
      const r = actionRules.value.get(a.name)
      const skills = r?.check?.skills ?? []
      const trained = skills.some(
        (k) => k !== 'any' && k !== 'flat' && skillRank(sheet.value, k) !== 'U',
      )
      if (!r || !trained || mineNames.value.has(a.name)) return []
      return [entryFor(`s-${a.name}`, a.name, r, a.text)]
    }),
)

const classActions = computed<Entry[]>(() => {
  const cls = sheet.value.class.trim().toLowerCase()
  if (!cls) return []
  return actionData.value
    .filter((a) => a.traits.some((t) => t.toLowerCase() === cls))
    .flatMap((a) => {
      const r = actionRules.value.get(a.name)
      if (!r || mineNames.value.has(a.name)) return []
      return [entryFor(`c-${a.name}`, a.name, r, a.text)]
    })
})

const GROUPS: { id: Pf2eActionGroup; label: string }[] = [
  { id: 'actions', label: 'Actions' },
  { id: 'reactions', label: 'Reactions' },
  { id: 'free', label: 'Free actions' },
  { id: 'activities', label: 'Activities' },
  { id: 'limited', label: 'Limited uses' },
]
const grouped = computed(() =>
  GROUPS.map((g) => ({
    ...g,
    entries: mine.value.filter((e) => groupOf(e.rules.cost) === g.id),
  })).filter((g) => g.entries.length),
)

/** The DC to roll against, and who an ability is used on (per-target limits, the log). */
const targetDc = ref<number | null>(null)
const target = ref('')

const checkOf = (e: Entry) => (e.rules.check ? e.rules : e.via?.rules)
const choicesFor = (e: Entry) => {
  const r = checkOf(e)
  return r?.check ? checkChoices(sheet.value, r, e.via?.name ?? e.name) : []
}
/**
 * The Strikes an ability can make, weapons before the fist: melee or ranged ones, unarmed ones
 * (Flurry of Blows), ones of the damage types it names (Bleeding Finisher: slashing or piercing).
 */
const weaponsFor = (e: Entry) => {
  const st = e.rules.strike
  return strikesApi.strikes.value
    .filter((w) => (st?.melee ? !w.ranged : st?.ranged ? w.ranged : true))
    .filter((w) => !st?.unarmed || w.unarmed)
    .filter((w) => !st?.twoWeapons || !w.unarmed)
    .filter((w) => {
      if (!st?.damageTypes) return true
      const types = w.type.toLowerCase().split(/[/, ]+/)
      return st.damageTypes.some((t) => types.includes(t) || types.includes(t.charAt(0)))
    })
    .sort((a, b) => Number(a.name === 'Fist') - Number(b.name === 'Fist'))
}
const tiersFor = (e: Entry) => {
  const tiers = checkOf(e)?.check?.tiers ?? []
  const order: Pf2eRank[] = ['U', 'T', 'E', 'M', 'L']
  const rank = skillRank(sheet.value, 'Medicine')
  return tiers.filter((t) => order.indexOf(t.rank) <= order.indexOf(rank))
}

function why(e: Entry, actions?: number) {
  if (!canEdit.value) return 'Read only'
  if (e.name === 'Raise a Shield' && sheet.value.shield.raised) return 'Already raised'
  return blockedReason(sheet.value, e.rules, {
    name: e.name,
    target: target.value,
    ...(actions ? { actions } : {}),
  })
}

function left(e: Entry) {
  const f = e.rules.frequency
  return f ? usesLeft(sheet.value, e.name, f, target.value) : 0
}

const extraDiceAt = (r: Pf2eAbilityRules) =>
  [...(r.strike?.extraDice ?? [])].reverse().find(([l]) => l <= level.value)?.[1] ?? 0

function use(e: Entry, st: Pf2eRowState) {
  const reason = why(e, st.actions)
  if (reason) return say(`${e.name}: ${reason}.`)
  const s = sheet.value
  const opts = {
    name: e.name,
    target: target.value,
    ...(st.actions ? { actions: st.actions } : {}),
  }
  const paid = payFor(s, e.rules, opts)
  const glyph = costGlyph(e.rules.cost)
  const lines: string[] = [
    `${e.name}${glyph ? ` ${glyph}` : ''}${target.value.trim() ? ` on ${target.value.trim()}` : ''}:`,
  ]
  if (e.name === 'Raise a Shield') {
    s.shield.raised = true
    lines.push(`${s.shield.name} raised until the start of your next turn.`)
  }
  const strike = e.rules.strike
  if (strike) {
    const weapons = weaponsFor(e)
    const index = st.weapon ?? weapons[0]?.index
    if (strike.strides)
      lines.push(
        strike.strides > 1
          ? `Stride ${strike.strides === 2 ? 'twice' : `${strike.strides} times`}, then:`
          : 'Stride, then:',
      )
    if (index === undefined) lines.push('No Strike on the sheet to make it with.')
    else {
      // Double Slice: one Strike with each weapon, both at the current multiple attack penalty,
      // the second −2 unless agile, counted as two attacks after (Player Core p. 140).
      const second = strike.twoWeapons
        ? (st.weapon2 ?? weapons.find((w) => w.index !== index)?.index)
        : undefined
      const step = strikesApi.nextAttack.value
      const finisher = e.rules.traits.some((t) => t.toLowerCase() === 'finisher')
      st.struck = []
      for (let k = 0; k < strike.count; k++) {
        const at = k > 0 && second !== undefined ? second : index
        const w = strikesApi.strikes.value[at]
        const countAs = strike.sameMap
          ? 0
          : strike.count === 1
            ? strike.mapCount
            : strike.mapCount === 0
              ? 0
              : 1
        const fixed = strike.ignoreMap || e.rules.cost?.kind === 'reaction' ? 0 : undefined
        const penalty = k > 0 && strike.secondPenalty && w && !w.agile ? strike.secondPenalty : 0
        const res = strikesApi.attack(at, {
          quiet: true,
          countAs,
          ...(fixed !== undefined ? { map: fixed } : strike.sameMap ? { map: step } : {}),
          ...(penalty ? { penalty } : {}),
        })
        lines.push(res.text)
        st.struck.push({
          index: at,
          extraDie: extraDiceAt(e.rules),
          ...(res.degree ? { degree: res.degree } : {}),
          ...(finisher ? { finisher } : {}),
        })
      }
      if (strike.sameMap) attacked(s, strike.mapCount)
      if (strike.count === 1)
        lines.push(...strikeAfter(s, e.rules, e.text, level.value, st.struck[0]?.degree).lines)
    }
  }
  if (paid) lines.push(paid)
  if (isChampionReaction(e.name)) lines.push(...championReaction(s, e.name, level.value))
  const rules =
    e.rules.check || !e.via
      ? e.rules
      : {
          ...e.rules,
          check: e.via.rules.check,
          outcomes: e.via.rules.outcomes,
          damage: [...e.rules.damage, ...e.via.rules.damage],
        }
  lines.push(
    ...resolveUse(s, rules, {
      name: e.via?.name ?? e.name,
      level: level.value,
      ...(st.skill ? { skill: st.skill } : {}),
      dc: targetDc.value,
      ...(st.tier ? { tier: st.tier } : {}),
      target: target.value,
      onSelf: !!st.onSelf,
    }),
  )
  if (lines.length === 1) lines.push(e.summary)
  if (e.rules.frequency) {
    const n = left(e)
    lines.push(
      e.rules.frequency.perTarget && !target.value.trim()
        ? 'Name the target to track its limit.'
        : `${n} use${n === 1 ? '' : 's'} left ${frequencyLabel(e.rules.frequency)
            .toLowerCase()
            .replace(/^once |^\d+× /, '')}.`,
    )
  }
  say(lines.join(' '))
}

/**
 * Damage for the Strikes a use made. One Strike rolls as the button says; several (Double Slice,
 * Flurry of Blows) are combined (Player Core p. 140): those that missed are left out, each
 * critical hit doubles its own, and precision dice are added once, to the first that hit.
 */
function strikeDamage(e: Entry, crit: boolean, row: Pf2eRowState) {
  const list = row.struck ?? []
  if (!list.length || !canEdit.value) return
  const one = (st: (typeof list)[number], c: boolean, o: { quiet?: boolean; noExtra?: boolean }) =>
    strikesApi.damage(st.index, c, {
      ...(st.extraDie ? { extraDie: st.extraDie } : {}),
      ...(st.finisher ? { finisher: true } : {}),
      by: e.name,
      ...o,
    })
  if (list.length === 1) return void one(list[0]!, crit, {})
  const landed = list.filter((x) => x.degree !== 'failure' && x.degree !== 'critical failure')
  if (!landed.length) return say(`${e.name}: no Strike hit, so no damage.`)
  const rolls = landed.map((st, k) =>
    one(st, st.degree ? st.degree === 'critical success' : crit, { quiet: true, noExtra: k > 0 }),
  )
  const total = rolls.reduce((n, r) => n + (r?.total ?? 0), 0)
  const missed = list.length - landed.length
  const text = `${e.name} combined damage: ${total} (${rolls.map((r) => r?.text).join('; ')})${missed ? `; ${missed} Strike${missed === 1 ? '' : 's'} missed` : ''}. Resistances and weaknesses apply once.`
  showOutcome({ label: `${e.name} damage`, total, detail: text })
  say(text)
}

function rest(period: 'minute' | '10min' | 'hour') {
  if (canEdit.value) claim('act-rest', () => say(timePasses(sheet.value, period)))
}

function prepare() {
  if (canEdit.value) claim('act-rest', () => say(dailyPreparations(sheet.value)))
}

const { claim, resultFor } = useResultOwner()
const onTurn = computed(() => !!sheet.value.turn?.active)
const inCombat = computed(() => onTurn.value || (sheet.value.turn?.round ?? 0) > 0)

/**
 * The panel's folding sections: on your turn Actions open and Reactions fold, off your turn
 * the reverse (as on the Nimble sheet); out of combat both stay as the player left them.
 * Basic, skill and class actions start folded.
 */
const sections = computed(() => [
  ...grouped.value.map((g) => ({
    ...g,
    open:
      !inCombat.value || (g.id !== 'actions' && g.id !== 'reactions')
        ? undefined
        : g.id === 'actions'
          ? onTurn.value
          : !onTurn.value,
    startFolded: false,
  })),
  { id: 'basic', label: 'Basic actions', entries: basic.value, open: undefined, startFolded: true },
  ...(skillActions.value.length
    ? [
        {
          id: 'skill',
          label: 'Skill actions (trained)',
          entries: skillActions.value,
          open: undefined,
          startFolded: true,
        },
      ]
    : []),
  ...(classActions.value.length
    ? [
        {
          id: 'class',
          label: `${sheet.value.class} actions`,
          entries: classActions.value,
          open: undefined,
          startFolded: true,
        },
      ]
    : []),
])

const dmgPreview = (e: Entry) =>
  [...e.rules.damage, ...(e.via?.rules.damage ?? [])]
    .filter((d) => !d.degree)
    .map((d) => `${diceAt(d, level.value)}${d.type ? ` ${d.type}` : ''}`)
    .join(', ')
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="pf-act-h">
    <UiFold name="PF2e actions" />
    <div class="panel-title" style="margin: 0">
      <h2 id="pf-act-h">Actions</h2>
    </div>
    <div class="targets">
      <label class="target">
        DC
        <input
          v-model.number="targetDc"
          class="input target__dc"
          type="number"
          inputmode="numeric"
          min="0"
          placeholder="—"
          aria-label="Target DC"
        />
      </label>
      <label class="target">
        Target
        <input v-model="target" class="input target__name" maxlength="40" placeholder="name" />
      </label>
      <UiHelp
        label="About the target"
        text="DC: the DC your check is against, such as the creature's Will DC for Demoralize; leave it empty to roll without a result. Target: who you use the ability on, so limits per target (Battle Medicine, Demoralize) count for that name."
      />
    </div>

    <section
      v-for="sec in sections"
      :key="sec.id"
      class="panel sub stack"
      :aria-labelledby="`pf-act-${sec.id}`"
    >
      <UiFold :name="`PF2e ${sec.label}`" :open="sec.open" :start-folded="sec.startFolded" />
      <h3 :id="`pf-act-${sec.id}`" class="sub__title">
        {{ sec.label }} <span class="sub__count">{{ sec.entries.length }}</span>
      </h3>
      <Pf2eActionRow
        v-for="e in sec.entries"
        :key="e.key"
        :entry="e"
        :why="why(e)"
        :left="left(e)"
        :choices="choicesFor(e)"
        :weapons="weaponsFor(e)"
        :tiers="tiersFor(e)"
        :dmg="dmgPreview(e)"
        :result="resultFor(`act:${e.key}`)"
        @use="(st) => claim(`act:${e.key}`, () => use(e, st))"
        @damage="(crit, st) => claim(`act:${e.key}`, () => strikeDamage(e, crit, st))"
      />
    </section>
    <p v-if="!grouped.length" class="empty">
      None of your abilities take an action or have a limited use.
    </p>

    <div class="rest">
      <span class="small rest__label">Time passes</span>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="rest('minute')"
      >
        1 minute
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="rest('10min')"
      >
        10 minutes
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="rest('hour')"
      >
        1 hour
      </button>
      <button
        v-if="!sheet.spellcasting && !sheet.focusSpells?.length && !sheet.archetypeCasting?.length"
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="prepare"
      >
        Daily preparations
      </button>
    </div>
    <p v-if="resultFor('act-rest')" class="roll-status" role="status" aria-live="polite">
      {{ resultFor('act-rest') }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.targets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.target {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;

  .input {
    min-height: 36px;
    padding: 4px 8px;
  }

  .target__dc {
    width: 64px;
  }

  .target__name {
    width: 120px;
  }
}

.sub {
  padding: 14px;
  box-shadow: none;
  gap: 8px;
}

.sub__title {
  margin: 0;
  font-size: 15px;
}

.sub__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--page-soft);
}

.rest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.rest__label {
  font-weight: 600;
  color: var(--page-soft);
}

@media (pointer: coarse) {
  .target .input {
    min-height: 44px;
  }
}
</style>
