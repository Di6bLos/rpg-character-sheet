<script setup lang="ts">
// "Find a creature" in the GM's Add to initiative dialog: search this campaign's index
// or the shared library (Official / Homebrew, when the site allows it) by name, pick
// one, and add a group of copies with its stat block, portrait and a party journal
// entry, as the NPCs page does (a library entry is first copied into the campaign).
import type { CampaignNpc, PoolNpc } from '~/types'
import { plural } from '~/utils/format'
import { statBlockSubtitle } from '~/utils/npcStatBlock'

const emit = defineEmits<{ added: [] }>()

const snackbar = useSnackbarStore()
const site = useSiteStore()
const npcs = useNpcStore()
const { campaign, campaignId } = useCampaignBoard()
const uid = useId()

type Where = 'campaign' | 'pool'
const poolOn = computed(() => site.settings.npc_pool_campaign)
const where = ref<Where>('campaign')
watch(poolOn, (on) => {
  if (!on) where.value = 'campaign'
})
const q = ref('')

// --- Campaign index (loaded once per campaign) ----------------------------------------
onMounted(async () => {
  if (npcs.campaignId === campaignId.value) return
  try {
    await npcs.fetchCampaign(campaignId.value)
  } catch (err) {
    snackbar.error(err, 'Could not load your NPCs')
  }
})

const needle = computed(() => q.value.trim().toLowerCase())
const campaignList = computed(() =>
  npcs.campaignNpcs.filter(
    (n) =>
      !needle.value ||
      n.name.toLowerCase().includes(needle.value) ||
      (n.stat_block.type ?? '').toLowerCase().includes(needle.value),
  ),
)

// --- Library (searched as the GM types) -----------------------------------------------
const pool = ref<PoolNpc[]>([])
const poolLoading = ref(false)
let poolTimer: ReturnType<typeof setTimeout> | undefined
let poolRequest = 0

async function loadPool() {
  if (where.value !== 'pool' || !campaign.value) return
  const n = ++poolRequest
  poolLoading.value = true
  try {
    const found = await npcs.searchPool({ system: campaign.value.system, q: q.value }, 30)
    if (n === poolRequest) pool.value = found
  } catch (err) {
    snackbar.error(err, 'Could not search the library')
  } finally {
    if (n === poolRequest) poolLoading.value = false
  }
}
watch(where, () => void loadPool())
watch(q, () => {
  if (where.value !== 'pool') return
  clearTimeout(poolTimer)
  poolTimer = setTimeout(() => void loadPool(), 250)
})
onBeforeUnmount(() => clearTimeout(poolTimer))

// --- Results and the pick -------------------------------------------------------------
type Item = { from: 'campaign'; npc: CampaignNpc } | { from: 'pool'; npc: PoolNpc }
const results = computed<Item[]>(() =>
  where.value === 'campaign'
    ? campaignList.value.slice(0, 30).map((npc) => ({ from: 'campaign' as const, npc }))
    : pool.value.map((npc) => ({ from: 'pool' as const, npc })),
)
const pickedId = ref<string | null>(null)
const picked = computed(() => results.value.find((i) => i.npc.id === pickedId.value) ?? null)
watch(where, () => (pickedId.value = null))

function sub(item: Item): string {
  return [statBlockSubtitle(item.npc.stat_block), item.npc.level ? `Level ${item.npc.level}` : '']
    .filter(Boolean)
    .join(' · ')
}

const count = ref(1)
const sharedRoll = ref(false)
const busy = ref(false)

async function campaignCopy(item: Item): Promise<CampaignNpc> {
  if (item.from === 'campaign') return item.npc
  const pulled = npcs.campaignNpcs.find((n) => n.pool_npc_id === item.npc.id)
  return pulled ?? (await npcs.pull(campaignId.value, item.npc))
}

async function add() {
  const item = picked.value
  if (!item) return
  busy.value = true
  try {
    const npc = await campaignCopy(item)
    const n = Math.min(20, Math.max(1, Math.floor(count.value || 1)))
    const { added, journaled, journalError } = await npcs.addToInitiative(npc, n, sharedRoll.value)
    const text = `${plural(added, npc.name)} added to initiative${journaled ? ' · new party journal entry' : ''}`
    if (journalError)
      snackbar.error(journalError, `${text} · the party journal entry could not be added`)
    else snackbar.show(text)
    count.value = 1
    sharedRoll.value = false
    pickedId.value = null
    emit('added')
  } catch (err) {
    snackbar.error(err, 'Could not add to initiative')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="afi" :aria-labelledby="`${uid}-h`">
    <div class="afi__head">
      <h3 :id="`${uid}-h`">Find a creature</h3>
      <div v-if="poolOn" class="afi__where" role="radiogroup" aria-label="Search in">
        <button
          type="button"
          role="radio"
          :aria-checked="where === 'campaign'"
          @click="where = 'campaign'"
        >
          This campaign
        </button>
        <button type="button" role="radio" :aria-checked="where === 'pool'" @click="where = 'pool'">
          Library
        </button>
      </div>
    </div>
    <label class="sr-only" :for="`${uid}-q`">Search by name or type</label>
    <input
      :id="`${uid}-q`"
      v-model="q"
      class="input afi__q"
      type="search"
      autocomplete="off"
      :placeholder="where === 'pool' ? 'Search the library…' : 'Search this campaign’s creatures…'"
    />
    <p v-if="where === 'pool' && poolLoading && !results.length" class="afi__note" role="status">
      Searching…
    </p>
    <p v-else-if="!results.length" class="afi__note">
      {{
        where === 'pool'
          ? 'Nothing in the library matches.'
          : needle
            ? 'No creature in this campaign matches.'
            : 'This campaign has no creatures yet. Search the library, or add a custom one below.'
      }}
    </p>
    <ul v-else class="afi__list" role="listbox" :aria-label="`Results (${results.length})`">
      <li v-for="item in results" :key="item.npc.id">
        <button
          type="button"
          role="option"
          class="afi__item"
          :aria-selected="pickedId === item.npc.id"
          @click="pickedId = pickedId === item.npc.id ? null : item.npc.id"
        >
          <b>{{ item.npc.name }}</b>
          <span>{{ sub(item) }}</span>
        </button>
      </li>
    </ul>
    <div v-if="picked" class="afi__add">
      <label :for="`${uid}-n`" class="afi__lbl">How many</label>
      <input
        :id="`${uid}-n`"
        v-model.number="count"
        class="input afi__n"
        type="number"
        min="1"
        max="20"
      />
      <label class="afi__shared">
        <input v-model="sharedRoll" type="checkbox" />
        One initiative roll
      </label>
      <button type="button" class="btn btn--sm afi__go" :disabled="busy" @click="add">
        Add {{ Math.min(20, Math.max(1, count || 1)) > 1 ? `${Math.min(20, count)} ` : ''
        }}{{ picked.npc.name }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.afi {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.afi__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 15px;
  }
}

.afi__where {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--inset);

  button {
    min-height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--page-muted);
    cursor: pointer;

    &[aria-checked='true'] {
      background: color-mix(in srgb, var(--accent) 24%, transparent);
      color: var(--page-text);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
  }
}

.afi__note {
  margin: 0;
  font-size: 13px;
  color: var(--page-muted);
}

.afi__list {
  list-style: none;
  margin: 0;
  padding: 2px;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}

.afi__item {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-control), 10px);
  background: var(--field);
  color: var(--page-text);
  text-align: left;
  cursor: pointer;

  b {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  span {
    flex: none;
    max-width: 60%;
    font-size: 12px;
    color: var(--page-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    border-color: var(--line-strong);
  }

  &[aria-selected='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, var(--field));
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
}

.afi__add {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.afi__lbl,
.afi__shared {
  font-size: 13px;
  color: var(--page-soft);
}

.afi__shared {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.afi__n {
  width: 72px;
  min-height: 36px;
  padding: 4px 8px;
}

.afi__go {
  margin-left: auto;
}
</style>
