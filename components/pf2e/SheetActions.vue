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
  blockedReason,
  checkChoices,
  costGlyph,
  featPatches,
  frequencyLabel,
  groupOf,
  payFor,
  resolveUse,
  skillRank,
  timePasses,
  usesLeft,
} from '~/utils/pf2eActions'
import { featRules } from '~/utils/pf2eEffects'
import { dailyPreparations } from '~/utils/pf2eSpells'

const { draft, canEdit, lastRoll, say } = useSheet<Pf2eSheet>()
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

onMounted(async () => {
  actionData.value = await loadPf2e('actions')
  if (!sheet.value.feats.some((f) => !f.traits)) return
  const feats = await loadPf2e('feats')
  patches.value = featPatches(sheet.value.feats, { feats, actions: actionData.value })
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
    const r = featRules(f)
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
/** The Strikes an ability can make, weapons before the fist. */
const weaponsFor = (e: Entry) =>
  strikesApi.strikes.value
    .filter((w) => (e.rules.strike?.melee ? !w.ranged : e.rules.strike?.ranged ? w.ranged : true))
    .sort((a, b) => Number(a.name === 'Fist') - Number(b.name === 'Fist'))
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
  payFor(s, e.rules, opts)
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
    else
      for (let k = 0; k < strike.count; k++) {
        const countAs = strike.count === 1 ? strike.mapCount : strike.mapCount === 0 ? 0 : 1
        const res = strikesApi.attack(index, {
          quiet: true,
          countAs,
          ...(strike.ignoreMap || e.rules.cost?.kind === 'reaction' ? { map: 0 } : {}),
        })
        lines.push(res.text)
        st.struck = { index, extraDie: extraDiceAt(e.rules) }
      }
  }
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

function strikeDamage(e: Entry, crit: boolean, row: Pf2eRowState) {
  const st = row.struck
  if (!st || !canEdit.value) return
  strikesApi.damage(st.index, crit, {
    ...(st.extraDie ? { extraDie: st.extraDie } : {}),
    by: e.name,
  })
}

function rest(period: 'minute' | '10min' | 'hour') {
  if (canEdit.value) say(timePasses(sheet.value, period))
}

function prepare() {
  if (canEdit.value) say(dailyPreparations(sheet.value))
}

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
      <div class="title-help">
        <h2 id="pf-act-h">Actions</h2>
        <UiHelp
          label="About actions"
          text="Your abilities that take actions, a reaction or time, or have a limited number of uses, then basic and skill actions. Use pays its actions from the turn, spends a use, and rolls what it rolls against the target's DC."
        />
      </div>
      <label class="target">
        Target DC
        <input
          v-model.number="targetDc"
          class="input"
          type="number"
          inputmode="numeric"
          min="0"
          placeholder="—"
        />
      </label>
      <label class="target">
        Target
        <input v-model="target" class="input target__name" maxlength="40" placeholder="name" />
      </label>
    </div>

    <div v-for="g in grouped" :key="g.id" class="stack" style="gap: 8px">
      <h3 class="caps">{{ g.label }}</h3>
      <Pf2eActionRow
        v-for="e in g.entries"
        :key="e.key"
        :entry="e"
        :why="why(e)"
        :left="left(e)"
        :choices="choicesFor(e)"
        :weapons="weaponsFor(e)"
        :tiers="tiersFor(e)"
        :dmg="dmgPreview(e)"
        @use="use(e, $event)"
        @damage="(crit, st) => strikeDamage(e, crit, st)"
      />
    </div>
    <p v-if="!grouped.length" class="empty">
      None of your abilities take an action or have a limited use.
    </p>

    <details class="fold">
      <summary class="caps">Basic actions</summary>
      <div class="stack" style="gap: 8px">
        <Pf2eActionRow
          v-for="e in basic"
          :key="e.key"
          :entry="e"
          :why="why(e)"
          :left="left(e)"
          :choices="choicesFor(e)"
          :weapons="weaponsFor(e)"
          :tiers="tiersFor(e)"
          :dmg="dmgPreview(e)"
          @use="use(e, $event)"
          @damage="(crit, st) => strikeDamage(e, crit, st)"
        />
      </div>
    </details>
    <details v-if="skillActions.length" class="fold">
      <summary class="caps">Skill actions (trained)</summary>
      <div class="stack" style="gap: 8px">
        <Pf2eActionRow
          v-for="e in skillActions"
          :key="e.key"
          :entry="e"
          :why="why(e)"
          :left="left(e)"
          :choices="choicesFor(e)"
          :weapons="weaponsFor(e)"
          :tiers="tiersFor(e)"
          :dmg="dmgPreview(e)"
          @use="use(e, $event)"
          @damage="(crit, st) => strikeDamage(e, crit, st)"
        />
      </div>
    </details>
    <details v-if="classActions.length" class="fold">
      <summary class="caps">{{ sheet.class }} actions</summary>
      <div class="stack" style="gap: 8px">
        <Pf2eActionRow
          v-for="e in classActions"
          :key="e.key"
          :entry="e"
          :why="why(e)"
          :left="left(e)"
          :choices="choicesFor(e)"
          :weapons="weaponsFor(e)"
          :tiers="tiersFor(e)"
          :dmg="dmgPreview(e)"
          @use="use(e, $event)"
          @damage="(crit, st) => strikeDamage(e, crit, st)"
        />
      </div>
    </details>

    <div class="row rest" style="gap: 8px">
      <span class="small muted">Time passes:</span>
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
        v-if="!sheet.spellcasting && !sheet.focusSpells?.length"
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="prepare"
      >
        Daily preparations
      </button>
    </div>
    <div v-if="lastRoll" class="roll-status" aria-hidden="true">{{ lastRoll }}</div>
  </section>
</template>

<style scoped lang="scss">
.target {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;

  .input {
    width: 80px;
  }

  .target__name {
    width: 130px;
  }
}

h3.caps {
  margin: 0;
  font-size: 12px;
}

.fold > summary {
  cursor: pointer;
  padding: 6px 0;
  font-size: 12px;
}

.fold[open] > summary {
  margin-bottom: 8px;
}

.rest {
  flex-wrap: wrap;
  align-items: center;
}
</style>
