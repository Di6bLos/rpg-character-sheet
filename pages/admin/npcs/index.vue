<script setup lang="ts">
// Admin → NPCs: the shared pool. Staff browse, edit and remove any entry and
// build new ones (Official or Homebrew) with the generator.
import type { PoolNpc } from '~/types'
import { shortDate } from '~/utils/format'
import { SYSTEMS, systemLabel } from '~/utils/systems'

definePageMeta({ layout: 'admin', middleware: 'staff' })
useHead({ title: 'NPCs · Lantern admin' })

const npcs = useNpcStore()
const site = useSiteStore()
const snackbar = useSnackbarStore()

const { system, kind, source, q, list, loading, loadingMore, hasMore, loadMore, forget } =
  useNpcPoolSearch(100)
onMounted(() => void site.fetch().catch(() => undefined))

const poolNote = computed(() => {
  const s = site.settings
  if (!s.npc_pool_campaign && !s.npc_pool_library)
    return 'The pool is hidden from players: both the GM console and the Library switches are off.'
  if (!s.npc_pool_library) return 'The Library tab is off: only GMs see these, from their console.'
  if (!s.npc_pool_campaign)
    return 'The GM console pool is off: players see these in the Library only.'
  return ''
})

// --- Detail and removal -------------------------------------------------------------
const open = ref<PoolNpc | null>(null)
const detailOpen = computed({
  get: () => open.value !== null,
  set: (v) => {
    if (!v) open.value = null
  },
})

const target = ref<PoolNpc | null>(null)
const confirmOpen = computed({
  get: () => target.value !== null,
  set: (v) => {
    if (!v) target.value = null
  },
})
const removing = ref(false)

function askRemove(npc: PoolNpc) {
  open.value = null
  target.value = npc
}

async function remove() {
  const npc = target.value
  if (!npc) return
  removing.value = true
  try {
    await npcs.removePool(npc.id)
    forget(npc.id)
    snackbar.show(`${npc.name} removed from the pool. Campaigns that use it keep their copy.`)
  } catch (err) {
    snackbar.error(err, 'Could not remove it from the pool')
  } finally {
    removing.value = false
    target.value = null
  }
}
</script>

<template>
  <div class="page" style="max-width: 1200px; gap: 24px">
    <header class="page-head">
      <div>
        <h1>NPCs</h1>
        <p>The shared pool GMs pick from. Add Official entries or fix anyone’s homebrew.</p>
      </div>
      <NuxtLink to="/admin/npcs/new" class="btn">New NPC</NuxtLink>
    </header>

    <p v-if="poolNote" class="notice">{{ poolNote }}</p>

    <section class="panel panel--flush" aria-labelledby="pool-h">
      <div class="head">
        <h2 id="pool-h">Pool</h2>
        <div class="filters">
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
          <label>
            <span class="sr-only">Game system</span>
            <select v-model="system" class="input">
              <option :value="null">All systems</option>
              <option v-for="s in SYSTEMS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
          <label>
            <span class="sr-only">Search NPCs</span>
            <input v-model="q" type="search" class="input" placeholder="Search by name" />
          </label>
        </div>
      </div>

      <div v-if="loading && !list.length" class="spinner" role="status" aria-label="Loading NPCs" />
      <div
        v-else
        class="table-wrap"
        tabindex="0"
        role="region"
        aria-label="Table, scroll sideways for more"
      >
        <table class="table" style="min-width: 760px; font-size: 14px">
          <thead>
            <tr>
              <th scope="col" style="padding-left: 20px">Name</th>
              <th scope="col">System</th>
              <th scope="col">Level</th>
              <th scope="col">Source</th>
              <th scope="col">Updated</th>
              <th scope="col" style="text-align: right; padding-right: 20px">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in list" :key="n.id">
              <td style="padding-left: 20px">
                <div class="row" style="flex-wrap: nowrap">
                  <UiAvatar
                    :name="n.name"
                    :src="npcImageUrl(n.image_path)"
                    :square="n.kind === 'monster'"
                    :size="36"
                  />
                  <div class="stack" style="gap: 0; min-width: 0">
                    <strong>{{ n.name }}</strong>
                    <span class="small muted" style="font-size: 12px">
                      {{ n.kind === 'monster' ? 'Monster' : 'Humanoid'
                      }}{{ n.stat_block.type ? ` · ${n.stat_block.type}` : '' }}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                <span class="badge" :class="`badge--${n.system}`">{{ systemLabel(n.system) }}</span>
              </td>
              <td>{{ n.level || '—' }}</td>
              <td>
                <span class="tag" :class="{ 'tag--official': n.source === 'official' }">{{
                  n.source === 'official' ? 'Official' : 'Homebrew'
                }}</span>
                <span v-if="n.ai_generated" class="tag">AI</span>
              </td>
              <td>{{ shortDate(n.updated_at) }}</td>
              <td style="padding-right: 20px">
                <div class="row" style="justify-content: flex-end; gap: 6px; flex-wrap: nowrap">
                  <button
                    type="button"
                    class="btn btn--ghost btn--sm"
                    :aria-label="`View ${n.name}`"
                    @click="open = n"
                  >
                    View
                  </button>
                  <NuxtLink
                    :to="{ path: '/admin/npcs/new', query: { edit: n.id } }"
                    class="btn btn--ghost btn--sm"
                    :aria-label="`Edit ${n.name}`"
                    >Edit</NuxtLink
                  >
                  <button
                    type="button"
                    class="btn btn--quiet btn--sm"
                    :aria-label="`Remove ${n.name}`"
                    @click="askRemove(n)"
                  >
                    Remove
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="6" class="muted" style="padding: 24px 20px">No NPCs match.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="hasMore" class="more">
        <button type="button" class="btn btn--ghost" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </section>

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
      </div>
      <template #actions>
        <button v-if="open" type="button" class="btn btn--quiet" @click="askRemove(open)">
          Remove
        </button>
        <NuxtLink
          v-if="open"
          :to="{ path: '/admin/npcs/new', query: { edit: open.id } }"
          class="btn btn--ghost"
          >Edit</NuxtLink
        >
        <button type="button" class="btn" @click="open = null">Close</button>
      </template>
    </UiDialog>

    <UiDialog v-model="confirmOpen" :title="`Remove ${target?.name ?? ''}?`" alert width="460px">
      <p>It leaves the pool for everyone. Campaigns that already use it keep their copy.</p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="target = null">Keep it</button>
        <button type="button" class="btn btn--danger" :disabled="removing" @click="remove">
          Remove from pool
        </button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);

  h2 {
    font-size: 20px;
  }
}

.more {
  display: flex;
  justify-content: center;
  padding: 14px 20px;
  border-top: 1px solid var(--line);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  .input {
    width: auto;
    min-width: 160px;
  }
}

.tag {
  display: inline-block;
  margin-right: 4px;
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
</style>
