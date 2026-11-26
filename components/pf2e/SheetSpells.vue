<script setup lang="ts">
// The PF2e sheet's Spells panel (Player Core pp. 297–303): spell attack and DC after
// conditions, cantrips (heightened to half the level), slots by rank — spontaneous casters
// pick the slot to cast from (only signature spells heighten), prepared casters fill each
// slot — a cleric's divine font, focus
// spells and Refocus, daily preparations, and adding or removing spells. Casting rolls what the
// spell rolls at the rank it goes off (utils/pf2eSpellRules.ts): a spell attack against the
// Target AC with the chosen MAP, or the DC and damage for each save result, healing the hero can
// take, and a buff it can turn on. Rules text comes from `data/pf2e` (fetched when the panel
// opens); rules in utils/pf2eSpells.ts. With `archetype` it shows that multiclass archetype's
// own spellcasting (Player Core p. 215) instead, without the focus spells.
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eSpellDef } from '~/data/pf2e/types'
import type { Pf2eArchetypeCasting, Pf2eSheet, Pf2eSpellRef } from '~/types/sheets'
import { rollCheck, showOutcome, sign } from '~/utils/dice'
import { type Pf2eBloodMagic, bloodMagic } from '~/utils/pf2eClassActions'
import { pf2eEffectDef, toggleEffect } from '~/utils/pf2eEffects'
import { heal } from '~/utils/pf2ePlay'
import {
  castBlocked,
  castCantrip,
  castRankFor,
  castEffect,
  castFocus,
  castFont,
  castPrepared,
  castSpontaneous,
  castWentOff,
  dailyPreparations,
  effectOnSelf,
  focusNumbers,
  heightenedRank,
  highestRank,
  openRanks,
  payCast,
  refocus,
  setSlotMax,
  spellNumbers,
  spontaneousRank,
} from '~/utils/pf2eSpells'
import { attackCount, defaultActions, spellRules } from '~/utils/pf2eSpellRules'
import { readCost } from '~/utils/pf2eAbilityRules'
import { loreHtml } from '~/utils/loreText'

const props = defineProps<{ archetype?: string }>()
const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const owner = useResultOwner()
/** Result keys of an archetype's panel are its own, so a spell both panels list doesn't clash. */
const prefix = props.archetype ? `arch:${props.archetype}:` : ''
const claim = (key: string, run: () => void) => owner.claim(prefix + key, run)
const resultFor = (key: string) => owner.resultFor(prefix + key)
const panelId = props.archetype
  ? `spells-${props.archetype.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  : 'spells'
/** The cast's offers (heal yourself, temp HP, the buff on yourself) for the row that made it. */
const offersFor = (key: string) => (lastCast.value?.key === key ? lastCast.value : null)
/** A spell's action cost for screen readers ("Two actions"). */
const costOf = (id: string) => readCost(byId.value.get(id)?.actions)
/** A spell card's pill: its first trait that isn't its rarity ("Fire", "Mental"). */
const traitOf = (id: string) =>
  byId.value
    .get(id)
    ?.traits.find(
      (t) =>
        !/^(common|uncommon|rare|unique|cantrip|focus|concentrate|manipulate|attack)$/i.test(t),
    ) ?? ''
/** A spell card's summary line: range or area, and the defense. */
const metaOf = (id: string) => {
  const d = byId.value.get(id)
  return d ? [d.range ?? d.area, d.defense].filter(Boolean).join(' · ') : ''
}
const sheet = computed(() => draft.value.sheet)
const sc = computed(() =>
  props.archetype
    ? sheet.value.archetypeCasting?.find((e) => e.archetype === props.archetype)
    : sheet.value.spellcasting,
)
const level = computed(() => draft.value.level)
/** The class's own second track names itself (Apparition spells); an archetype's says whose. */
const title = computed(() =>
  props.archetype
    ? ((sc.value as Pf2eArchetypeCasting | undefined)?.label ??
      `${props.archetype} archetype spells`)
    : 'Spells',
)

const spells = shallowRef<Pf2eSpellDef[]>([])
onMounted(async () => {
  try {
    spells.value = await loadPf2e('spells')
  } catch {
    // The panel still works from the names on the sheet; only rules text and adding wait.
  }
})
const byId = computed(() => new Map(spells.value.map((s) => [s.id, s])))
const cantripIds = computed(
  () => new Set(spells.value.filter((s) => s.traits.includes('Cantrip')).map((s) => s.id)),
)

const numbers = computed(() => (sc.value ? spellNumbers(sheet.value, sc.value, level.value) : null))
/** Focus-only heroes cast with their class's focus attribute at their class DC's rank. */
const castNumbers = computed(() => numbers.value ?? focusNumbers(sheet.value, level.value))
/** The attack and DC tiles: the spellcasting's, or a focus-only hero's for their focus spells. */
const headNumbers = computed(
  () =>
    numbers.value ??
    (!props.archetype && sheet.value.focusSpells?.length ? castNumbers.value : null),
)
const ranks = computed(() =>
  (sc.value?.slots ?? [])
    .map((r, i) => ({ rank: i + 1, ...r }))
    .filter((r) => r.max > 0 || edit.value),
)
const edit = ref(false)

function rollSpellAttack() {
  const n = headNumbers.value
  if (!n) return
  claim('spells-head', () => {
    const r = rollCheck(n.attack.value)
    const line = `Spell attack: ${r.total} (${r.d20} ${sign(n.attack.value)})`
    showOutcome({ label: 'Spell attack', total: r.total, detail: line })
    say(line)
  })
}

const castRanks = (spell: Pf2eSpellRef) => openRanks(sc.value, spell)
const castAt = ref<Record<string, number>>({})
const castRank = (spell: Pf2eSpellRef) => castRankFor(sc.value, spell, castAt.value[spell.id])
const fontRank = computed(() => (sc.value ? highestRank(sc.value) : 0))

function run(message: string) {
  if (canEdit.value) claim('spells-head', () => say(message))
}

// --- What a cast rolls ---------------------------------------------------------------
/**
 * The target's AC for spell attacks, shared with the Strikes table, and which attack this is
 * for MAP (p. 402): the turn tracker's count of attacks this turn, which the select can change.
 */
const { targetAc, nextAttack } = usePf2eStrikes()
const attackNumber = ref(nextAttack.value)
watch(nextAttack, (n) => (attackNumber.value = n))

/**
 * Why a spell can't be cast now (`castBlocked`): dead or unable to act, too few actions left
 * this turn, the reaction spent. Dead and unable to act show once, at the top.
 */
const castWhy = (def: Pf2eSpellDef | undefined) =>
  castBlocked(sheet.value, def, def ? actionsOf(def) : undefined)
const stopped = computed(() => castBlocked(sheet.value, undefined))
const whyFor = (id: string | null | undefined) => {
  const why = castWhy(id ? byId.value.get(id) : undefined)
  return why === stopped.value ? '' : why
}
const knownIds = computed(() => [
  ...(sc.value?.cantrips ?? []),
  ...(sc.value?.spells ?? []),
  ...(sheet.value.focusSpells ?? []),
])
const hasAttackSpell = computed(() =>
  knownIds.value.some((s) => {
    const def = byId.value.get(s.id)
    return def ? spellRules(def).attack : false
  }),
)
/** Per spell: the action version and a melee spell attack. */
const actionsFor = ref<Record<string, number | undefined>>({})
const meleeFor = ref<Record<string, boolean>>({})
const targetsFor = ref<Record<string, number | undefined>>({})
const actionsOf = (def: Pf2eSpellDef) => actionsFor.value[def.id] ?? defaultActions(spellRules(def))

/** What the last cast left to apply: healing, temporary HP, a buff cast on a target. */
const lastCast = ref<{
  /** The row it was cast from, where its result and these offers show. */
  key: string
  def: Pf2eSpellDef
  rank: number
  healing?: number
  temp?: number
  offer?: string
  /** A sorcerer's blood magic from a bloodline or sorcerous gift spell (Player Core 2 p. 144). */
  blood?: Pf2eBloodMagic
} | null>(null)

/**
 * Says the cast line in the spell's row (`key`); if it went off, rolls what the spell rolls at
 * that rank.
 */
function cast(
  spend: () => string,
  def: Pf2eSpellDef | undefined,
  rank: number,
  key = `spell:${def?.id ?? ''}`,
) {
  if (!canEdit.value) return
  const why = castWhy(def)
  claim(key, () => (why ? say(`${def?.name ?? 'Cast'}: ${why}.`) : castIn(key, spend(), def, rank)))
}

function castIn(key: string, message: string, def: Pf2eSpellDef | undefined, rank: number) {
  lastCast.value = null
  if (!def) return say(message)
  if (!castWentOff(message)) {
    // Disrupted: the slot and the actions are spent all the same (p. 446).
    if (message.startsWith('Cast '))
      payCast(sheet.value, def, { actions: actionsOf(def), attacks: 0 })
    return say(message)
  }
  const r = castEffect(sheet.value, def, rank, level.value, {
    sc: sc.value,
    actions: actionsOf(def),
    melee: !!meleeFor.value[def.id],
    targets: targetsFor.value[def.id],
    attackNumber: attackNumber.value,
    targetAc: targetAc.value,
  })
  payCast(sheet.value, def, {
    actions: actionsOf(def),
    attacks: attackCount(def, { rank, actions: actionsOf(def), targets: targetsFor.value[def.id] }),
  })
  const blood = bloodMagic(sheet.value, def.name, rank)
  const target = blood?.damage ? ` Or a target takes ${blood.damage} damage.` : ''
  const bloodLine = blood ? ` Blood magic, ${blood.name}: ${blood.text}${target}` : ''
  say(`${message} ${r.text}${bloodLine}`.trim())
  const effect = spellRules(def).effect
  const offer = effect && !effect.self ? effect.def.name : undefined
  if (r.healing || r.temp || offer || blood?.toggles.length)
    lastCast.value = {
      key,
      def,
      rank,
      healing: r.healing,
      temp: r.temp,
      offer,
      ...(blood?.toggles.length ? { blood } : {}),
    }
}

/** Takes the blood magic's effect on yourself (one of them, for Imperious Defense). */
function bloodSelf(name: string) {
  const last = lastCast.value
  if (!canEdit.value || !last?.blood) return
  const blood = last.blood
  const tempHp = pf2eEffectDef(sheet.value, name)?.effects.some((e) => e.kind === 'tempHp')
  claim(last.key, () =>
    say(
      `${blood.name}: ${toggleEffect(sheet.value, name, level.value, tempHp ? last.rank : undefined)}`,
    ),
  )
  lastCast.value = { ...last, blood: undefined }
}

function castFromSlot(s: Pf2eSpellRef) {
  const slot = castRank(s)
  cast(
    () => castSpontaneous(sheet.value, s, slot, sc.value),
    byId.value.get(s.id),
    spontaneousRank(s, slot),
  )
}

function castFromPrepared(rank: number, index: number, id: string | null) {
  cast(
    () => castPrepared(sheet.value, rank, index, sc.value),
    id ? byId.value.get(id) : undefined,
    rank,
    `slot:${rank}:${index}`,
  )
}

function castOwnCantrip(s: Pf2eSpellRef) {
  cast(
    () => castCantrip(sheet.value, s, level.value),
    byId.value.get(s.id),
    heightenedRank(level.value),
  )
}

function castFocusSpell(s: Pf2eSpellRef) {
  cast(
    () => castFocus(sheet.value, s, level.value, cantripIds.value.has(s.id)),
    byId.value.get(s.id),
    heightenedRank(level.value),
  )
}

/**
 * This panel's attack and damage spells for the Attacks panel's Spells group (Nimble shows its
 * damage spells there too): a spell attack (p. 303) or a save against damage, cast from here.
 */
const attackRegistry = usePf2eSpellAttacks()
const spellAttacks = computed<Pf2eSpellAttack[]>(() => {
  const out: Pf2eSpellAttack[] = []
  const add = (
    ref: { id: string; name: string },
    group: string,
    key: string,
    castIt: () => void,
    blockedExtra = '',
  ) => {
    const def = byId.value.get(ref.id)
    if (!def) return
    const r = spellRules(def)
    const damaging = r.parts.some((x) => x.role === 'damage')
    if (!r.attack && !(r.saves.length && damaging)) return
    const save = r.saves[0]
    out.push({
      key,
      id: def.id,
      name: def.name,
      group,
      cost: readCost(def.actions),
      line: [
        r.attack ? 'Spell attack' : save ? `${save.basic ? 'basic ' : ''}${save.save}` : '',
        metaOf(def.id),
      ]
        .filter(Boolean)
        .join(' · '),
      text: def.text,
      why: blockedExtra || castWhy(def),
      cast: castIt,
    })
  }
  for (const c of sc.value?.cantrips ?? [])
    add(c, 'Cantrip', `spell:${c.id}`, () => castOwnCantrip(c))
  if (sc.value?.kind === 'spontaneous')
    for (const x of sc.value.spells)
      add(
        x,
        `Rank ${x.rank}`,
        `spell:${x.id}`,
        () => castFromSlot(x),
        castRanks(x).length ? '' : 'No slots left',
      )
  else
    for (const r of ranks.value)
      (r.prepared ?? []).forEach((p, i) => {
        if (p.id && !p.cast)
          add({ id: p.id, name: nameOf(p.id) ?? '' }, `Rank ${r.rank}`, `slot:${r.rank}:${i}`, () =>
            castFromPrepared(r.rank, i, p.id),
          )
      })
  if (!props.archetype)
    for (const f of sheet.value.focusSpells ?? [])
      add(
        f,
        'Focus',
        `spell:${f.id}`,
        () => castFocusSpell(f),
        !cantripIds.value.has(f.id) && sheet.value.focus.current < 1 ? 'No Focus Points' : '',
      )
  return out
})
watch(
  spellAttacks,
  (list) => (attackRegistry.value = { ...attackRegistry.value, [panelId]: list }),
  {
    immediate: true,
  },
)
onBeforeUnmount(() => {
  const rest = { ...attackRegistry.value }
  delete rest[panelId]
  attackRegistry.value = rest
})

const fontDef = computed(() =>
  sc.value?.font
    ? spells.value.find(
        (x) => x.kind === 'spell' && x.name.toLowerCase() === sc.value!.font!.spell.toLowerCase(),
      )
    : undefined,
)
function castFromFont() {
  cast(() => castFont(sheet.value), fontDef.value, fontRank.value, 'spell:font')
}

function healSelf() {
  const last = lastCast.value
  if (!canEdit.value || !last?.healing) return
  claim(last.key, () => say(`${last.def.name}: ${heal(sheet.value, last.healing!)}`))
  lastCast.value = { ...last, healing: undefined }
}

/** The healing went to someone else: say so, and it's no longer on offer. */
function healTarget() {
  const last = lastCast.value
  if (!canEdit.value || !last?.healing) return
  claim(last.key, () => say(`${last.def.name}: the target regains ${last.healing} Hit Points.`))
  lastCast.value = { ...last, healing: undefined }
}

/** Temporary Hit Points don't stack: the hero keeps the higher (p. 410). */
function tempSelf() {
  const last = lastCast.value
  if (!canEdit.value || !last?.temp) return
  const before = sheet.value.tempHp
  sheet.value.tempHp = Math.max(before, last.temp)
  const now = sheet.value.tempHp
  claim(last.key, () =>
    say(
      `${last.def.name}: ${now > before ? `${now} temporary HP` : `you keep your ${before} temporary HP`}.`,
    ),
  )
  lastCast.value = { ...last, temp: undefined }
}

function buffSelf() {
  const last = lastCast.value
  if (!canEdit.value || !last?.offer) return
  claim(last.key, () =>
    say(`${last.def.name}: ${effectOnSelf(sheet.value, last.def, last.rank, level.value)}`),
  )
  lastCast.value = { ...last, offer: undefined }
}

/** Spells known (repertoire or list) that fit a prepared slot of this rank. */
const fits = (rank: number) => (sc.value?.spells ?? []).filter((s) => s.rank <= rank)

// --- Adding and removing ---------------------------------------------------------
const query = ref('')
const adding = ref<'spell' | 'cantrip' | 'focus' | null>(null)
const addOptions = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!adding.value || q.length < 2) return []
  const top = sc.value ? Math.max(1, highestRank(sc.value)) : 1
  return spells.value
    .filter((s) => {
      if (!s.name.toLowerCase().includes(q)) return false
      if (adding.value === 'focus')
        return s.kind === 'focus' || (s.kind === 'cantrip' && s.classes.length > 0)
      if (!sc.value || !s.traditions.includes(sc.value.tradition)) return false
      return adding.value === 'cantrip' ? s.kind === 'cantrip' : s.kind === 'spell' && s.rank <= top
    })
    .slice(0, 12)
})

function add(s: Pf2eSpellDef) {
  if (!canEdit.value) return
  const entry = { id: s.id, name: s.name, rank: s.rank }
  const sheetNow = sheet.value
  if (adding.value === 'focus') {
    const list = sheetNow.focusSpells ?? []
    if (!list.some((x) => x.id === s.id)) sheetNow.focusSpells = [...list, entry]
  } else if (sc.value) {
    const key = adding.value === 'cantrip' ? 'cantrips' : 'spells'
    if (!sc.value[key].some((x) => x.id === s.id)) sc.value[key] = [...sc.value[key], entry]
  }
  query.value = ''
  adding.value = null
}

function remove(where: 'cantrips' | 'spells' | 'focus', id: string) {
  if (!canEdit.value) return
  if (where === 'focus')
    sheet.value.focusSpells = (sheet.value.focusSpells ?? []).filter((x) => x.id !== id)
  else if (sc.value) sc.value[where] = sc.value[where].filter((x) => x.id !== id)
}

const nameOf = (id: string | null) => (id ? sc.value?.spells.find((s) => s.id === id)?.name : '')
</script>

<template>
  <section class="panel stack" style="gap: 14px" :aria-labelledby="`${panelId}-h`">
    <UiFold :name="title" />
    <div class="panel-title" style="margin: 0">
      <h2 :id="`${panelId}-h`">{{ title }}</h2>
      <span v-if="sc" class="small muted">{{ sc.tradition }} · {{ sc.kind }}</span>
    </div>

    <div class="head">
      <button
        v-if="headNumbers"
        type="button"
        class="tile head__tile"
        :class="{ 'is-changed': headNumbers.attack.changed }"
        :title="headNumbers.attack.changed ? headNumbers.attack.note : 'Roll a spell attack'"
        @click="rollSpellAttack"
      >
        <span class="tile__label">Spell attack</span>
        <span class="tile__value">{{ sign(headNumbers.attack.value) }}</span>
      </button>
      <div
        v-if="headNumbers"
        class="tile head__tile"
        :class="{ 'is-changed': headNumbers.dc.changed }"
        :title="headNumbers.dc.changed ? headNumbers.dc.note : undefined"
      >
        <span class="tile__label">Spell DC</span>
        <span class="tile__value">{{ headNumbers.dc.value }}</span>
      </div>
      <div class="head__tools">
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="run(dailyPreparations(sheet))"
        >
          Daily preparations
        </button>
        <label class="check">
          <input v-model="edit" type="checkbox" :disabled="!canEdit" />
          {{ sc ? 'Edit slots and spells' : 'Edit focus spells' }}
        </label>
      </div>
    </div>
    <p v-if="stopped" class="small spell__stopped" role="status">Can’t cast: {{ stopped }}</p>
    <p v-if="resultFor('spells-head')" class="roll-status" role="status" aria-live="polite">
      {{ resultFor('spells-head') }}
    </p>

    <div v-if="hasAttackSpell" class="target">
      <Pf2eTargetAc />
      <select
        v-model.number="attackNumber"
        class="input input--sm"
        aria-label="Which spell attack this is this turn"
      >
        <option :value="0">1st attack ({{ sign(castNumbers.attack.value) }})</option>
        <option :value="1">2nd, −5 ({{ sign(castNumbers.attack.value - 5) }})</option>
        <option :value="2">3rd, −10 ({{ sign(castNumbers.attack.value - 10) }})</option>
      </select>
      <UiHelp
        label="About spell attacks"
        text="The target's AC is the one the Attacks panel uses, so a spell attack says hit or miss. The attack this is follows the turn tracker's count of attacks this turn (the multiple attack penalty); change it if you need to."
      />
    </div>

    <!-- Cantrips -->
    <details v-if="sc" class="tier" open>
      <summary class="caps">Cantrips · rank {{ heightenedRank(level) }}</summary>
      <div class="spell-grid">
        <details v-for="s in sc.cantrips" :key="s.id" :name="`${panelId}-spell`" class="tile spell">
          <summary class="spell__head">
            <strong>{{ s.name }}</strong>
            <span v-if="traitOf(s.id)" class="trad">{{ traitOf(s.id) }}</span>
            <Pf2eCostPill :cost="costOf(s.id)" />
            <small>{{ metaOf(s.id) }}</small>
          </summary>
          <div class="spell__body">
            <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
            <div
              v-if="byId.get(s.id)"
              class="spell__text"
              v-html="loreHtml(byId.get(s.id)!.text)"
            />
            <div class="spell__meta">
              <Pf2eSpellCastOptions
                v-if="byId.get(s.id)"
                v-model:actions="actionsFor[s.id]"
                v-model:melee="meleeFor[s.id]"
                v-model:targets="targetsFor[s.id]"
                :spell="byId.get(s.id)!"
                :rank="heightenedRank(level)"
              />
            </div>
            <div class="spell__act">
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                :disabled="!canEdit || !!stopped || !!whyFor(s.id)"
                :title="whyFor(s.id) || undefined"
                :aria-label="`Cast ${s.name}`"
                @click="castOwnCantrip(s)"
              >
                {{ whyFor(s.id) || 'Cast' }}
              </button>
              <button
                v-if="edit"
                type="button"
                class="x"
                :aria-label="`Remove ${s.name}`"
                @click="remove('cantrips', s.id)"
              >
                ×
              </button>
            </div>
            <Pf2eSpellResult
              :result="resultFor(`spell:${s.id}`)"
              :offers="offersFor(`spell:${s.id}`)"
              :disabled="!canEdit"
              @heal="healSelf"
              @heal-target="healTarget"
              @temp="tempSelf"
              @buff="buffSelf"
              @blood="bloodSelf"
              @dismiss="lastCast = null"
            />
          </div>
        </details>
      </div>
      <button
        v-if="edit"
        type="button"
        class="btn btn--ghost btn--sm add"
        @click="adding = 'cantrip'"
      >
        + Cantrip
      </button>
    </details>

    <!-- Slots by rank -->
    <details v-for="r in ranks" :key="r.rank" class="tier" open>
      <summary class="rank-head">
        <span class="caps">Rank {{ r.rank }}</span>
        <span
          v-if="sc?.kind === 'spontaneous'"
          class="pips"
          role="img"
          :aria-label="`${r.max - r.used} of ${r.max} rank ${r.rank} slots left`"
        >
          <i v-for="n in r.max" :key="n" class="pip-dot" :class="{ on: n > r.used }" />
        </span>
        <small v-else-if="sc"
          >{{ (r.prepared ?? []).filter((x) => x.id && !x.cast).length }} / {{ r.max }} ready</small
        >
      </summary>
      <span v-if="edit && sc" class="row" style="gap: 4px">
        <button
          type="button"
          class="step step--xs"
          :aria-label="`One fewer rank ${r.rank} slot`"
          @click="setSlotMax(sc, r.rank, r.max - 1)"
        >
          −
        </button>
        <span class="small">{{ r.max }} slots</span>
        <button
          type="button"
          class="step step--xs"
          :aria-label="`One more rank ${r.rank} slot`"
          @click="setSlotMax(sc, r.rank, r.max + 1)"
        >
          +
        </button>
      </span>

      <div v-if="sc?.kind === 'spontaneous'" class="spell-grid">
        <details
          v-for="s in sc.spells.filter((x) => x.rank === r.rank)"
          :key="s.id"
          :name="`${panelId}-spell`"
          class="tile spell"
        >
          <summary class="spell__head">
            <strong>{{ s.name }}</strong>
            <span v-if="traitOf(s.id)" class="trad">{{ traitOf(s.id) }}</span>
            <Pf2eCostPill :cost="costOf(s.id)" />
            <small v-if="s.signature && !edit" class="tag">signature</small>
            <small>{{ metaOf(s.id) }}</small>
          </summary>
          <div class="spell__body">
            <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
            <div
              v-if="byId.get(s.id)"
              class="spell__text"
              v-html="loreHtml(byId.get(s.id)!.text)"
            />
            <div class="spell__meta">
              <label
                v-if="edit"
                class="check"
                title="A signature spell heightens to any rank you have slots for (Player Core p. 297)"
              >
                <input
                  type="checkbox"
                  :checked="!!s.signature"
                  :disabled="!canEdit"
                  @change="s.signature = ($event.target as HTMLInputElement).checked"
                />
                Signature
              </label>
              <select
                v-if="castRanks(s).length > 1"
                class="input input--sm"
                :aria-label="`Rank to cast ${s.name} at`"
                :value="castRank(s)"
                @change="castAt[s.id] = Number(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="o in castRanks(s)" :key="o.rank" :value="o.rank">
                  Rank {{ o.rank }} ({{ o.left }}){{
                    spontaneousRank(s, o.rank) < o.rank ? ', not heightened' : ''
                  }}
                </option>
              </select>
              <Pf2eSpellCastOptions
                v-if="byId.get(s.id)"
                v-model:actions="actionsFor[s.id]"
                v-model:melee="meleeFor[s.id]"
                v-model:targets="targetsFor[s.id]"
                :spell="byId.get(s.id)!"
                :rank="spontaneousRank(s, castRank(s))"
              />
            </div>
            <div class="spell__act">
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                :disabled="!canEdit || !castRanks(s).length || !!stopped || !!whyFor(s.id)"
                :title="whyFor(s.id) || undefined"
                :aria-label="`Cast ${s.name}`"
                @click="castFromSlot(s)"
              >
                {{ whyFor(s.id) || 'Cast' }}
              </button>
              <button
                v-if="edit"
                type="button"
                class="x"
                :aria-label="`Remove ${s.name}`"
                @click="remove('spells', s.id)"
              >
                ×
              </button>
            </div>
            <Pf2eSpellResult
              :result="resultFor(`spell:${s.id}`)"
              :offers="offersFor(`spell:${s.id}`)"
              :disabled="!canEdit"
              @heal="healSelf"
              @heal-target="healTarget"
              @temp="tempSelf"
              @buff="buffSelf"
              @blood="bloodSelf"
              @dismiss="lastCast = null"
            />
          </div>
        </details>
      </div>

      <div v-else-if="sc" class="spell-grid">
        <details
          v-for="(p, i) in r.prepared ?? []"
          :key="i"
          :name="`${panelId}-spell`"
          class="tile spell"
          :class="{ 'is-cast': p.cast }"
        >
          <summary class="spell__head">
            <strong>{{ p.id ? nameOf(p.id) : 'Empty slot' }}</strong>
            <template v-if="p.id">
              <span v-if="traitOf(p.id)" class="trad">{{ traitOf(p.id) }}</span>
              <Pf2eCostPill :cost="costOf(p.id)" />
            </template>
            <small>{{ p.cast ? 'spent' : p.id ? metaOf(p.id) : `rank ${r.rank}` }}</small>
          </summary>
          <div class="spell__body">
            <select
              class="input input--sm spell__slot"
              :aria-label="`Rank ${r.rank} slot ${i + 1}`"
              :value="p.id ?? ''"
              :disabled="!canEdit"
              @change="p.id = ($event.target as HTMLSelectElement).value || null"
            >
              <option value="">— empty —</option>
              <option v-for="o in fits(r.rank)" :key="o.id" :value="o.id">
                {{ o.name }}{{ o.rank < r.rank ? ` (heightened)` : '' }}
              </option>
            </select>
            <template v-if="p.id"
              ><!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
              <div
                v-if="byId.get(p.id)"
                class="spell__text"
                v-html="loreHtml(byId.get(p.id)!.text)"
            /></template>
            <div class="spell__meta">
              <Pf2eSpellCastOptions
                v-if="p.id && byId.get(p.id)"
                v-model:actions="actionsFor[p.id]"
                v-model:melee="meleeFor[p.id]"
                v-model:targets="targetsFor[p.id]"
                :spell="byId.get(p.id)!"
                :rank="r.rank"
              />
            </div>
            <div class="spell__act">
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                :disabled="!canEdit || !p.id || p.cast || !!stopped || !!whyFor(p.id)"
                :title="whyFor(p.id) || undefined"
                :aria-label="`Cast rank ${r.rank} slot ${i + 1}`"
                @click="castFromPrepared(r.rank, i, p.id)"
              >
                {{ p.cast ? 'Spent' : (p.id && whyFor(p.id)) || 'Cast' }}
              </button>
            </div>
            <Pf2eSpellResult
              :result="resultFor(`slot:${r.rank}:${i}`)"
              :offers="offersFor(`slot:${r.rank}:${i}`)"
              :disabled="!canEdit"
              @heal="healSelf"
              @heal-target="healTarget"
              @temp="tempSelf"
              @buff="buffSelf"
              @blood="bloodSelf"
              @dismiss="lastCast = null"
            />
          </div>
        </details>
      </div>
    </details>

    <details v-if="sc && sc.kind === 'prepared'" class="tier">
      <summary class="caps">Spells to prepare from</summary>
      <p class="small">
        <template v-for="(s, i) in sc.spells" :key="s.id">
          {{ i ? ', ' : '' }}{{ s.name }} <small class="muted">{{ s.rank }}</small>
          <button
            v-if="edit"
            type="button"
            class="x"
            :aria-label="`Remove ${s.name}`"
            @click="remove('spells', s.id)"
          >
            ×
          </button>
        </template>
      </p>
    </details>
    <button
      v-if="sc && edit"
      type="button"
      class="btn btn--ghost btn--sm add"
      @click="adding = 'spell'"
    >
      + Spell
    </button>

    <!-- Divine font -->
    <details v-if="sc?.font" class="tier" open>
      <summary class="rank-head">
        <span class="caps">Divine font · {{ sc.font.spell }}</span>
        <span
          class="pips"
          role="img"
          :aria-label="`${sc.font.max - sc.font.used} of ${sc.font.max} left`"
        >
          <i v-for="n in sc.font.max" :key="n" class="pip-dot" :class="{ on: n > sc.font.used }" />
        </span>
      </summary>
      <div class="tile spell spell--open">
        <div class="spell__body">
          <div class="spell__meta">
            <Pf2eSpellCastOptions
              v-if="fontDef && fontRank"
              v-model:actions="actionsFor[fontDef.id]"
              v-model:melee="meleeFor[fontDef.id]"
              v-model:targets="targetsFor[fontDef.id]"
              :spell="fontDef"
              :rank="fontRank"
            />
          </div>
          <div class="spell__act">
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="
                !canEdit ||
                sc.font.used >= sc.font.max ||
                !fontRank ||
                !!stopped ||
                !!whyFor(fontDef?.id)
              "
              :title="
                !fontRank
                  ? 'Your divine font casts at your highest slot rank: add slots first'
                  : whyFor(fontDef?.id) || undefined
              "
              @click="castFromFont"
            >
              {{
                whyFor(fontDef?.id) ||
                `Cast ${sc.font.spell}${fontRank ? ` · rank ${fontRank}` : ''}`
              }}
            </button>
          </div>
          <Pf2eSpellResult
            :result="resultFor('spell:font')"
            :offers="offersFor('spell:font')"
            :disabled="!canEdit"
            @heal="healSelf"
            @heal-target="healTarget"
            @temp="tempSelf"
            @buff="buffSelf"
            @blood="bloodSelf"
            @dismiss="lastCast = null"
          />
        </div>
      </div>
    </details>

    <!-- Focus spells -->
    <details v-if="!archetype && (sheet.focusSpells?.length || edit)" class="tier" open>
      <summary class="rank-head">
        <span class="caps">Focus spells · rank {{ heightenedRank(level) }}</span>
        <span
          class="pips"
          role="img"
          :aria-label="`${sheet.focus.current} of ${sheet.focus.max} Focus Points`"
        >
          <i
            v-for="n in sheet.focus.max"
            :key="n"
            class="pip-dot"
            :class="{ on: n <= sheet.focus.current }"
          />
        </span>
      </summary>
      <button
        type="button"
        class="btn btn--ghost btn--sm add"
        :disabled="!canEdit"
        @click="run(refocus(sheet))"
      >
        Refocus
      </button>
      <div class="spell-grid">
        <details
          v-for="s in sheet.focusSpells ?? []"
          :key="s.id"
          :name="`${panelId}-spell`"
          class="tile spell"
        >
          <summary class="spell__head">
            <strong>{{ s.name }}</strong>
            <span v-if="traitOf(s.id)" class="trad">{{ traitOf(s.id) }}</span>
            <Pf2eCostPill :cost="costOf(s.id)" />
            <small v-if="cantripIds.has(s.id)" class="tag">cantrip</small>
            <small>{{ metaOf(s.id) }}</small>
          </summary>
          <div class="spell__body">
            <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
            <div
              v-if="byId.get(s.id)"
              class="spell__text"
              v-html="loreHtml(byId.get(s.id)!.text)"
            />
            <div class="spell__meta">
              <Pf2eSpellCastOptions
                v-if="byId.get(s.id)"
                v-model:actions="actionsFor[s.id]"
                v-model:melee="meleeFor[s.id]"
                v-model:targets="targetsFor[s.id]"
                :spell="byId.get(s.id)!"
                :rank="heightenedRank(level)"
              />
            </div>
            <div class="spell__act">
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                :disabled="
                  !canEdit ||
                  (!cantripIds.has(s.id) && sheet.focus.current < 1) ||
                  !!stopped ||
                  !!whyFor(s.id)
                "
                :title="whyFor(s.id) || undefined"
                :aria-label="`Cast ${s.name}`"
                @click="castFocusSpell(s)"
              >
                {{ whyFor(s.id) || 'Cast' }}
              </button>
              <button
                v-if="edit"
                type="button"
                class="x"
                :aria-label="`Remove ${s.name}`"
                @click="remove('focus', s.id)"
              >
                ×
              </button>
            </div>
            <Pf2eSpellResult
              :result="resultFor(`spell:${s.id}`)"
              :offers="offersFor(`spell:${s.id}`)"
              :disabled="!canEdit"
              @heal="healSelf"
              @heal-target="healTarget"
              @temp="tempSelf"
              @buff="buffSelf"
              @blood="bloodSelf"
              @dismiss="lastCast = null"
            />
          </div>
        </details>
      </div>
      <div v-if="edit" class="row" style="gap: 8px">
        <button type="button" class="btn btn--ghost btn--sm add" @click="adding = 'focus'">
          + Focus spell
        </button>
        <label class="small">
          Pool
          <input
            v-model.number="sheet.focus.max"
            class="input input--sm pool"
            type="number"
            min="0"
            max="3"
          />
        </label>
      </div>
    </details>

    <div v-if="adding" class="adder panel">
      <label class="small" :for="`${panelId}-search`">
        Add a {{ adding === 'focus' ? 'focus spell' : adding
        }}{{ sc && adding !== 'focus' ? ` (${sc.tradition})` : '' }}
      </label>
      <div class="row" style="gap: 8px">
        <input
          :id="`${panelId}-search`"
          v-model="query"
          class="input"
          type="search"
          placeholder="Type 2+ letters"
          autofocus
        />
        <button type="button" class="btn btn--ghost btn--sm" @click="adding = null">Done</button>
      </div>
      <p v-if="!spells.length" class="small muted">Loading the spell list…</p>
      <ul class="adder__list">
        <li v-for="s in addOptions" :key="s.id">
          <button type="button" class="spell__name" @click="add(s)">
            {{ s.name }} <small>rank {{ s.rank }} · {{ s.rarity }}</small>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/spells';
@use '../../assets/styles/spells-list';

.rank-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.spell.is-cast .spell__head strong {
  text-decoration: line-through;
  opacity: 0.7;
}

.spell--open {
  padding-top: 12px;
}

.trad {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 22%, var(--field));
  color: color-mix(in srgb, var(--secondary) 45%, var(--page-text));
}

.spell__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  font-size: 12px;
  color: var(--page-soft);

  &:empty {
    display: none;
  }
}

.spell__act {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
}

.spell__text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--page-soft);

  :deep(p) {
    margin: 0.3em 0;
  }
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 10px;
}

.head__tile {
  min-width: 120px;
  padding: 10px 14px;
  text-align: left;
  font: inherit;
  color: inherit;
}

button.head__tile {
  cursor: pointer;
}

.head__tools {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.is-changed .tile__value {
  color: var(--warn-text);
}

.spell__stopped {
  margin: 0;
  font-weight: 600;
  color: var(--danger-text);
}

.spell__slot {
  width: 100%;
  max-width: 320px;
}

.pips {
  display: inline-flex;
  gap: 4px;
}

.pip-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px var(--page-muted);

  &.on {
    background: var(--accent-ink);
    box-shadow: none;
  }
}

.tag {
  margin-left: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.x {
  border: 0;
  background: none;
  color: var(--danger-text);
  font-size: 18px;
  line-height: 1;
  min-width: 28px;
  min-height: 28px;
  cursor: pointer;
}

.add {
  align-self: flex-start;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;

  input {
    accent-color: var(--accent);
  }
}

.input--sm {
  width: auto;
  min-height: 34px;
  padding: 4px 8px;
  font-size: 13px;
}

select.input--sm {
  flex: 0 0 auto;
  padding-right: 30px;
}

.pool {
  width: 60px;
  margin-left: 6px;
}

.target {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;

  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
}

.ac {
  width: 64px;
}

.adder {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.adder__list {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    border-bottom: 1px solid var(--track);
  }
}

@media (pointer: coarse) {
  .input--sm {
    min-height: 44px;
  }
}
</style>
