<script setup lang="ts">
// The Artificer's item features in the 5e Inventory (utils/dnd5eArtificer.ts): Replicate Magic
// Item (a known plan → an inventory item, a weapon plan enchanting a weapon you pick, up to the
// Magic Items column, the oldest vanishing first) and, from level 11, the Spell-Storing Item
// (store a level 1–3 Artificer spell; Use spends one of its twice-INT uses and casts it).
import type { Dnd5eSheet } from '~/types/sheets'
import {
  knownPlans,
  planKind,
  replicaCap,
  replicate,
  storableSpells,
  storeSpell,
  useStoredSpell,
} from '~/utils/dnd5eArtificer'
import { dnd5eHero } from '~/utils/dnd5ePlay'

const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim, resultIn } = useResultOwner()
const { data, columns } = useDnd5eSheet()
const casting = useDnd5eCasting()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)

const plans = computed(() =>
  knownPlans(sheet.value, data.value?.options.find((g) => g.slug === 'plans')?.entries ?? []),
)
const cap = computed(() => replicaCap(columns.value))
const made = computed(() => sheet.value.inventory.filter((i) => i.replicated).length)
const plan = ref('')
const weapon = ref(0)
const chosen = computed(() => plans.value.find((p) => p.slug === plan.value))

function make() {
  const p = chosen.value
  if (!canEdit.value || !p) return
  claim('art:', () => say(replicate(sheet.value, p, columns.value, weapon.value)))
}

const storing = computed(() => dnd5eHero(sheet.value, level.value).has('Spell-Storing Item'))
const storable = computed(() => storableSpells(data.value?.spells ?? []))
const toStore = ref('')

function store() {
  const def = storable.value.find((d) => d.slug === toStore.value)
  if (canEdit.value && def) claim('art:', () => say(storeSpell(sheet.value, level.value, def)))
}

function castStored() {
  const st = sheet.value.storedSpell
  if (!canEdit.value || !st) return
  const ref = casting.spells.value.find((r) => r.slug === st.slug) ?? {
    slug: st.slug,
    name: st.name,
    level: st.level,
    from: 'Spell-Storing Item',
    ability: 'INT' as const,
    atWill: true,
  }
  const stored = { ...ref, atWill: true, book: false, always: true }
  delete stored.free
  const why = casting.why(stored)
  if (why) return claim('art:', () => say(`${st.name}: ${why}.`))
  const line = useStoredSpell(sheet.value)
  claim('art:', () => say(line))
  casting.cast(stored)
}
</script>

<template>
  <div class="tile art stack" style="gap: 8px">
    <div class="row" style="justify-content: space-between; gap: 8px; flex-wrap: wrap">
      <strong>Replicate Magic Item</strong>
      <span class="small muted">{{ made }} / {{ cap }} items made</span>
    </div>
    <div class="row" style="gap: 6px; flex-wrap: wrap">
      <label class="sr-only" for="art-plan">Plan</label>
      <select id="art-plan" v-model="plan" class="input input--sm" :disabled="!canEdit">
        <option value="">A plan you know…</option>
        <option v-for="p in plans" :key="p.slug" :value="p.slug" :title="p.summary">
          {{ p.name }}
        </option>
      </select>
      <template v-if="chosen && planKind(chosen.slug) === 'weapon'">
        <label class="sr-only" for="art-weapon">Weapon to enchant</label>
        <select
          id="art-weapon"
          v-model.number="weapon"
          class="input input--sm"
          :disabled="!canEdit"
        >
          <option v-for="(w, i) in sheet.weapons" :key="i" :value="i">{{ w.name }}</option>
        </select>
      </template>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit || !chosen || !cap"
        :title="chosen?.summary"
        @click="make"
      >
        Make it
      </button>
    </div>
    <template v-if="storing">
      <strong>Spell-Storing Item</strong>
      <div v-if="sheet.storedSpell" class="row" style="gap: 6px; flex-wrap: wrap">
        <span class="small"
          >{{ sheet.storedSpell.name }} · {{ sheet.storedSpell.uses }} uses left</span
        >
        <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="castStored">
          Use it
        </button>
      </div>
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <label class="sr-only" for="art-store">Spell to store</label>
        <select id="art-store" v-model="toStore" class="input input--sm" :disabled="!canEdit">
          <option value="">A level 1–3 spell…</option>
          <option v-for="d in storable" :key="d.slug" :value="d.slug">
            {{ d.name }} ({{ d.level }})
          </option>
        </select>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit || !toStore"
          @click="store"
        >
          Store
        </button>
      </div>
    </template>
    <p v-if="resultIn('art:')" class="roll-status" role="status">{{ resultIn('art:') }}</p>
  </div>
</template>

<style scoped lang="scss">
.art {
  padding: 12px;
}
</style>
