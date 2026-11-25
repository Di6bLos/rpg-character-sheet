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
import type { Pf2eSheet, Pf2eSpellRef } from '~/types/sheets'
import { rollCheck, showOutcome, sign } from '~/utils/dice'
import { actionGlyph } from '~/utils/pf2eBuild'
import { type Pf2eBloodMagic, bloodMagic } from '~/utils/pf2eClassActions'
import { pf2eEffectDef, toggleEffect } from '~/utils/pf2eEffects'
import { heal } from '~/utils/pf2ePlay'
import {
  castCantrip,
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
  refocus,
  setSlotMax,
  spellNumbers,
  spontaneousRank,
} from '~/utils/pf2eSpells'
import { defaultActions, spellRules } from '~/utils/pf2eSpellRules'
import { readCost } from '~/utils/pf2eAbilityRules'
import { actionCostLabel, attacked } from '~/utils/pf2eActions'
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
const costName = (id: string) => actionCostLabel(readCost(byId.value.get(id)?.actions))
const sheet = computed(() => draft.value.sheet)
const sc = computed(() =>
  props.archetype
    ? sheet.value.archetypeCasting?.find((e) => e.archetype === props.archetype)
    : sheet.value.spellcasting,
)
const level = computed(() => draft.value.level)

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
/** Focus-only heroes cast with their class DC. */
const castNumbers = computed(() => numbers.value ?? focusNumbers(sheet.value))
const ranks = computed(() =>
  (sc.value?.slots ?? [])
    .map((r, i) => ({ rank: i + 1, ...r }))
    .filter((r) => r.max > 0 || edit.value),
)
const edit = ref(false)
const open = ref<string | null>(null)

function rollSpellAttack() {
  const n = numbers.value
  if (!n) return
  claim('spells-head', () => {
    const r = rollCheck(n.attack.value)
    const line = `Spell attack: ${r.total} (${r.d20} ${sign(n.attack.value)})`
    showOutcome({ label: 'Spell attack', total: r.total, detail: line })
    say(line)
  })
}

/** Ranks with a slot left that this spell can be cast at (its own rank or higher). */
function castRanks(spell: Pf2eSpellRef) {
  return (sc.value?.slots ?? [])
    .map((r, i) => ({ rank: i + 1, left: r.max - r.used }))
    .filter((r) => r.rank >= spell.rank && r.left > 0)
}
const castAt = ref<Record<string, number>>({})
const castRank = (spell: Pf2eSpellRef) =>
  castAt.value[spell.id] ?? castRanks(spell)[0]?.rank ?? spell.rank
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
 * While the turn tracker runs, a cast spends its actions (or the reaction), and a spell
 * attack counts toward the multiple attack penalty for Strikes and the next spell attack.
 */
function payCast(def: Pf2eSpellDef) {
  const t = sheet.value.turn
  const cost = readCost(def.actions)
  if (t && cost?.kind === 'reaction') t.reaction = false
  if (t?.active && cost?.kind === 'actions')
    t.actions = Math.max(0, t.actions - (actionsOf(def) ?? cost.min))
  if (spellRules(def).attack) attacked(sheet.value)
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
  message: string,
  def: Pf2eSpellDef | undefined,
  rank: number,
  key = `spell:${def?.id ?? ''}`,
) {
  if (!canEdit.value) return
  claim(key, () => castIn(key, message, def, rank))
}

function castIn(key: string, message: string, def: Pf2eSpellDef | undefined, rank: number) {
  lastCast.value = null
  if (!def || !castWentOff(message)) return say(message)
  const r = castEffect(sheet.value, def, rank, level.value, {
    sc: sc.value,
    actions: actionsOf(def),
    melee: !!meleeFor.value[def.id],
    attackNumber: attackNumber.value,
    targetAc: targetAc.value,
  })
  payCast(def)
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
    castSpontaneous(sheet.value, s, slot, sc.value),
    byId.value.get(s.id),
    spontaneousRank(s, slot),
  )
}

function castFromPrepared(rank: number, index: number, id: string | null) {
  cast(
    castPrepared(sheet.value, rank, index, sc.value),
    id ? byId.value.get(id) : undefined,
    rank,
    `slot:${rank}:${index}`,
  )
}

const fontDef = computed(() =>
  sc.value?.font
    ? spells.value.find(
        (x) => x.kind === 'spell' && x.name.toLowerCase() === sc.value!.font!.spell.toLowerCase(),
      )
    : undefined,
)
function castFromFont() {
  const rank = fontRank.value
  cast(castFont(sheet.value), fontDef.value, rank, 'spell:font')
}

function healSelf() {
  const last = lastCast.value
  if (!canEdit.value || !last?.healing) return
  claim(last.key, () => say(`${last.def.name}: ${heal(sheet.value, last.healing!)}`))
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
    <UiFold :name="archetype ? `${archetype} archetype spells` : 'Spells'" />
    <div class="panel-title" style="margin: 0">
      <h2 :id="`${panelId}-h`">{{ archetype ? `${archetype} archetype spells` : 'Spells' }}</h2>
      <span v-if="sc" class="small muted">{{ sc.tradition }} · {{ sc.kind }}</span>
    </div>

    <div class="head">
      <button
        v-if="numbers"
        type="button"
        class="tile head__tile"
        :class="{ 'is-changed': numbers.attack.changed }"
        :title="numbers.attack.changed ? numbers.attack.note : 'Roll a spell attack'"
        @click="rollSpellAttack"
      >
        <span class="tile__label">Spell attack</span>
        <span class="tile__value">{{ sign(numbers.attack.value) }}</span>
      </button>
      <div
        v-if="numbers"
        class="tile head__tile"
        :class="{ 'is-changed': numbers.dc.changed }"
        :title="numbers.dc.changed ? numbers.dc.note : undefined"
      >
        <span class="tile__label">Spell DC</span>
        <span class="tile__value">{{ numbers.dc.value }}</span>
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
    <p v-if="resultFor('spells-head')" class="roll-status" role="status" aria-live="polite">
      {{ resultFor('spells-head') }}
    </p>

    <div v-if="hasAttackSpell" class="target">
      <label class="small">
        AC
        <input
          v-model.number="targetAc"
          class="input input--sm ac"
          type="number"
          min="0"
          max="60"
          placeholder="?"
          aria-label="Target AC"
        />
      </label>
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
        text="AC: the target's Armor Class, shared with the Strikes table, so a spell attack says hit or miss. The attack this is follows the turn tracker's count of attacks this turn (the multiple attack penalty); change it if you need to."
      />
    </div>

    <!-- Cantrips -->
    <div v-if="sc" class="group">
      <h3 class="caps">Cantrips · rank {{ heightenedRank(level) }}</h3>
      <div v-for="s in sc.cantrips" :key="s.id" class="spell">
        <button
          type="button"
          class="spell__name"
          :aria-expanded="open === s.id"
          @click="open = open === s.id ? null : s.id"
        >
          {{ s.name }}
          <small aria-hidden="true">{{ actionGlyph(byId.get(s.id)?.actions) }}</small
          ><span class="sr-only">{{ costName(s.id) }}</span>
        </button>
        <div class="spell__meta">
          <Pf2eSpellCastOptions
            v-if="byId.get(s.id)"
            v-model:actions="actionsFor[s.id]"
            v-model:melee="meleeFor[s.id]"
            :spell="byId.get(s.id)!"
            :rank="heightenedRank(level)"
          />
        </div>
        <div class="spell__act">
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit"
            :aria-label="`Cast ${s.name}`"
            @click="cast(castCantrip(sheet, s, level), byId.get(s.id), heightenedRank(level))"
          >
            Cast
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
        <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
        <div
          v-if="open === s.id && byId.get(s.id)"
          class="spell__text"
          v-html="loreHtml(byId.get(s.id)!.text)"
        />
        <Pf2eSpellResult
          :result="resultFor(`spell:${s.id}`)"
          :offers="offersFor(`spell:${s.id}`)"
          :disabled="!canEdit"
          @heal="healSelf"
          @temp="tempSelf"
          @buff="buffSelf"
          @blood="bloodSelf"
          @dismiss="lastCast = null"
        />
      </div>
      <button
        v-if="edit"
        type="button"
        class="btn btn--ghost btn--sm add"
        @click="adding = 'cantrip'"
      >
        + Cantrip
      </button>
    </div>

    <!-- Slots by rank -->
    <div v-for="r in ranks" :key="r.rank" class="group">
      <div class="rank-head">
        <h3 class="caps">Rank {{ r.rank }}</h3>
        <span
          v-if="sc?.kind === 'spontaneous'"
          class="pips"
          role="img"
          :aria-label="`${r.max - r.used} of ${r.max} rank ${r.rank} slots left`"
        >
          <i v-for="n in r.max" :key="n" class="pip-dot" :class="{ on: n > r.used }" />
        </span>
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
      </div>

      <template v-if="sc?.kind === 'spontaneous'">
        <div v-for="s in sc.spells.filter((x) => x.rank === r.rank)" :key="s.id" class="spell">
          <button
            type="button"
            class="spell__name"
            :aria-expanded="open === s.id"
            @click="open = open === s.id ? null : s.id"
          >
            {{ s.name }}
            <small aria-hidden="true">{{ actionGlyph(byId.get(s.id)?.actions) }}</small
            ><span class="sr-only">{{ costName(s.id) }}</span>
            <small v-if="s.signature && !edit" class="tag">signature</small>
          </button>
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
              :spell="byId.get(s.id)!"
              :rank="spontaneousRank(s, castRank(s))"
            />
          </div>
          <div class="spell__act">
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit || !castRanks(s).length"
              :aria-label="`Cast ${s.name}`"
              @click="castFromSlot(s)"
            >
              Cast
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
          <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
          <div
            v-if="open === s.id && byId.get(s.id)"
            class="spell__text"
            v-html="loreHtml(byId.get(s.id)!.text)"
          />
          <Pf2eSpellResult
            :result="resultFor(`spell:${s.id}`)"
            :offers="offersFor(`spell:${s.id}`)"
            :disabled="!canEdit"
            @heal="healSelf"
            @temp="tempSelf"
            @buff="buffSelf"
            @blood="bloodSelf"
            @dismiss="lastCast = null"
          />
        </div>
      </template>

      <template v-else-if="sc">
        <div
          v-for="(p, i) in r.prepared ?? []"
          :key="i"
          class="spell"
          :class="{ 'is-cast': p.cast }"
        >
          <div class="spell__name spell__name--slot">
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
          </div>
          <div class="spell__meta">
            <Pf2eSpellCastOptions
              v-if="p.id && byId.get(p.id)"
              v-model:actions="actionsFor[p.id]"
              v-model:melee="meleeFor[p.id]"
              :spell="byId.get(p.id)!"
              :rank="r.rank"
            />
            <span v-if="p.cast" class="small muted">spent</span>
            <span v-else-if="p.id" class="sr-only">{{ nameOf(p.id) }} ready</span>
          </div>
          <div class="spell__act">
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit || !p.id || p.cast"
              :aria-label="`Cast rank ${r.rank} slot ${i + 1}`"
              @click="castFromPrepared(r.rank, i, p.id)"
            >
              Cast
            </button>
          </div>
          <Pf2eSpellResult
            :result="resultFor(`slot:${r.rank}:${i}`)"
            :offers="offersFor(`slot:${r.rank}:${i}`)"
            :disabled="!canEdit"
            @heal="healSelf"
            @temp="tempSelf"
            @buff="buffSelf"
            @blood="bloodSelf"
            @dismiss="lastCast = null"
          />
        </div>
      </template>
    </div>

    <div v-if="sc && sc.kind === 'prepared'" class="group">
      <h3 class="caps">Spells to prepare from</h3>
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
    </div>
    <button
      v-if="sc && edit"
      type="button"
      class="btn btn--ghost btn--sm add"
      @click="adding = 'spell'"
    >
      + Spell
    </button>

    <!-- Divine font -->
    <div v-if="sc?.font" class="group">
      <div class="rank-head">
        <h3 class="caps">Divine font · {{ sc.font.spell }}</h3>
        <span
          class="pips"
          role="img"
          :aria-label="`${sc.font.max - sc.font.used} of ${sc.font.max} left`"
        >
          <i v-for="n in sc.font.max" :key="n" class="pip-dot" :class="{ on: n > sc.font.used }" />
        </span>
      </div>
      <div class="spell">
        <div class="spell__meta">
          <Pf2eSpellCastOptions
            v-if="fontDef && fontRank"
            v-model:actions="actionsFor[fontDef.id]"
            v-model:melee="meleeFor[fontDef.id]"
            :spell="fontDef"
            :rank="fontRank"
          />
        </div>
        <div class="spell__act">
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit || sc.font.used >= sc.font.max || !fontRank"
            :title="
              !fontRank
                ? 'Your divine font casts at your highest slot rank: add slots first'
                : undefined
            "
            @click="castFromFont"
          >
            Cast {{ sc.font.spell }}{{ fontRank ? ` · rank ${fontRank}` : '' }}
          </button>
        </div>
        <Pf2eSpellResult
          :result="resultFor('spell:font')"
          :offers="offersFor('spell:font')"
          :disabled="!canEdit"
          @heal="healSelf"
          @temp="tempSelf"
          @buff="buffSelf"
          @blood="bloodSelf"
          @dismiss="lastCast = null"
        />
      </div>
    </div>

    <!-- Focus spells -->
    <div v-if="!archetype && (sheet.focusSpells?.length || edit)" class="group">
      <div class="rank-head">
        <h3 class="caps">Focus spells · rank {{ heightenedRank(level) }}</h3>
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
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="run(refocus(sheet))"
        >
          Refocus
        </button>
      </div>
      <div v-for="s in sheet.focusSpells ?? []" :key="s.id" class="spell">
        <button
          type="button"
          class="spell__name"
          :aria-expanded="open === s.id"
          @click="open = open === s.id ? null : s.id"
        >
          {{ s.name }}
          <small aria-hidden="true">{{ actionGlyph(byId.get(s.id)?.actions) }}</small
          ><span class="sr-only">{{ costName(s.id) }}</span>
          <small v-if="cantripIds.has(s.id)"> · cantrip</small>
        </button>
        <div class="spell__meta">
          <Pf2eSpellCastOptions
            v-if="byId.get(s.id)"
            v-model:actions="actionsFor[s.id]"
            v-model:melee="meleeFor[s.id]"
            :spell="byId.get(s.id)!"
            :rank="heightenedRank(level)"
          />
        </div>
        <div class="spell__act">
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit || (!cantripIds.has(s.id) && sheet.focus.current < 1)"
            :aria-label="`Cast ${s.name}`"
            @click="
              cast(
                castFocus(sheet, s, level, cantripIds.has(s.id)),
                byId.get(s.id),
                heightenedRank(level),
              )
            "
          >
            Cast
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
        <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
        <div
          v-if="open === s.id && byId.get(s.id)"
          class="spell__text"
          v-html="loreHtml(byId.get(s.id)!.text)"
        />
        <Pf2eSpellResult
          :result="resultFor(`spell:${s.id}`)"
          :offers="offersFor(`spell:${s.id}`)"
          :disabled="!canEdit"
          @heal="healSelf"
          @temp="tempSelf"
          @buff="buffSelf"
          @blood="bloodSelf"
          @dismiss="lastCast = null"
        />
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
    </div>

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

.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rank-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.spell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'name act'
    'meta act';
  align-items: center;
  column-gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--track);

  &.is-cast .spell__slot {
    text-decoration: line-through;
    opacity: 0.7;
  }
}

.spell__name {
  grid-area: name;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;

  small {
    font-weight: 400;
    color: var(--page-muted);
  }
}

.spell__name--slot {
  display: flex;
  align-items: center;
}

.spell__meta {
  grid-area: meta;
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
  grid-area: act;
  display: flex;
  align-items: center;
  gap: 4px;
}

.spell__slot {
  width: 100%;
  max-width: 320px;
}

.spell__text {
  grid-column: 1 / -1;
  font-size: 13px;
  line-height: 1.5;
  color: var(--page-soft);

  :deep(p) {
    margin: 0.3em 0;
  }
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

.group > .caps,
.rank-head .caps {
  color: var(--page-soft);
}

@media (pointer: coarse) {
  .spell__name,
  .input--sm {
    min-height: 44px;
  }
}
</style>
