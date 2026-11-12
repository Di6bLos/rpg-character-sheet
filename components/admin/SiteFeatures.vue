<script setup lang="ts">
// Admin: site-wide switches. Only admins can change them (moderators see them read-only).
import type { SiteSettings } from '~/types'

const auth = useAuthStore()
const site = useSiteStore()
const snackbar = useSnackbarStore()
const busy = ref<keyof SiteSettings | null>(null)

onMounted(
  () => void site.fetch(true).catch((err) => snackbar.error(err, 'Could not load site settings')),
)

interface Feature {
  key: keyof SiteSettings
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
      {
        key: 'npc_pool_publish',
        label: 'Publish GM NPCs',
        help: 'NPCs that GMs save are also added to the pool as homebrew. Off: they stay in their campaign. Staff can always add to the pool from Admin → NPCs.',
      },
    ],
  },
  {
    title: 'AI',
    features: [
      {
        key: 'ai_enabled',
        label: 'AI NPC generator',
        help: 'GMs can draft stat blocks with their own Claude, Gemini or ChatGPT API key.',
      },
    ],
  },
]
const FEATURES = GROUPS.flatMap((g) => g.features)

async function toggle(key: keyof SiteSettings, value: boolean) {
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
</style>
