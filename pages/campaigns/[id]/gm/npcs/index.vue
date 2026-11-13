<script setup lang="ts">
// GM console → NPCs → Index: this campaign's creatures and people, plus the
// shared pool (Official / Homebrew). Add several to initiative at once, or
// record a meeting in the party journal.
import type { CampaignNpc, CreatureType, NpcKind, NpcSourceFilter, PoolNpc } from '~/types'
import { CREATURE_TYPES, SOURCE_FILTERS } from '~/utils/creatureTypes'
import { plural } from '~/utils/format'

const route = useRoute()
const router = useRouter()
const snackbar = useSnackbarStore()
const site = useSiteStore()
const npcs = useNpcStore()
const { campaign, campaignId } = useCampaignBoard()

type Where = 'campaign' | 'pool'
const kind = ref<NpcKind>(route.query.kind === 'humanoid' ? 'humanoid' : 'monster')
const where = ref<Where>(route.query.where === 'pool' ? 'pool' : 'campaign')
const source = ref<NpcSourceFilter | 'mine' | null>(null)
const creatureType = ref<CreatureType | null>(null)
/** Source options; "Mine" only means something in the shared library. */
const sourceOptions = computed(() =>
  where.value === 'pool'
    ? [...SOURCE_FILTERS, { value: 'mine' as const, label: 'Made by me' }]
    : SOURCE_FILTERS,
)
const q = ref('')
const selectedId = ref<string | null>(typeof route.query.id === 'string' ? route.query.id : null)

watch([kind, where, selectedId], () => {
  void router.replace({
    query: {
      kind: kind.value === 'humanoid' ? 'humanoid' : undefined,
      where: where.value === 'pool' ? 'pool' : undefined,
      id: selectedId.value ?? undefined,
    },
  })
})

const poolOn = computed(() => site.settings.npc_pool_campaign)
watch(poolOn, (on) => {
  if (!on && where.value === 'pool') where.value = 'campaign'
})

// --- Campaign index ---------------------------------------------------------------
onMounted(async () => {
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
      n.kind === kind.value &&
      (!creatureType.value || n.stat_block.creatureType === creatureType.value) &&
      (!source.value || (source.value === 'ai' ? n.ai_generated : n.source === source.value)) &&
      (!needle.value ||
        n.name.toLowerCase().includes(needle.value) ||
        (n.stat_block.type ?? '').toLowerCase().includes(needle.value)),
  ),
)
const kindCounts = computed(() => ({
  monster: npcs.campaignNpcs.filter((n) => n.kind === 'monster').length,
  humanoid: npcs.campaignNpcs.filter((n) => n.kind === 'humanoid').length,
}))

// --- Pool -----------------------------------------------------------------------
const pool = ref<PoolNpc[]>([])
const poolLoading = ref(false)
let poolTimer: ReturnType<typeof setTimeout> | undefined

async function loadPool() {
  if (where.value !== 'pool' || !campaign.value) return
  poolLoading.value = true
  try {
    pool.value = await npcs.searchPool({
      system: campaign.value.system,
      kind: kind.value,
      creatureType: creatureType.value,
      source: source.value === 'mine' ? null : source.value,
      mine: source.value === 'mine',
      q: q.value,
    })
  } catch (err) {
    snackbar.error(err, 'Could not search the library')
  } finally {
    poolLoading.value = false
  }
}
watch([where, kind, source, creatureType], () => void loadPool(), { immediate: true })
watch(q, () => {
  clearTimeout(poolTimer)
  poolTimer = setTimeout(() => void loadPool(), 250)
})

// --- Selection ------------------------------------------------------------------
type Item = { from: 'campaign'; npc: CampaignNpc } | { from: 'pool'; npc: PoolNpc }
const list = computed<Item[]>(() =>
  where.value === 'campaign'
    ? campaignList.value.map((npc) => ({ from: 'campaign' as const, npc }))
    : pool.value.map((npc) => ({ from: 'pool' as const, npc })),
)
const selected = computed<Item | null>(
  () => list.value.find((i) => i.npc.id === selectedId.value) ?? list.value[0] ?? null,
)
/** The campaign copy of the selected pool NPC, if the GM already pulled it. */
const pulled = computed(() =>
  selected.value?.from === 'pool'
    ? (npcs.campaignNpcs.find((n) => n.pool_npc_id === selected.value!.npc.id) ?? null)
    : null,
)

// --- Actions --------------------------------------------------------------------
const count = ref(1)
const sharedRoll = ref(false)
const busy = ref(false)
const status = ref('')

async function campaignCopy(): Promise<CampaignNpc | null> {
  const item = selected.value
  if (!item) return null
  if (item.from === 'campaign') return item.npc
  return pulled.value ?? (await npcs.pull(campaignId.value, item.npc))
}

async function addToCampaign() {
  busy.value = true
  try {
    const npc = await campaignCopy()
    if (npc) status.value = `${npc.name} is in this campaign’s index`
  } catch (err) {
    snackbar.error(err, 'Could not add it to the campaign')
  } finally {
    busy.value = false
  }
}

async function addToInitiative() {
  busy.value = true
  try {
    const npc = await campaignCopy()
    if (!npc) return
    const n = Math.min(20, Math.max(1, Math.floor(count.value || 1)))
    const { added, journaled, journalError } = await npcs.addToInitiative(npc, n, sharedRoll.value)
    status.value = `${plural(added, npc.name)} added to initiative${journaled ? ' · new party journal entry' : ''}`
    count.value = 1
    if (journalError) {
      status.value += ' · the party journal entry could not be added'
      snackbar.error(journalError, status.value)
    } else snackbar.show(status.value)
  } catch (err) {
    snackbar.error(err, 'Could not add to initiative')
  } finally {
    busy.value = false
  }
}

async function addToJournal() {
  busy.value = true
  try {
    const npc = await campaignCopy()
    if (!npc) return
    const created = await npcs.addToJournal(npc)
    status.value = created
      ? `${npc.name} added to the party journal`
      : `${npc.name} is already in the party journal`
    snackbar.show(status.value)
  } catch (err) {
    snackbar.error(err, 'Could not add to the journal')
  } finally {
    busy.value = false
  }
}

function editLink(mode: 'edit' | 'dup') {
  const item = selected.value
  if (!item) return ''
  const param = item.from === 'campaign' ? mode : 'dup'
  const key = item.from === 'campaign' ? item.npc.id : `pool:${item.npc.id}`
  return `/campaigns/${campaignId.value}/gm/npcs/new?${param}=${encodeURIComponent(key)}`
}

const removeOpen = ref(false)
async function confirmRemove() {
  const item = selected.value
  if (item?.from !== 'campaign') return
  try {
    await npcs.remove(item.npc)
    removeOpen.value = false
    selectedId.value = null
    snackbar.show(`${item.npc.name} removed from this campaign`)
  } catch (err) {
    snackbar.error(err, 'Could not remove it')
  }
}

// --- Scrolling list -------------------------------------------------------------------
// The entries scroll inside the list panel under its controls; the page stays put.
const rootEl = ref<HTMLElement | null>(null)
const asideEl = ref<HTMLElement | null>(null)
const itemsEl = ref<HTMLElement | null>(null)
const { height: itemsHeight } = useFillViewport(itemsEl, {
  panel: asideEl,
  root: rootEl,
  observe: [asideEl],
})
// A new search or filter starts at the top of the list.
watch([kind, where, source, creatureType, q], () => itemsEl.value?.scrollTo({ top: 0 }))

function pickKind(k: NpcKind) {
  kind.value = k
  selectedId.value = null
}
function pickWhere(w: Where) {
  where.value = w
  if (w === 'campaign' && source.value === 'mine') source.value = null
  selectedId.value = null
}
// A new filter starts with its first match selected.
watch([source, creatureType], () => (selectedId.value = null))

watch(selectedId, () => {
  status.value = ''
  count.value = 1
})
</script>

<template>
  <div ref="rootEl" class="npcs">
    <NpcTabs current="index" />

    <div class="npcs__kinds" role="tablist" aria-label="Creature kind">
      <button
        v-for="k in ['monster', 'humanoid'] as const"
        :key="k"
        type="button"
        role="tab"
        :aria-selected="kind === k"
        @click="pickKind(k)"
      >
        {{ k === 'monster' ? 'Monsters' : 'Humanoids' }}
        <span class="npcs__n">{{ kindCounts[k] }}</span>
      </button>
    </div>

    <div class="npcs__cols">
      <aside ref="asideEl" class="panel npcs__list" aria-labelledby="npc-h">
        <div class="npcs__list-head">
          <h2 id="npc-h">{{ kind === 'monster' ? 'Monsters' : 'Humanoids' }}</h2>
          <span class="small muted"
            >{{ list.length }} {{ list.length === 1 ? 'entry' : 'entries' }}</span
          >
        </div>
        <NuxtLink :to="`/campaigns/${campaignId}/gm/npcs/new?kind=${kind}`" class="btn btn--block">
          {{ kind === 'monster' ? 'New monster' : 'New humanoid' }}
        </NuxtLink>
        <div v-if="poolOn" role="radiogroup" aria-label="Where to look" class="seg">
          <button
            type="button"
            role="radio"
            :aria-checked="where === 'campaign'"
            @click="pickWhere('campaign')"
          >
            This campaign
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="where === 'pool'"
            @click="pickWhere('pool')"
          >
            Library
          </button>
        </div>
        <div class="npcs__filters">
          <label>
            <span class="sr-only">Source</span>
            <select v-model="source" class="input">
              <option v-for="o in sourceOptions" :key="String(o.value)" :value="o.value">
                {{ o.label }}
              </option>
            </select>
          </label>
          <label>
            <span class="sr-only">Creature type</span>
            <select v-model="creatureType" class="input">
              <option :value="null">All creature types</option>
              <option v-for="t in CREATURE_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
        </div>
        <label for="npc-q" class="sr-only">Search creatures</label>
        <input
          id="npc-q"
          v-model="q"
          type="search"
          class="input"
          placeholder="Search by name or type"
        />
        <div
          v-if="where === 'pool' && poolLoading"
          class="spinner"
          role="status"
          aria-label="Searching the library"
        />
        <ul
          v-else
          ref="itemsEl"
          class="npcs__items"
          :style="itemsHeight ? { '--list-h': `${itemsHeight}px` } : undefined"
        >
          <li v-for="it in list" :key="it.npc.id">
            <button
              type="button"
              :aria-current="selected?.npc.id === it.npc.id ? 'true' : undefined"
              @click="selectedId = it.npc.id"
            >
              <UiAvatar
                :name="it.npc.name"
                :src="npcImageUrl(it.npc.image_path)"
                :square="it.npc.kind === 'monster'"
                :size="40"
              />
              <span class="npcs__item-text">
                <strong>{{ it.npc.name }}</strong>
                <small>{{
                  [
                    it.npc.stat_block.type || it.npc.stat_block.creatureType,
                    it.npc.level ? `Level ${it.npc.level}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }}</small>
              </span>
              <span v-if="it.npc.source === 'official'" class="tag tag--official">Official</span>
              <span v-else-if="it.npc.ai_generated" class="tag">AI</span>
            </button>
          </li>
        </ul>
        <p v-if="!list.length && !(where === 'pool' && poolLoading)" class="small muted">
          {{
            where === 'pool'
              ? 'Nothing in the library matches. Every NPC a GM saves lands here.'
              : q
                ? 'Nothing matches.'
                : `No ${kind === 'monster' ? 'monsters' : 'humanoids'} yet. Build one, or pull one from the library.`
          }}
        </p>
      </aside>

      <section class="npcs__detail" aria-label="Stat block">
        <template v-if="selected">
          <div class="npcs__actions panel">
            <div class="npcs__init">
              <label for="npc-count" class="npcs__count">
                <span>How many</span>
                <span class="stepper">
                  <button
                    type="button"
                    aria-label="One fewer"
                    :disabled="count <= 1"
                    @click="count = Math.max(1, count - 1)"
                  >
                    −
                  </button>
                  <input
                    id="npc-count"
                    v-model.number="count"
                    type="number"
                    min="1"
                    max="20"
                    inputmode="numeric"
                  />
                  <button
                    type="button"
                    aria-label="One more"
                    :disabled="count >= 20"
                    @click="count = Math.min(20, count + 1)"
                  >
                    +
                  </button>
                </span>
              </label>
              <label v-if="count > 1" class="npcs__shared">
                <input v-model="sharedRoll" type="checkbox" /> One roll for the group
              </label>
              <button type="button" class="btn" :disabled="busy" @click="addToInitiative">
                {{ count > 1 ? `Add ${count} to initiative` : 'Add to initiative' }}
              </button>
            </div>
            <div class="npcs__more">
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                :disabled="busy"
                @click="addToJournal"
              >
                Add to party journal
              </button>
              <button
                v-if="selected.from === 'pool' && !pulled"
                type="button"
                class="btn btn--ghost btn--sm"
                :disabled="busy"
                @click="addToCampaign"
              >
                Add to this campaign
              </button>
              <NuxtLink
                v-if="selected.from === 'campaign'"
                :to="editLink('edit')"
                class="btn btn--ghost btn--sm"
                >Edit</NuxtLink
              >
              <NuxtLink :to="editLink('dup')" class="btn btn--ghost btn--sm">Duplicate</NuxtLink>
              <button
                v-if="selected.from === 'campaign'"
                type="button"
                class="btn btn--quiet btn--sm"
                @click="removeOpen = true"
              >
                Remove
              </button>
            </div>
            <p class="small muted npcs__hint">
              Initiative gets the portrait and a letter per copy (Goblin A, B, C…). The party
              journal gets one entry with only the name and image for players to fill in.
            </p>
            <span role="status" class="small npcs__status">{{ status }}</span>
          </div>
          <NpcStatBlock
            :name="selected.npc.name"
            :system="selected.npc.system"
            :level="selected.npc.level"
            :block="selected.npc.stat_block"
            :image-path="selected.npc.image_path"
            :source="selected.npc.source"
            :ai-generated="selected.npc.ai_generated"
            :gm-notes="
              selected.from === 'campaign' ? selected.npc.gm_notes : (pulled?.gm_notes ?? '')
            "
          />
          <p v-if="selected.from === 'pool' && selected.npc.source_ref" class="small muted">
            Source: {{ selected.npc.source_ref }}
          </p>
        </template>
        <div v-else class="npcs__empty">Pick a creature, or build a new one.</div>
      </section>
    </div>

    <UiDialog
      v-model="removeOpen"
      :title="`Remove ${selected?.npc.name ?? ''}?`"
      alert
      width="460px"
    >
      <p>
        It leaves this campaign’s index. Copies in initiative and the party journal stay; the
        library keeps its entry.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="removeOpen = false">Keep it</button>
        <button type="button" class="btn btn--danger" @click="confirmRemove">Remove</button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.npcs {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.npcs__kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-bottom: 1px solid var(--line);

  button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 16px;
    border: 0;
    background: transparent;
    color: var(--page-muted);
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 700;

    &[aria-selected='true'] {
      color: var(--page-text);
      box-shadow: inset 0 -3px 0 var(--accent);
    }
  }
}

.npcs__n {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--inset);
  font-family: var(--font-body);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.npcs__cols {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}

.npcs__list {
  flex: 1 1 300px;
  min-width: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.npcs__list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;

  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 22px;
  }
}

.npcs__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  label {
    flex: 1 1 130px;
    min-width: 0;
  }
}

.seg {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);
  background: var(--field);

  button {
    flex: 1;
    min-height: 38px;
    border: 0;
    border-radius: min(var(--radius-control), 7px);
    background: transparent;
    color: var(--page-soft);
    font-size: 14px;
    font-weight: 600;

    &[aria-checked='true'] {
      background: var(--accent);
      color: var(--on-accent);
    }
  }
}

.npcs__items {
  list-style: none;
  // Scrolls under the controls above it; the negative margin keeps focus rings unclipped.
  max-height: var(--list-h, 65vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: -3px;
  padding: 3px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: var(--radius-control);
    border: 1px solid transparent;
    background: transparent;
    color: var(--page-text);
    text-align: left;

    &[aria-current='true'] {
      background: var(--inset);
      border-color: var(--accent);
    }
  }
}

.npcs__item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;

  strong {
    font-size: 15px;
    line-height: 1.25;
  }

  small {
    font-size: 12px;
    color: var(--page-muted);
  }
}

.tag {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);
  font-size: 11px;
  font-weight: 700;

  &--official {
    border-color: var(--accent-text);
    color: var(--accent-text);
  }
}

.npcs__detail {
  flex: 999 1 520px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.npcs__actions {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.npcs__init {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 14px;
}

.npcs__count {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.stepper {
  display: inline-flex;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-control);
  overflow: hidden;
  background: var(--field);

  button {
    width: 40px;
    min-height: 42px;
    border: 0;
    background: transparent;
    color: var(--page-text);
    font-size: 18px;
    font-weight: 700;

    &:disabled {
      opacity: 0.4;
    }
  }

  input {
    width: 48px;
    border: 0;
    border-left: 1px solid var(--line);
    border-right: 1px solid var(--line);
    background: transparent;
    color: var(--page-text);
    text-align: center;
    font-size: 16px;
    font-weight: 700;
    -moz-appearance: textfield;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      appearance: none;
    }
  }
}

.npcs__shared {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  font-size: 14px;
}

.npcs__more {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.npcs__hint {
  margin: 0;
}

.npcs__status:empty {
  display: none;
}

.npcs__empty {
  padding: 40px 24px;
  border-radius: var(--radius-panel);
  border: 1.5px dashed var(--line-strong);
  text-align: center;
  color: var(--page-muted);
}

// Phones: the list sits above the stat block, so let the page do the scrolling.
@media (max-width: 640px) {
  .npcs__items {
    max-height: none;
    overflow-y: visible;
  }
}
</style>
