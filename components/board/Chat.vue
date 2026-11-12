<script setup lang="ts">
// Party chat with private threads to each member and unread badges.
import type { RosterEntry } from '~/types'
import { authorLabel } from '~/utils/roster'
import { plural, timeAgo } from '~/utils/format'

const props = defineProps<{ roster: RosterEntry[] }>()

const auth = useAuthStore()
const chat = useBoardChat()
const draft = ref('')
const canMessage = computed(() => auth.can('can_send_messages'))

const others = computed(() => props.roster.filter((r) => r.user_id !== auth.userId))

const tabs = computed(() => [
  { id: 'party', label: 'Party', entry: null as RosterEntry | null },
  ...others.value.map((r) => ({
    id: r.user_id,
    label:
      r.role === 'gm'
        ? `${r.display_name} (GM)`
        : (r.character_name?.split(' ')[0] ?? r.display_name),
    entry: r,
  })),
])

const current = computed(() => tabs.value.find((t) => t.id === chat.thread.value) ?? tabs.value[0]!)

const note = computed(() =>
  current.value.id === 'party'
    ? 'Everyone in the campaign sees these messages'
    : `Private · only you and ${current.value.entry?.character_name ?? current.value.entry?.display_name} see this`,
)

function entryOf(userId: string) {
  return props.roster.find((r) => r.user_id === userId)
}

function who(userId: string) {
  return authorLabel(props.roster, userId).primary
}

async function send() {
  if (await chat.send(draft.value)) draft.value = ''
}

onMounted(() => chat.markRead(chat.thread.value))
</script>

<template>
  <section class="panel chat" aria-labelledby="chat-h">
    <div class="chat__head">
      <h2 id="chat-h">Messages</h2>
      <div role="tablist" aria-label="Conversations" class="chat__tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="t.id === current.id"
          :aria-label="
            chat.unread(t.id)
              ? `${t.label}, ${plural(chat.unread(t.id), 'unread message')}`
              : t.label
          "
          @click="chat.open(t.id)"
        >
          <UiAvatar
            v-if="t.entry"
            :name="t.entry.character_name ?? t.entry.display_name"
            :portrait-path="t.entry.portrait_path"
            :class-slug="t.entry.summary?.classSlug ?? null"
            :size="26"
          />
          <span v-else class="chat__party" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              <circle cx="17" cy="9" r="2.5" />
              <path d="M16 14.2c2.9.3 5 2.7 5 5.8" />
            </svg>
          </span>
          {{ t.label }}
          <span v-if="chat.unread(t.id)" class="chat__unread" aria-hidden="true">{{
            chat.unread(t.id)
          }}</span>
        </button>
      </div>
    </div>
    <div class="chat__note">
      <svg
        v-if="current.id !== 'party'"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      {{ note }}
    </div>
    <ol role="log" :aria-label="`${current.label} messages`" class="chat__log">
      <li
        v-for="m in chat.inThread.value"
        :key="m.id"
        :class="{ 'is-me': m.sender_id === auth.userId }"
      >
        <UiAvatar
          v-if="m.sender_id !== auth.userId"
          :name="who(m.sender_id)"
          :portrait-path="entryOf(m.sender_id)?.portrait_path ?? null"
          :class-slug="entryOf(m.sender_id)?.summary?.classSlug ?? null"
          :size="30"
        />
        <div class="chat__msg">
          <span class="chat__meta"
            ><b>{{ m.sender_id === auth.userId ? 'You' : who(m.sender_id) }}</b> ·
            {{ timeAgo(m.created_at) }}</span
          >
          <span class="chat__bubble">{{ m.body }}</span>
        </div>
      </li>
      <li v-if="!chat.inThread.value.length" class="chat__empty">No messages here yet.</li>
    </ol>
    <RestrictedNotice v-if="!canMessage" title="Messaging is turned off for your account" />
    <form v-else class="chat__form" aria-label="Send a message" @submit.prevent="send">
      <label for="chat-in" class="sr-only">Message {{ current.label }}</label>
      <input
        id="chat-in"
        v-model="draft"
        class="input"
        maxlength="4000"
        autocomplete="off"
        :placeholder="
          current.id === 'party' ? 'Message the party…' : `Message ${current.label} privately…`
        "
      />
      <button type="submit" class="btn" :disabled="chat.sending.value || !draft.trim()">
        Send
      </button>
    </form>
  </section>
</template>

<style scoped lang="scss">
.chat {
  padding: 0;
  height: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat__head {
  padding: 14px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;

  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 22px;
  }
}

.chat__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 10px 0 6px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--page-soft);
    font-size: 14px;
    font-weight: 600;

    &[aria-selected='true'] {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--on-accent);
    }
  }
}

.chat__party {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--inset);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--page-text);
}

.chat__unread {
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  [aria-selected='true'] & {
    background: var(--on-accent);
    color: var(--accent);
  }
}

.chat__note {
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--page-muted);
}

.chat__log {
  list-style: none;
  margin: 0;
  padding: 4px 16px 16px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;

  li {
    display: flex;
    gap: 8px;
    align-items: flex-end;

    &.is-me {
      justify-content: flex-end;
    }
  }
}

.chat__msg {
  max-width: 78%;
  display: flex;
  flex-direction: column;
  gap: 3px;

  .is-me & {
    align-items: flex-end;
  }
}

.chat__meta {
  font-size: 12px;
  color: var(--page-muted);
}

.chat__bubble {
  padding: 9px 12px;
  border-radius: 14px 14px 14px 4px;
  background: var(--inset);
  font-size: 15px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  .is-me & {
    border-radius: 14px 14px 4px 14px;
    background: var(--accent);
    color: var(--on-accent);
  }
}

.chat__empty {
  justify-content: center;
  color: var(--page-muted);
  font-size: 14px;
  padding: 24px 0;
}

.chat__form {
  display: flex;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--line);

  .input {
    flex: 1;
    min-width: 0;
  }
}
</style>
