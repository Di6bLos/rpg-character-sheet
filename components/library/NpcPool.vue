<script setup lang="ts">
// Library → NPCs & monsters: the shared pool every GM's NPCs land in, plus
// official ones from the rulebooks. GMs can pull any of them into a campaign.
import type { PoolNpc } from '~/types'
import { SYSTEMS, systemLabel } from '~/utils/systems'

const auth = useAuthStore()
const campaigns = useCampaignStore()
const npcs = useNpcStore()
const snackbar = useSnackbarStore()

const { system, kind, source, q, list, loading, loadingMore, hasMore, loadMore, forget } =
  useNpcPoolSearch(60)
onMounted(() => void campaigns.fetchMine())

// The filter bar pins under the Library sub-nav while the cards slide up under it.
const filtersEl = ref<HTMLElement | null>(null)
const filtersStuck = useStuck(filtersEl)
// A new search starts at the top of the list.
watch([system, kind, source, q], () => nextTick(() => revealAfterStickyBar(filtersEl.value)))

// --- Detail -------------------------------------------------------------------------
const open = ref<PoolNpc | null>(null)
const detailOpen = computed({
  get: () => open.value !== null,
  set: (v) => {
    if (!v) open.value = null
  },
})

/** Campaigns this user runs in the NPC's system. */
const myTables = computed(() =>
  campaigns.campaigns.filter((c) => c.myRole === 'gm' && c.system === open.value?.system),
)
const target = ref('')
watch(open, () => (target.value = myTables.value[0]?.id ?? ''))
const adding = ref(false)

async function addToCampaign() {
  const npc = open.value
  const c = campaigns.byId(target.value)
  if (!npc || !c) return
  adding.value = true
  try {
    await npcs.pull(c.id, npc)
    snackbar.show(`${npc.name} added to ${c.name}`)
  } catch (err) {
    snackbar.error(err, 'Could not add it to the campaign')
  } finally {
    adding.value = false
  }
}

const canDelete = computed(
  () => !!open.value && (open.value.created_by === auth.userId || auth.isStaff),
)
async function remove() {
  const npc = open.value
  if (!npc) return
  try {
    await npcs.removePool(npc.id)
  } catch (err) {
    return snackbar.error(err, 'Could not remove it from the pool')
  }
  forget(npc.id)
  open.value = null
  snackbar.show(`${npc.name} removed from the pool. Campaigns that use it keep their copy.`)
}
</script>

<template>
  <div class="pool">
    <p class="muted pool__intro">
      Every NPC a GM saves is shared here for other GMs to use. <strong>Official</strong> entries
      are transcribed from the rulebooks; <strong>Homebrew</strong> ones were made by players like
      you.
    </p>

    <div ref="filtersEl" class="pool__filters sticky-bar" :class="{ 'is-stuck': filtersStuck }">
      <div class="chips" role="group" aria-label="Source">
        <button
          v-for="s in [null, 'official', 'homebrew'] as const"
          :key="String(s)"
          type="button"
          class="chip"
          :aria-pressed="source === s"
          @click="source = s"
        >
          {{ s === null ? 'All' : s === 'official' ? 'Official' : 'Homebrew' }}
        </button>
      </div>
      <div class="chips" role="group" aria-label="Kind">
        <button
          v-for="k in [null, 'monster', 'humanoid'] as const"
          :key="String(k)"
          type="button"
          class="chip"
          :aria-pressed="kind === k"
          @click="kind = k"
        >
          {{ k === null ? 'Everything' : k === 'monster' ? 'Monsters' : 'Humanoids' }}
        </button>
      </div>
      <label class="pool__sys">
        <span class="sr-only">Game system</span>
        <select v-model="system" class="input">
          <option :value="null">All systems</option>
          <option v-for="s in SYSTEMS" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
      </label>
      <label class="pool__q">
        <span class="sr-only">Search NPCs</span>
        <input v-model="q" type="search" class="input" placeholder="Search by name" />
      </label>
    </div>

    <div v-if="loading" class="spinner" role="status" aria-label="Loading NPCs" />
    <p v-else-if="!list.length" class="empty">
      Nothing here yet. NPCs appear as GMs save them in their consoles.
    </p>
    <ul v-else class="pool__grid">
      <li v-for="n in list" :key="n.id">
        <button type="button" class="panel pool__card" @click="open = n">
          <UiAvatar
            :name="n.name"
            :src="npcImageUrl(n.image_path)"
            :square="n.kind === 'monster'"
            :size="56"
          />
          <span class="pool__text">
            <strong>{{ n.name }}</strong>
            <small>{{
              [n.stat_block.type, n.level ? `Level ${n.level}` : ''].filter(Boolean).join(' · ')
            }}</small>
            <span class="pool__tags">
              <span class="badge" :class="`badge--${n.system}`">{{ systemLabel(n.system) }}</span>
              <span class="tag" :class="{ 'tag--official': n.source === 'official' }">{{
                n.source === 'official' ? 'Official' : 'Homebrew'
              }}</span>
              <span v-if="n.ai_generated" class="tag">AI</span>
            </span>
          </span>
        </button>
      </li>
    </ul>
    <div v-if="hasMore && !loading" class="pool__more">
      <button type="button" class="btn btn--ghost" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? 'Loading…' : 'Load more' }}
      </button>
    </div>

    <UiDialog v-model="detailOpen" :title="open?.name ?? ''" width="680px">
      <div v-if="open" class="stack">
        <NpcStatBlock
          :name="open.name"
          :system="open.system"
          :level="open.level"
          :block="open.stat_block"
          :image-path="open.image_path"
          :source="open.source"
          :ai-generated="open.ai_generated"
        />
        <p v-if="open.source_ref" class="small muted">Source: {{ open.source_ref }}</p>
        <form v-if="myTables.length" class="pool__add" @submit.prevent="addToCampaign">
          <label for="pool-target">Add to</label>
          <select id="pool-target" v-model="target" class="input">
            <option v-for="c in myTables" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <button type="submit" class="btn" :disabled="adding || !target">Add to campaign</button>
        </form>
        <p v-else class="small muted">
          You can add this to a {{ systemLabel(open.system) }} campaign you run, from here or from
          the GM console’s NPC index.
        </p>
      </div>
      <template #actions>
        <button v-if="canDelete" type="button" class="btn btn--quiet" @click="remove">
          Remove from pool
        </button>
        <button type="button" class="btn btn--ghost" @click="open = null">Close</button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.pool {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pool__intro {
  margin: 0;
  max-width: 760px;
}

.pool__filters {
  --sticky-top: var(--subnav-h, 0px);
  // Breathing room while pinned, without changing the resting layout.
  margin-block: -10px;
  padding-block: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 18px;
}

.pool__sys .input {
  width: auto;
}

.pool__q {
  flex: 1 1 220px;
}

.pool__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: 14px;
}

.pool__card {
  width: 100%;
  height: 100%;
  padding: 14px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  text-align: left;
  cursor: pointer;
}

.pool__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  strong {
    font-family: var(--font-heading);
    font-size: 18px;
    line-height: 1.2;
  }

  small {
    font-size: 13px;
    color: var(--page-muted);
  }
}

.pool__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.tag {
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

.pool__more {
  display: flex;
  justify-content: center;
}

.pool__add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;

  .input {
    width: auto;
    flex: 1 1 200px;
  }
}
</style>
