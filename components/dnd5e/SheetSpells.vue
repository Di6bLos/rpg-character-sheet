<script setup lang="ts">
// The 5e sheet's Spells, laid out like Nimble's and PF2e's: the spell attack and save DC, slot
// pips per level and the Pact Magic slots (tap to spend or restore), then cantrips and each
// spell level folding, every spell a card (`.tile.spell`) of the same three lines: name and its
// Conc. / Ritual / Always / Free tags; cost (or casting time), range and duration; the summary
// clamped to two lines (left out on a phone). Open, it spans the grid with its school, text, what
// it casts with
// (slot levels to upcast, a pact slot, free casts, a Ritual), Cast and the result, and "Heal
// yourself" for healing. Spellbook spells not prepared fold away (rituals only, with Ritual
// Adept). A multiclass hero (SRD 5.2.1 p. 25) sees the shared slots and the Pact Magic row on
// top, then each spellcasting class's spells under its own attack, DC and highest spell level;
// spells from elsewhere (a feat, an invocation) follow. Casting is useDnd5eCasting's, the
// slots useDnd5eSpellSlots' (utils/dnd5eSpells.ts, SRD 5.2.1 pp. 104–106).
import type { Dnd5eClassCasting, Dnd5eSheet, Dnd5eSpellRef } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { classOfSource } from '~/utils/dnd5ePlay'
import { levelName, spellCost, spellNumbers } from '~/utils/dnd5eSpells'
import { loreHtml } from '~/utils/loreText'
import { tipText } from '~/utils/ruleTips'

const { draft, canEdit } = useSheet<Dnd5eSheet>()
const { resultFor } = useResultOwner()
const casting = useDnd5eCasting()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const sc = computed(() => sheet.value.castingStats)

const nums = computed(() =>
  sc.value ? spellNumbers(sheet.value, level.value, { ability: sc.value.ability }) : null,
)

const { levels, pact, toggleSlot, togglePact, casters } = useDnd5eSpellSlots()
const multi = computed(() => casters.value.length > 0)

const known = computed(() => casting.spells.value.filter((r) => !r.book))
const book = computed(() => casting.spells.value.filter((r) => r.book))

/** Spells by level; on one class each level carries its slots. */
function groupsOf(spells: Dnd5eSpellRef[], withSlots: boolean) {
  return Array.from({ length: 10 }, (_, lvl) => {
    const row = withSlots && lvl ? levels.value.find((l) => l.level === lvl) : undefined
    return {
      level: lvl,
      spells: spells.filter((r) => r.level === lvl),
      max: row?.max ?? 0,
      left: row?.left ?? 0,
    }
  }).filter((g) => g.spells.length || g.max)
}

interface Section {
  key: string
  cc: Dnd5eClassCasting | null
  title: string
  groups: ReturnType<typeof groupsOf>
}

/** One section on one class; a multiclass hero's spells by the class they come from. */
const sections = computed<Section[]>(() => {
  if (!multi.value)
    return [{ key: 'all', cc: null, title: '', groups: groupsOf(known.value, true) }]
  const by = new Map<string, Dnd5eSpellRef[]>()
  for (const r of known.value) {
    const slug = classOfSource(sheet.value, r.from)?.slug ?? ''
    const key = casters.value.some((c) => c.cc.classSlug === slug) ? slug : ''
    by.set(key, [...(by.get(key) ?? []), r])
  }
  const out: Section[] = casters.value.map((c) => ({
    key: c.cc.classSlug,
    cc: c.cc,
    title: c.cc.className,
    groups: groupsOf(by.get(c.cc.classSlug) ?? [], false),
  }))
  const other = by.get('') ?? []
  if (other.length)
    out.push({ key: 'other', cc: null, title: 'Other spells', groups: groupsOf(other, false) })
  return out
})
const casterOf = (slug: string) => casters.value.find((c) => c.cc.classSlug === slug)

function meta(r: Dnd5eSpellRef) {
  const d = casting.defOf(r.slug)
  if (!d) return r.from
  const lasts = d.duration.replace(/^Concentration, /, '').replace(/^Instantaneous$/, 'Instant')
  return [d.range, lasts].filter(Boolean).join(' · ')
}

function tags(r: Dnd5eSpellRef) {
  const d = casting.defOf(r.slug)
  return [
    ...(d?.concentration ? [{ t: 'Conc.', title: 'Concentration: one such spell at a time' }] : []),
    ...(d?.ritual
      ? [{ t: 'Ritual', title: 'Ritual: cast it without a slot, 10 minutes longer' }]
      : []),
    ...(r.always ? [{ t: 'Always', title: `Always prepared (${r.from})` }] : []),
    ...(r.free ? [{ t: 'Free', title: `Free cast from ${r.from}` }] : []),
  ]
}

function gist(r: Dnd5eSpellRef) {
  const d = casting.defOf(r.slug)
  return tipText(d?.summary ?? d?.text ?? '', 200)
}

const components = (r: Dnd5eSpellRef) => {
  const c = casting.defOf(r.slug)?.components
  if (!c) return ''
  return [c.v && 'V', c.s && 'S', c.m && `M (${c.m})`].filter(Boolean).join(', ')
}
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="sp-h">
    <UiFold name="Spells" />
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="sp-h">Spells</h2>
        <UiHelp
          label="About spells"
          text="Casting spends a slot of the spell's level or higher (a higher slot upcasts it); on your turn only one spell slot is spent (SRD 5.2.1 p. 105). Cantrips grow at levels 5, 11 and 17. A Ritual spell can be cast without a slot, 10 minutes longer. Concentration: one spell at a time (p. 179). Your save DC is 8 + your ability modifier + PB, your spell attack that modifier + PB (p. 106)."
        />
      </div>
      <span v-if="sc && !multi" class="small muted">{{ sc.ability }} · {{ sc.list }}</span>
    </div>

    <div v-if="multi" class="slot-rows">
      <div v-for="l in levels" :key="l.level" class="slot-row">
        <span class="caps">{{ l.label }}</span>
        <span
          class="slots"
          role="group"
          :aria-label="`${l.left} of ${l.max} ${l.label} slots left`"
        >
          <button
            v-for="n in Math.max(l.max, l.left)"
            :key="n"
            type="button"
            class="slot"
            :class="{ on: n <= l.left }"
            :aria-label="`${l.label} slot ${n}`"
            :aria-pressed="n <= l.left"
            :disabled="!canEdit"
            @click="toggleSlot(l.level, n)"
          />
        </span>
        <small>{{ l.left }} / {{ l.max }}</small>
      </div>
      <div v-if="pact" class="slot-row">
        <span class="caps">Pact Magic · {{ pact.label }}</span>
        <span class="slots" role="group" aria-label="Pact Magic slots">
          <button
            v-for="n in pact.slots"
            :key="n"
            type="button"
            class="slot"
            :class="{ on: n <= pact.left }"
            :aria-label="`Pact slot ${n}`"
            :aria-pressed="n <= pact.left"
            :disabled="!canEdit"
            @click="togglePact(n)"
          />
        </span>
        <small>{{ pact.left }} / {{ pact.slots }}</small>
      </div>
    </div>

    <div v-else-if="nums" class="head">
      <div class="tile head__tile">
        <span class="tile__label">Spell attack</span>
        <span class="tile__value">{{ sign(nums.attack) }}</span>
      </div>
      <div class="tile head__tile" :class="{ 'is-changed': nums.dc !== sc?.saveDc }">
        <span class="tile__label">Save DC</span>
        <span class="tile__value">{{ nums.dc }}</span>
      </div>
      <div v-if="pact" class="tile head__tile">
        <span class="tile__label">Pact slots · level {{ pact.level }}</span>
        <span class="slots" role="group" aria-label="Pact Magic slots">
          <button
            v-for="n in pact.slots"
            :key="n"
            type="button"
            class="slot"
            :class="{ on: n <= pact.left }"
            :aria-label="`Pact slot ${n}`"
            :aria-pressed="n <= pact.left"
            :disabled="!canEdit"
            @click="togglePact(n)"
          />
        </span>
      </div>
    </div>

    <template v-for="sec in sections" :key="sec.key">
      <div v-if="sec.title" class="caster">
        <strong>{{ sec.title }}</strong>
        <span v-if="sec.cc" class="small muted"
          >{{ sec.cc.ability }} · spell attack
          {{ sign(casterOf(sec.key)?.attack ?? sec.cc.attack) }} ·
          <span :class="{ 'is-changed': casterOf(sec.key)?.changed }"
            >save DC {{ casterOf(sec.key)?.dc ?? sec.cc.saveDc }}</span
          >
          ·
          {{ sec.cc.maxSpellLevel ? `up to ${levelName(sec.cc.maxSpellLevel)}` : 'cantrips' }}</span
        >
        <span v-else class="small muted">each with its own ability</span>
      </div>
      <details v-for="g in sec.groups" :key="g.level" class="tier" open>
        <summary class="rank-head">
          <span class="caps">{{ g.level ? levelName(g.level) : 'Cantrips' }}</span>
          <span
            v-if="g.max || g.left"
            class="slots"
            role="group"
            :aria-label="`${g.left} of ${g.max} ${levelName(g.level)} slots left`"
            @click.prevent
          >
            <button
              v-for="n in Math.max(g.max, g.left)"
              :key="n"
              type="button"
              class="slot"
              :class="{ on: n <= g.left }"
              :aria-label="`${levelName(g.level)} slot ${n}`"
              :aria-pressed="n <= g.left"
              :disabled="!canEdit"
              @click="toggleSlot(g.level, n)"
            />
          </span>
          <small v-if="g.max">{{ g.left }} / {{ g.max }}</small>
        </summary>
        <div class="spell-grid">
          <details v-for="r in g.spells" :key="r.slug" name="dnd5e-spell" class="tile spell">
            <summary class="spell__head">
              <span class="spell__top">
                <strong class="spell__name" :title="r.name">{{ r.name }}</strong>
                <span v-for="t in tags(r)" :key="t.t" class="tag" :title="t.title"
                  ><span aria-hidden="true">{{ t.t }}</span
                  ><span class="sr-only">{{ t.title }}</span></span
                >
              </span>
              <span class="spell__line">
                <Dnd5eCostPill
                  v-if="casting.defOf(r.slug)"
                  :cost="spellCost(casting.defOf(r.slug)!)"
                  :text="
                    spellCost(casting.defOf(r.slug)!) === 'time'
                      ? casting.defOf(r.slug)!.castingTime
                      : undefined
                  "
                />
                <small>{{ meta(r) }}</small>
              </span>
              <span class="spell__gist">{{ gist(r) }}</span>
            </summary>
            <div class="spell__body">
              <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
              <div
                class="spell__text"
                v-html="
                  loreHtml(casting.defOf(r.slug)?.text ?? casting.defOf(r.slug)?.summary ?? '')
                "
              />
              <p v-if="casting.defOf(r.slug)?.higherLevel" class="small muted">
                <strong>Higher levels.</strong> {{ casting.defOf(r.slug)!.higherLevel }}
              </p>
              <p class="small muted">
                {{ casting.defOf(r.slug)?.school }} · {{ casting.defOf(r.slug)?.castingTime }} ·
                {{ components(r) }} · from {{ r.from }}
              </p>
              <p v-if="casting.damage(r)" class="small dmg">{{ casting.damage(r) }}</p>
              <div class="spell__act">
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
                  class="btn btn--sm"
                  :disabled="!canEdit || !!casting.why(r)"
                  :aria-label="`${casting.why(r) || 'Cast'}, ${r.name}`"
                  @click="casting.cast(r)"
                >
                  {{ casting.why(r) || 'Cast' }}
                </button>
              </div>
              <NimbleDiceEntry
                v-if="casting.typed.prompt(`spell:${r.slug}`)"
                :label="casting.typed.prompt(`spell:${r.slug}`)"
                action="Roll"
                :disabled="!canEdit"
                @submit="casting.typed.submit"
              />
              <p v-if="resultFor(`spell:${r.slug}`)" class="roll-status" role="status">
                {{ resultFor(`spell:${r.slug}`) }}
              </p>
              <button
                v-if="casting.healed.value?.key === `spell:${r.slug}`"
                type="button"
                class="btn btn--ghost btn--sm"
                :disabled="!canEdit"
                @click="casting.healSelf()"
              >
                Heal yourself {{ casting.healed.value.amount }}
              </button>
            </div>
          </details>
        </div>
      </details>
    </template>

    <details v-if="book.length" class="tier">
      <summary class="caps">Spellbook · not prepared ({{ book.length }})</summary>
      <div class="spell-grid">
        <details v-for="r in book" :key="r.slug" name="dnd5e-spell" class="tile spell">
          <summary class="spell__head">
            <span class="spell__top">
              <strong class="spell__name" :title="r.name">{{ r.name }}</strong>
              <span v-for="t in tags(r)" :key="t.t" class="tag" :title="t.title"
                ><span aria-hidden="true">{{ t.t }}</span
                ><span class="sr-only">{{ t.title }}</span></span
              >
            </span>
            <span class="spell__line">
              <small>{{ [levelName(r.level), meta(r)].filter(Boolean).join(' · ') }}</small>
            </span>
            <span class="spell__gist">{{ gist(r) }}</span>
          </summary>
          <div class="spell__body">
            <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
            <div
              class="spell__text"
              v-html="loreHtml(casting.defOf(r.slug)?.text ?? casting.defOf(r.slug)?.summary ?? '')"
            />
            <button
              v-if="casting.options(r).length"
              type="button"
              class="btn btn--sm"
              :disabled="!canEdit || !!casting.why(r)"
              @click="casting.cast(r)"
            >
              {{ casting.why(r) || 'Cast as a Ritual' }}
            </button>
            <p v-if="resultFor(`spell:${r.slug}`)" class="roll-status" role="status">
              {{ resultFor(`spell:${r.slug}`) }}
            </p>
          </div>
        </details>
      </div>
    </details>
    <p v-if="!casting.spells.value.length" class="empty">No spells recorded.</p>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/spells';
@use '../../assets/styles/spells-list';

.head {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(130px, 100%), 1fr));
  gap: 8px;
}

.head__tile {
  gap: 4px;
  padding: 12px;
}

.slot-rows {
  display: grid;
  gap: 6px;
}

.slot-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;

  .caps {
    min-width: 7.5em;
  }
}

.caster {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}

.slots {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.slot {
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 4px;
  border: 1.5px solid var(--secondary);
  background: transparent;
  cursor: pointer;

  &.on {
    background: var(--secondary);
  }

  &:disabled {
    cursor: default;
  }
}

// Every closed card has the same three lines, so the cards of a level line up; an open one takes
// the whole row.
.spell-grid {
  align-items: stretch;
}

.spell[open] {
  grid-column: 1 / -1;
}

.spell > .spell__head {
  display: grid;
  gap: 4px;
  align-content: start;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }
}

.spell__top,
.spell__line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}

.spell__name {
  min-width: 0;
  margin-right: auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spell__line small {
  min-width: 0;
  margin-left: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spell__gist {
  display: -webkit-box;
  min-height: calc(2 * 1.45em);
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--page-soft);
}

.spell[open] .spell__gist {
  display: none;
}

.spell[open] .spell__name {
  white-space: normal;
}

@media (max-width: 560px) {
  .spell__gist {
    display: none;
  }
}

.tag {
  flex: none;
  font-size: 10px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  color: var(--page-soft);
}

.spell__text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--page-soft);

  :deep(p) {
    margin: 0.3em 0;
  }
}

.dmg {
  margin: 0;
  font-weight: 700;
  color: var(--accent-text);
}

.spell__act {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;

  .btn {
    flex: 1 1 100px;
  }
}

// On touch the slots are 30px boxes 44px apart, each with a 44px target.
@media (pointer: coarse) {
  .slots {
    gap: 14px;
  }

  .slot {
    position: relative;
    width: 30px;
    height: 30px;

    &::after {
      content: '';
      position: absolute;
      inset: -8.5px;
    }
  }

  .rank-head {
    flex-wrap: wrap;
  }
}
</style>
