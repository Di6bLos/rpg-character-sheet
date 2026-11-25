<script setup lang="ts">
// Adds a PF2e item from the data to the inventory: a search over gear, consumables, magic items,
// staves, wands, weapons, armor and shields (fetched when the dialog opens), items above the
// hero's level and uncommon or rare ones behind switches (GM Core p. 222: rarity; Player Core
// p. 25: buying at your level), how many, the spell a scroll or wand holds (a spell of that rank
// that isn't a cantrip or focus spell, GM Core pp. 262, 282), and whether to pay from the coins.
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eSpellDef } from '~/data/pf2e/types'
import type { InventoryItem } from '~/types/sheets'
import { type Pf2eOwnable, bulkLabel, itemFromDef } from '~/utils/pf2eInventory'
import { priceLabel } from '~/utils/pf2eItemUse'
import { loreHtml } from '~/utils/loreText'

const props = defineProps<{ level: number; coinsCp: number }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ add: [item: InventoryItem, cost: number] }>()

const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'gear', label: 'Gear' },
  { key: 'consumables', label: 'Consumables' },
  { key: 'magicItems', label: 'Worn & held' },
  { key: 'staves', label: 'Staves' },
  { key: 'wands', label: 'Wands' },
  { key: 'weapons', label: 'Weapons' },
  { key: 'armor', label: 'Armor' },
  { key: 'shields', label: 'Shields' },
] as const
type Group = (typeof GROUPS)[number]['key']

interface Entry {
  key: string
  group: Exclude<Group, 'all'>
  own: Pf2eOwnable
  kind: string
}

const entries = shallowRef<Entry[]>([])
const spells = shallowRef<Pf2eSpellDef[]>([])
const failed = ref('')
const loading = ref(false)

async function load() {
  if (entries.value.length || loading.value) return
  loading.value = true
  failed.value = ''
  try {
    const sets = ['gear', 'consumables', 'magicItems', 'staves', 'wands'] as const
    const [items, weapons, armor, shields, spellList] = await Promise.all([
      Promise.all(sets.map((s) => loadPf2e(s))),
      loadPf2e('weapons'),
      loadPf2e('armor'),
      loadPf2e('shields'),
      loadPf2e('spells'),
    ])
    spells.value = spellList
    entries.value = [
      ...sets.flatMap((group, i) =>
        (items[i] ?? []).map((def) => ({
          key: def.id,
          group,
          own: { set: 'item' as const, def },
          kind: def.kind,
        })),
      ),
      ...weapons
        .filter((w) => w.category !== 'Unarmed')
        .map((def) => ({
          key: def.id,
          group: 'weapons' as const,
          own: { set: 'weapons' as const, def },
          kind: def.category === 'Ammunition' ? 'ammunition' : 'weapon',
        })),
      ...armor.map((def) => ({
        key: def.id,
        group: 'armor' as const,
        own: { set: 'armor' as const, def },
        kind: 'armor',
      })),
      ...shields.map((def) => ({
        key: def.id,
        group: 'shields' as const,
        own: { set: 'shields' as const, def },
        kind: 'shield',
      })),
    ].sort(
      (a, b) => a.own.def.level - b.own.def.level || a.own.def.name.localeCompare(b.own.def.name),
    )
  } catch {
    failed.value = 'The item data couldn’t load. Check the connection and open this again.'
  } finally {
    loading.value = false
  }
}
watch(open, (o) => o && load(), { immediate: true })

const query = ref('')
const group = ref<Group>('all')
const higher = ref(false)
const rare = ref(false)
const PAGE = 50
const shown = ref(PAGE)
watch([query, group, higher, rare], () => (shown.value = PAGE))

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return entries.value.filter((e) => {
    const d = e.own.def
    if (group.value !== 'all' && e.group !== group.value) return false
    if (!higher.value && d.level > props.level) return false
    if (!rare.value && d.rarity !== 'common') return false
    return !q || d.name.toLowerCase().includes(q) || d.traits.some((t) => t.toLowerCase() === q)
  })
})

const picked = ref<Entry | null>(null)
const count = ref(1)
const payFor = ref(true)
const spellId = ref('')
watch(picked, () => {
  count.value = 1
  spellId.value = ''
})

const pickedItem = computed(() => (picked.value?.own.set === 'item' ? picked.value.own.def : null))
/** A scroll or wand holds one spell of its rank (no cantrips or focus spells). */
const spellRank = computed(() => pickedItem.value?.spellRank)
const spellChoices = computed(() =>
  spellRank.value
    ? spells.value.filter(
        (s) =>
          s.kind === 'spell' &&
          s.rank <= spellRank.value! &&
          s.traditions.length > 0 &&
          (rare.value || s.rarity === 'common'),
      )
    : [],
)
const cost = computed(() => (picked.value?.own.def.price ?? 0) * count.value)
const short = computed(() => payFor.value && cost.value > props.coinsCp)
const needsSpell = computed(() => !!spellRank.value && !spellId.value)

function add() {
  const e = picked.value
  if (!e || needsSpell.value || short.value) return
  const spell = spells.value.find((s) => s.id === spellId.value)
  emit('add', itemFromDef(e.own, count.value, spell), payFor.value ? cost.value : 0)
  picked.value = null
  open.value = false
}

const meta = (e: Entry) => {
  const d = e.own.def
  return [`Item ${d.level}`, priceLabel(d.price), `Bulk ${bulkLabel(d.bulk)}`, e.kind]
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <UiDialog v-model="open" title="Add an item" width="720px" sheet>
    <div v-if="!picked" class="stack" style="gap: 12px">
      <div class="field">
        <label for="pf-item-q">Search</label>
        <input
          id="pf-item-q"
          v-model="query"
          class="input"
          type="search"
          placeholder="Healing potion, rope, staff of fire…"
          autocomplete="off"
        />
      </div>
      <div class="chips" role="group" aria-label="Kind of item">
        <button
          v-for="g in GROUPS"
          :key="g.key"
          type="button"
          class="chip"
          :aria-pressed="group === g.key"
          @click="group = g.key"
        >
          {{ g.label }}
        </button>
      </div>
      <UiSwitch v-model="higher" :label="`Show items above level ${level}`" small />
      <UiSwitch v-model="rare" label="Show uncommon and rare (ask your GM)" small />
      <p v-if="loading" class="muted small">Loading items…</p>
      <p v-else-if="failed" class="small" role="alert">{{ failed }}</p>
      <p v-else class="small muted" aria-live="polite">{{ matches.length }} items</p>
      <ul class="picks">
        <li v-for="e in matches.slice(0, shown)" :key="e.key">
          <button type="button" class="pick" @click="picked = e">
            <strong>{{ e.own.def.name }}</strong>
            <span class="small muted">{{ meta(e) }}</span>
          </button>
        </li>
      </ul>
      <button
        v-if="matches.length > shown"
        type="button"
        class="btn btn--ghost btn--sm"
        @click="shown += PAGE"
      >
        Show {{ Math.min(PAGE, matches.length - shown) }} more
      </button>
    </div>

    <div v-else class="stack" style="gap: 12px">
      <button type="button" class="btn btn--ghost btn--sm back" @click="picked = null">
        ← Back to the list
      </button>
      <div class="stack" style="gap: 4px">
        <h3>{{ picked.own.def.name }}</h3>
        <span class="small muted">
          {{ meta(picked) }} · {{ picked.own.def.source.book }} p. {{ picked.own.def.source.page }}
        </span>
        <div class="row" style="gap: 6px">
          <span v-for="t in picked.own.def.traits" :key="t" class="trait">{{ t }}</span>
        </div>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -- escaped by loreHtml -->
      <div v-if="picked.own.def.text" class="rules" v-html="loreHtml(picked.own.def.text)" />
      <div class="row" style="gap: 12px; align-items: flex-end">
        <div class="field" style="width: 110px">
          <label for="pf-item-n">How many</label>
          <input
            id="pf-item-n"
            v-model.number="count"
            class="input"
            type="number"
            inputmode="numeric"
            min="1"
            max="999"
          />
        </div>
        <div v-if="spellRank" class="field grow">
          <label for="pf-item-spell">Spell (rank {{ spellRank }} or lower)</label>
          <select id="pf-item-spell" v-model="spellId" class="input">
            <option value="" disabled>Choose the spell it holds</option>
            <option v-for="s in spellChoices" :key="s.id" :value="s.id">
              {{ s.name }} ({{ s.rank }}) · {{ s.traditions.join(', ') }}
            </option>
          </select>
        </div>
      </div>
      <label class="row" style="gap: 8px">
        <input v-model="payFor" type="checkbox" />
        Pay {{ priceLabel(cost) }} from your coins
      </label>
      <p v-if="short" class="small" role="alert">Not enough coins for that.</p>
    </div>

    <template v-if="picked" #actions>
      <button type="button" class="btn btn--ghost" @click="open = false">Cancel</button>
      <button
        type="button"
        class="btn"
        :aria-disabled="needsSpell || short"
        :disabled="needsSpell || short || count < 1"
        @click="add"
      >
        Add {{ count > 1 ? `${count} ` : '' }}to inventory
      </button>
    </template>
  </UiDialog>
</template>

<style scoped lang="scss">
.picks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
  gap: 8px;
}

.pick {
  width: 100%;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border-radius: min(var(--radius-control), 8px);
  border: 1px solid var(--line);
  background: var(--field);
  color: var(--page-text);
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: var(--secondary);
  }
}

.back {
  align-self: flex-start;
}

.rules {
  max-height: 260px;
  overflow: auto;
  font-size: 14px;
  line-height: 1.5;
  color: var(--page-soft);
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
