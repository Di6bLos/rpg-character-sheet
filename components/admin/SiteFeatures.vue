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

const FEATURES: { key: keyof SiteSettings; label: string; help: string }[] = [
  {
    key: 'npc_pool_enabled',
    label: 'Shared NPC pool',
    help: 'NPCs that GMs save are shared in the library for every GM to use. Off: the library tab and the pool disappear; campaigns keep the NPCs they already have.',
  },
  {
    key: 'ai_enabled',
    label: 'AI NPC generator',
    help: 'GMs can draft stat blocks with their own Claude, Gemini or ChatGPT API key.',
  },
]

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
    <ul>
      <li v-for="f in FEATURES" :key="f.key">
        <UiSwitch
          :model-value="site.settings[f.key]"
          :label="f.label"
          :disabled="!auth.isAdmin || busy !== null"
          @update:model-value="toggle(f.key, $event)"
        />
        <p class="small muted">{{ f.help }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.features {
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
