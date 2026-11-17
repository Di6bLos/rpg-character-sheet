<script setup lang="ts">
// The Lore Master conversation: messages, suggestions and the question box.
import { providerLabel } from '~/stores/aiKeys'
import { loreHtml } from '~/utils/loreText'

defineProps<{ drawer: boolean }>()
const emit = defineEmits<{ dismiss: [] }>()

const aiKeys = useAiKeysStore()
const { isGm } = useCampaignBoard()
const { messages, pending, error, free, freeRemaining, send, retry, clear } = useLoreMaster()

const question = ref('')
const list = ref<HTMLElement | null>(null)
const box = ref<HTMLTextAreaElement | null>(null)

const provider = computed(() =>
  free.value ? 'Free' : aiKeys.defaultKey ? providerLabel(aiKeys.defaultKey.provider) : '',
)
/** The free allowance is used up for today. */
const outOfFree = computed(() => free.value && freeRemaining.value === 0)
const site = useSiteStore()
/** "18 / 25 free questions left today", while on the free agent. */
const freeCount = computed(() =>
  free.value && freeRemaining.value !== null && !outOfFree.value
    ? `${freeRemaining.value} / ${site.settings.free_ai_daily_limit} free questions left today`
    : '',
)
const freeHelp = computed(() => {
  const left = freeRemaining.value === null ? '' : ` (${freeRemaining.value} left today)`
  return `Free questions run on the site's Gemini key${left}. Google may use free-tier requests to improve its products. Add your own key in Settings for unlimited, private use.`
})

const suggestions = computed(() =>
  isGm.value
    ? [
        'How is the party doing right now?',
        'Build a balanced encounter for my party',
        'How should I run a fight in a collapsing mine?',
      ]
    : ['What can I do on my turn?', 'Explain my class abilities', 'How do conditions work?'],
)

function ask(text = question.value) {
  if (!text.trim() || pending.value) return
  void send(text)
  question.value = ''
  nextTick(() => box.value?.focus())
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    ask()
  }
}

// Keep the newest message in view.
watch(
  () => [messages.value.length, pending.value, error.value],
  () =>
    nextTick(() => {
      if (list.value) list.value.scrollTop = list.value.scrollHeight
    }),
  { flush: 'post' },
)
onMounted(() => {
  if (list.value) list.value.scrollTop = list.value.scrollHeight
})
</script>

<template>
  <div class="lore">
    <header class="lore__head">
      <div class="lore__who">
        <strong>Lore Master</strong>
        <span class="lore__sub"
          >{{ isGm ? 'Co-GM' : 'Rules & your hero'
          }}<template v-if="provider"> · {{ provider }}</template
          ><UiHelp v-if="free" label="About the free Lore Master" :text="freeHelp"
        /></span>
      </div>
      <button
        v-if="messages.length"
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="pending"
        title="Start a new conversation"
        @click="clear"
      >
        Clear
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--icon lore__icon"
        data-lp-dismiss
        :aria-label="drawer ? 'Close the Lore Master' : 'Collapse the Lore Master'"
        :title="drawer ? 'Close' : 'Collapse'"
        @click="emit('dismiss')"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            :d="drawer ? 'M6 6l12 12M18 6L6 18' : 'M9 5l7 7-7 7'"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </header>

    <div ref="list" class="lore__list" aria-live="polite">
      <div v-if="!messages.length" class="lore__empty">
        <p v-if="isGm">Ask about rules, the party, NPCs or running a scene.</p>
        <div class="lore__suggest">
          <button
            v-for="s in suggestions"
            :key="s"
            type="button"
            class="chip"
            :disabled="pending"
            @click="ask(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <template v-for="(m, i) in messages" :key="i">
        <p v-if="m.role === 'user'" class="lore__msg lore__msg--user">{{ m.content }}</p>
        <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
        <div v-else class="lore__msg lore__msg--ai" v-html="loreHtml(m.content)" />
      </template>

      <p v-if="pending" class="lore__msg lore__msg--ai lore__thinking">Consulting the tomes…</p>
      <div v-if="error" class="lore__error" role="alert">
        <p>{{ error }}</p>
        <button type="button" class="btn btn--sm btn--ghost" @click="retry">Try again</button>
      </div>
    </div>

    <p v-if="outOfFree" class="lore__limit">
      Today's free questions are used up.
      <NuxtLink to="/settings">Add your own key</NuxtLink> to keep going.
    </p>
    <form v-else class="lore__ask" @submit.prevent="ask()">
      <label :for="`lore-q-${isGm ? 'gm' : 'pc'}`" class="sr-only">Ask the Lore Master</label>
      <textarea
        :id="`lore-q-${isGm ? 'gm' : 'pc'}`"
        ref="box"
        v-model="question"
        class="input lore__box"
        rows="2"
        maxlength="4000"
        placeholder="Ask a question…"
        @keydown="onKey"
      />
      <button type="submit" class="btn btn--sm" :disabled="pending || !question.trim()">Ask</button>
    </form>
    <p v-if="freeCount" class="lore__count" aria-live="polite">{{ freeCount }}</p>
  </div>
</template>

<style scoped lang="scss">
.lore {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}

.lore__head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}

.lore__who {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;

  strong {
    font-family: var(--font-heading);
    font-size: 16px;
  }
}

.lore__sub {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-size: 12px;
  color: var(--page-muted);
}

.lore__count {
  margin: -2px 0 0;
  font-size: 12px;
  color: var(--page-muted);
  text-align: right;
}

.lore__limit {
  margin: 0;
  font-size: 13px;
  color: var(--page-muted);
}

.lore__icon {
  width: 32px;
  min-width: 32px;
  min-height: 32px;
}

.lore__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}

.lore__empty {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  color: var(--page-soft);
}

.lore__suggest {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;

  .chip {
    min-height: 32px;
    padding: 6px 12px;
    font-size: 13px;
    text-align: left;
  }
}

.lore__msg {
  max-width: 100%;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.lore__msg--user {
  align-self: flex-end;
  max-width: 88%;
  padding: 8px 12px;
  border-radius: 12px 12px 2px 12px;
  background: var(--accent);
  color: var(--on-accent);
  white-space: pre-wrap;
}

.lore__msg--ai {
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 12px 12px 12px 2px;
  background: var(--field);

  :deep(p),
  :deep(ul),
  :deep(ol),
  :deep(pre) {
    margin: 0 0 8px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 18px;
  }

  :deep(h4) {
    margin: 10px 0 4px;
    font-family: var(--font-heading);
    font-size: 14px;

    &:first-child {
      margin-top: 0;
    }
  }

  :deep(code) {
    font-size: 13px;
  }

  :deep(pre) {
    overflow-x: auto;
    white-space: pre;
  }
}

.lore__thinking {
  color: var(--page-muted);
  font-style: italic;
}

.lore__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  font-size: 13px;
  color: var(--danger);
}

.lore__ask {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.lore__box {
  flex: 1;
  min-height: 44px;
  max-height: 140px;
  resize: vertical;
  font-size: 14px;
}
</style>
