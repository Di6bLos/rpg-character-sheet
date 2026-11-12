<script setup lang="ts">
// Settings → AI providers: the user's own Claude / Gemini / ChatGPT keys for the
// AI features. Keys are encrypted in Supabase Vault; the browser only sees the last 4.
import type { AiProvider } from '~/types'
import { AI_PROVIDERS } from '~/stores/aiKeys'

const keys = useAiKeysStore()
const site = useSiteStore()
const snackbar = useSnackbarStore()

const drafts = ref<Record<AiProvider, string>>({ anthropic: '', google: '', openai: '' })
const editing = ref<AiProvider | null>(null)
const busy = ref<AiProvider | null>(null)
const results = ref<Partial<Record<AiProvider, { ok: boolean; message: string }>>>({})

onMounted(
  () => void keys.fetch().catch((err) => snackbar.error(err, 'Could not load your API keys')),
)

function saved(p: AiProvider) {
  return keys.keys.find((k) => k.provider === p) ?? null
}

async function save(p: AiProvider) {
  const key = drafts.value[p].trim()
  if (!key) return
  busy.value = p
  try {
    await keys.save(p, key)
    drafts.value[p] = ''
    editing.value = null
    results.value[p] = undefined
    snackbar.show('Key saved and encrypted')
  } catch (err) {
    snackbar.error(err, 'Could not save the key')
  } finally {
    busy.value = null
  }
}

async function remove(p: AiProvider) {
  busy.value = p
  try {
    await keys.remove(p)
    results.value[p] = undefined
    snackbar.show('Key removed')
  } catch (err) {
    snackbar.error(err, 'Could not remove the key')
  } finally {
    busy.value = null
  }
}

async function test(p: AiProvider) {
  busy.value = p
  try {
    results.value[p] = await keys.test(p)
  } finally {
    busy.value = null
  }
}

async function makeDefault(p: AiProvider) {
  try {
    await keys.makeDefault(p)
  } catch (err) {
    snackbar.error(err, 'Could not change the default')
  }
}
</script>

<template>
  <section id="ai" class="panel" aria-labelledby="ai-h">
    <div class="panel-title">
      <h2 id="ai-h">AI providers</h2>
    </div>
    <p class="small muted ai__intro">
      The AI features (like drafting NPC stat blocks) run on your own API key, billed by the
      provider. Keys are encrypted on the server and never shown again; only the last four
      characters are kept for you to recognise them.
    </p>
    <p v-if="!site.settings.ai_enabled" class="small ai__off" role="note">
      An admin has turned the AI features off for now. Your saved keys stay put.
    </p>
    <ul class="ai__list">
      <li v-for="p in AI_PROVIDERS" :key="p.id" class="ai__row">
        <div class="ai__name">
          <strong>{{ p.label }}</strong>
          <span class="small muted">{{ p.product }}</span>
        </div>
        <template v-if="saved(p.id) && editing !== p.id">
          <span class="ai__saved">
            <span class="ai__mask">•••• {{ saved(p.id)!.last4 }}</span>
            <span v-if="saved(p.id)!.is_default" class="ai__default">Default</span>
            <button v-else type="button" class="btn btn--quiet btn--sm" @click="makeDefault(p.id)">
              Make default
            </button>
          </span>
          <span class="ai__tools">
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="busy === p.id || !site.settings.ai_enabled"
              @click="test(p.id)"
            >
              {{ busy === p.id ? 'Testing…' : 'Test' }}
            </button>
            <button type="button" class="btn btn--ghost btn--sm" @click="editing = p.id">
              Replace
            </button>
            <button
              type="button"
              class="btn btn--quiet btn--sm"
              :disabled="busy === p.id"
              @click="remove(p.id)"
            >
              Remove
            </button>
          </span>
        </template>
        <form v-else class="ai__form" @submit.prevent="save(p.id)">
          <label :for="`key-${p.id}`" class="sr-only">{{ p.label }} API key</label>
          <input
            :id="`key-${p.id}`"
            v-model="drafts[p.id]"
            class="input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :placeholder="p.keyHint"
          />
          <button
            type="submit"
            class="btn btn--sm"
            :disabled="busy === p.id || !drafts[p.id].trim()"
          >
            Save key
          </button>
          <button
            v-if="editing === p.id"
            type="button"
            class="btn btn--quiet btn--sm"
            @click="editing = null"
          >
            Cancel
          </button>
          <a :href="p.keysUrl" target="_blank" rel="noopener" class="small">Get a key</a>
        </form>
        <p
          v-if="results[p.id]"
          class="small ai__result"
          :class="{ 'is-bad': !results[p.id]!.ok }"
          role="status"
        >
          {{ results[p.id]!.message }}
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.ai__intro {
  margin: 0 0 12px;
}

.ai__off {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--warn-bg);
  color: var(--warn-text);
}

.ai__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.ai__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}

.ai__name {
  flex: 0 0 140px;
  display: flex;
  flex-direction: column;
}

.ai__saved {
  flex: 1 1 180px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai__mask {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 14px;
}

.ai__default {
  padding: 2px 8px;
  border-radius: var(--radius-control);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 12px;
  font-weight: 700;
}

.ai__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai__form {
  flex: 1 1 320px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  .input {
    flex: 1 1 200px;
    min-width: 0;
  }
}

.ai__result {
  flex: 1 1 100%;
  margin: 0;
  color: var(--ok-text);

  &.is-bad {
    color: var(--danger-text);
  }
}
</style>
