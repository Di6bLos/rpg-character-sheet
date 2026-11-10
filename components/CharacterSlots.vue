<script setup lang="ts">
// The player's five character slots: existing characters plus a
// "new character by system" tile (design/screens/Main.dc.html).
import { MAX_CHARACTERS } from '~/stores/character'
import { portraitUrl } from '~/stores/character'
import type { GameSystem } from '~/types'
import { lineageLine } from '~/utils/sheetDefaults'
import { SYSTEMS, initials, systemLabel } from '~/utils/systems'

defineProps<{ headingId: string }>()

const auth = useAuthStore()
const store = useCharacterStore()
const snackbar = useSnackbarStore()

const createOpen = ref(false)
const newSystem = ref<GameSystem>('dnd5e')
const newName = ref('')
const creating = ref(false)
const campaignByCharacter = ref<Record<string, string>>({})

const used = computed(() => store.characters.length)
const canCreate = computed(() => used.value < MAX_CHARACTERS && !auth.isSuspended)

async function loadCampaigns() {
  const { supabase } = await import('~/lib/supabase')
  if (!auth.userId) return
  const { data } = await supabase
    .from('campaign_members')
    .select('character_id, campaigns(name)')
    .eq('user_id', auth.userId)
    .not('character_id', 'is', null)
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as unknown as {
    character_id: string
    campaigns: { name: string } | null
  }[]) {
    if (row.campaigns) map[row.character_id] = row.campaigns.name
  }
  campaignByCharacter.value = map
}

onMounted(async () => {
  try {
    await Promise.all([store.fetchMine(), loadCampaigns()])
  } catch (err) {
    snackbar.error(err, 'Could not load your characters')
  }
})

function start(system: GameSystem) {
  newSystem.value = system
  newName.value = ''
  createOpen.value = true
}

async function create() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  try {
    const created = await store.create(newSystem.value, name)
    createOpen.value = false
    await navigateTo(`/character/${created.id}`)
  } catch (err) {
    snackbar.error(err, 'Could not create the character')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <section class="section" :aria-labelledby="headingId">
    <div class="section-head">
      <h2 :id="headingId">Your characters</h2>
      <div class="small muted">{{ used }} of {{ MAX_CHARACTERS }} slots used</div>
    </div>

    <div
      v-if="store.loading && !store.loaded"
      class="spinner"
      role="status"
      aria-label="Loading characters"
    />
    <div v-else class="slots">
      <NuxtLink v-for="c in store.characters" :key="c.id" :to="`/character/${c.id}`" class="slot">
        <div class="slot__art">
          <img v-if="c.portrait_path" :src="portraitUrl(c.portrait_path) ?? ''" alt="" />
          <div v-else class="slot__initials">{{ initials(c.name) }}</div>
          <span class="badge slot__system" :class="`badge--${c.system}`">{{
            systemLabel(c.system)
          }}</span>
          <span class="slot__level">Lvl {{ c.level }}</span>
        </div>
        <div class="slot__body">
          <strong>{{ c.name }}</strong>
          <span>{{ lineageLine(c.sheet) }}</span>
          <small>{{ campaignByCharacter[c.id] ?? 'Not in a campaign' }}</small>
        </div>
      </NuxtLink>

      <div v-if="canCreate" class="slot slot--new">
        <div class="slot__new-head">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <strong>New character</strong>
          <span>Choose a system</span>
        </div>
        <div class="slot__systems">
          <button v-for="s in SYSTEMS" :key="s.id" type="button" @click="start(s.id)">
            {{ s.long }}
          </button>
        </div>
      </div>
    </div>

    <UiDialog v-model="createOpen" title="New character" width="460px">
      <template #eyebrow>
        <span class="badge" :class="`badge--${newSystem}`" style="margin-bottom: 8px">
          {{ systemLabel(newSystem) }}
        </span>
      </template>
      <form class="stack" @submit.prevent="create">
        <div class="field">
          <label for="new-char-name">Character name</label>
          <input
            id="new-char-name"
            v-model="newName"
            class="input"
            maxlength="80"
            required
            autofocus
          />
          <span class="hint">You can fill in the rest of the sheet next.</span>
        </div>
        <div class="row" style="justify-content: flex-end">
          <button type="button" class="btn btn--ghost" @click="createOpen = false">Cancel</button>
          <button type="submit" class="btn" :disabled="creating || !newName.trim()">
            {{ creating ? 'Creating…' : 'Create character' }}
          </button>
        </div>
      </form>
    </UiDialog>
  </section>
</template>

<style scoped lang="scss">
.slots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr));
  gap: 16px;
}

.slot {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: var(--panel-text);
  background: var(--panel-bg);
  border: 1px solid var(--panel-line);
  border-radius: min(var(--radius-panel), 12px);
  box-shadow: var(--panel-shadow);
  overflow: hidden;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: var(--accent);
  }
}

.slot__art {
  height: 150px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(135deg, #241e17 0 10px, #201a14 10px 20px);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.slot__initials {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1.5px solid #5a4c3a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-size: 26px;
  font-weight: 700;
  color: #e0b054;
}

.slot__system {
  position: absolute;
  top: 10px;
  left: 10px;
}

.slot__level {
  position: absolute;
  bottom: 10px;
  right: 10px;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 9px;
  border-radius: 6px;
  background: #14110e;
  border: 1px solid #5a4c3a;
  color: #efe6d4;
}

.slot__body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong {
    font-size: 16px;
    font-weight: 600;
  }

  span {
    font-size: 14px;
    color: var(--panel-soft);
  }

  small {
    font-size: 13px;
    color: var(--panel-muted);
  }
}

.slot--new {
  border-style: dashed;
  border-color: var(--line-strong);
  background: transparent;
  box-shadow: none;
  color: var(--page-text);
  padding: 18px 16px;
  gap: 14px;
  justify-content: center;

  &:hover {
    border-color: var(--line-strong);
  }
}

.slot__new-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;

  svg {
    color: var(--accent-text);
  }

  span {
    font-size: 13px;
    color: var(--page-muted);
  }
}

.slot__systems {
  display: flex;
  flex-direction: column;
  gap: 8px;

  button {
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-control);
    border: 1px solid var(--line);
    background: var(--panel-bg);
    color: var(--panel-text);
    font-size: 14px;
    font-weight: 600;

    &:hover {
      border-color: var(--accent);
    }
  }
}
</style>
