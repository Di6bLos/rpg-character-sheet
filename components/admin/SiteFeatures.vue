<script setup lang="ts">
// Admin: site-wide switches. Only admins can change them (moderators see them read-only).
import type { SiteSwitch } from '~/types'

const auth = useAuthStore()
const site = useSiteStore()
const snackbar = useSnackbarStore()
const busy = ref<SiteSwitch | 'free_ai_daily_limit' | null>(null)

onMounted(
  () => void site.fetch(true).catch((err) => snackbar.error(err, 'Could not load site settings')),
)

interface Feature {
  key: SiteSwitch
  label: string
  help: string
}

const GROUPS: { title: string; features: Feature[] }[] = [
  {
    title: 'Shared NPC pool',
    features: [
      {
        key: 'npc_pool_campaign',
        label: 'Pool in the GM console',
        help: 'GMs can browse the pool from their campaign’s NPC index and add NPCs to it. Off: campaigns keep the NPCs they already have.',
      },
      {
        key: 'npc_pool_library',
        label: 'NPCs in the Library',
        help: 'Everyone sees the “NPCs & monsters” tab in the Library. Off: the tab is hidden, the GM console can still use the pool.',
      },
    ],
  },
  {
    title: 'AI',
    features: [
      {
        key: 'ai_enabled',
        label: 'AI features',
        help: 'The NPC generator and the Scribe, on each user’s own Claude, Gemini or ChatGPT API key.',
      },
      {
        key: 'free_ai_enabled',
        label: 'Free Scribe',
        help: 'Users without their own key get a daily allowance on the site’s Gemini key. Set the FREE_AI_GEMINI_KEY secret on the lore-master function first.',
      },
    ],
  },
]
const FEATURES = GROUPS.flatMap((g) => g.features)

async function toggle(key: SiteSwitch, value: boolean) {
  busy.value = key
  try {
    await site.set(key, value)
    snackbar.show(`${FEATURES.find((f) => f.key === key)?.label} turned ${value ? 'on' : 'off'}`)
  } catch (err) {
    snackbar.error(err, 'Could not change that setting')
  } finally {
    busy.value = null
  }
}

const limit = ref(site.settings.free_ai_daily_limit)
watch(
  () => site.settings.free_ai_daily_limit,
  (v) => (limit.value = v),
)

async function saveLimit() {
  const value = Math.round(Number(limit.value))
  if (!Number.isFinite(value) || value < 0 || value > 500) {
    limit.value = site.settings.free_ai_daily_limit
    snackbar.show('Pick a daily limit between 0 and 500')
    return
  }
  if (value === site.settings.free_ai_daily_limit) return
  busy.value = 'free_ai_daily_limit'
  try {
    await site.setFreeLimit(value)
    snackbar.show(`Free Scribe: ${value} questions a day`)
  } catch (err) {
    limit.value = site.settings.free_ai_daily_limit
    snackbar.error(err, 'Could not change the daily limit')
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="panel features" aria-labelledby="features-h">
    <div class="panel-title">
      <h2 id="features-h">Site features</h2>
      <span v-if="!auth.isAdmin" class="small muted">Only admins can change these</span>
    </div>
    <div v-for="g in GROUPS" :key="g.title" class="features__group">
      <h3 class="caps">{{ g.title }}</h3>
      <ul>
        <li v-for="f in g.features" :key="f.key">
          <UiSwitch
            :model-value="site.settings[f.key]"
            :label="f.label"
            :disabled="!auth.isAdmin || busy !== null"
            @update:model-value="toggle(f.key, $event)"
          />
          <p class="small muted">{{ f.help }}</p>
          <label
            v-if="f.key === 'free_ai_enabled' && site.settings.free_ai_enabled"
            class="features__limit small"
          >
            Questions per user per day
            <input
              v-model.number="limit"
              class="input"
              type="number"
              min="0"
              max="500"
              inputmode="numeric"
              :disabled="!auth.isAdmin || busy !== null"
              @change="saveLimit"
            />
          </label>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
.features {
  display: flex;
  flex-direction: column;
  gap: 16px;

  h3 {
    margin: 0 0 6px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
    gap: 8px 32px;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  p {
    margin: 0;
    max-width: 520px;
  }
}

.features__limit {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;

  .input {
    width: 88px;
  }
}
</style>
