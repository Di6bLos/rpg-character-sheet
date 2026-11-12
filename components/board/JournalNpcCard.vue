<script setup lang="ts">
// An NPC or bestiary entry in the party journal. Any member writes the notes;
// the GM reveals stat-block facts one at a time and can hide the entry.
import type { CampaignNpc, JournalEntry, JournalFact } from '~/types'
import type { useJournal } from '~/composables/useJournal'
import { revealableFacts, toggleFact } from '~/utils/npcJournal'

const props = defineProps<{
  entry: JournalEntry
  journal: ReturnType<typeof useJournal>
  /** The campaign NPC behind the entry (GM only; players never load it). */
  npc: Pick<CampaignNpc, 'id' | 'stat_block' | 'level' | 'gm_notes'> | null
  gm: boolean
}>()

const auth = useAuthStore()
const bestiary = computed(() => props.entry.section === 'bestiary')
const facts = computed<JournalFact[]>(() => props.entry.fields?.facts ?? [])
const allFacts = computed(() => (props.npc ? revealableFacts(props.npc.stat_block) : []))
const factKey = (f: JournalFact) => `${f.k}\u0000${f.v}`
const revealed = computed(() => new Set(facts.value.map(factKey)))
const image = computed(() => npcImageUrl(props.entry.image_path))

const canWrite = computed(
  () => props.entry.visibility === 'party' || props.entry.author_id === auth.userId || props.gm,
)

// --- Notes ------------------------------------------------------------------------
const editing = ref(false)
const form = ref({ role: '', attitude: '', met: '', notes: '' })
function startEdit() {
  const f = props.entry.fields ?? {}
  form.value = {
    role: f.role ?? '',
    attitude: f.attitude ?? '',
    met: f.met ?? '',
    notes: f.notes ?? '',
  }
  editing.value = true
}
async function save() {
  await props.journal.saveNotes(props.entry, {
    role: form.value.role.trim(),
    attitude: form.value.attitude.trim(),
    met: form.value.met.trim(),
    notes: form.value.notes.trim(),
  })
  editing.value = false
}

const ATTITUDES = ['Friendly', 'Neutral', 'Wary', 'Hostile', 'Unknown']
const attitude = computed(() => props.entry.fields?.attitude ?? '')

// --- GM -------------------------------------------------------------------------
const revealOpen = ref(false)
function reveal(f: JournalFact) {
  void props.journal.setFacts(props.entry, toggleFact(facts.value, f, allFacts.value))
}
function revealAll() {
  void props.journal.setFacts(props.entry, allFacts.value)
}
function hideAll() {
  void props.journal.setFacts(props.entry, [])
}
const removeOpen = ref(false)
async function confirmRemove() {
  removeOpen.value = false
  await props.journal.remove(props.entry)
}
</script>

<template>
  <article
    class="panel npc"
    :class="{ 'npc--beast': bestiary, 'npc--hidden': entry.visibility === 'gm' }"
    :aria-label="entry.title"
  >
    <div class="npc__art" :class="{ 'npc__art--empty': !image }">
      <img v-if="image" :src="image" alt="" loading="lazy" />
      <svg
        v-else
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path v-if="bestiary" d="M4 14c0-4 3-8 8-8s8 4 8 8l-3 4H7z M9 12h.01 M15 12h.01" />
        <template v-else>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </template>
      </svg>
      <span v-if="!bestiary && attitude" class="npc__att" :data-att="attitude.toLowerCase()">{{
        attitude
      }}</span>
      <span v-if="entry.visibility === 'gm'" class="npc__hidden">Hidden</span>
    </div>

    <div class="npc__body">
      <div class="npc__title">
        <h3>{{ entry.title }}</h3>
        <span v-if="entry.fields?.role" class="npc__role">{{ entry.fields.role }}</span>
        <span v-if="gm && npc?.level" class="npc__lvl">Level {{ npc.level }}</span>
      </div>

      <dl v-if="facts.length || (gm && revealOpen)" class="facts">
        <template v-if="gm && revealOpen">
          <div
            v-for="f in allFacts"
            :key="factKey(f)"
            class="fact"
            :class="{ 'fact--off': !revealed.has(factKey(f)) }"
          >
            <dt>{{ f.k }}</dt>
            <dd>{{ f.v }}</dd>
            <button
              type="button"
              class="fact__btn"
              :aria-pressed="revealed.has(factKey(f))"
              @click="reveal(f)"
            >
              {{ revealed.has(factKey(f)) ? 'Hide' : 'Reveal' }}
            </button>
          </div>
        </template>
        <template v-else>
          <div v-for="f in facts" :key="factKey(f)" class="fact">
            <dt>{{ f.k }}</dt>
            <dd>{{ f.v }}</dd>
          </div>
        </template>
      </dl>
      <p v-else-if="bestiary" class="small muted">
        {{ gm ? 'Nothing revealed yet.' : 'Nothing is known about it yet.' }}
      </p>

      <form v-if="editing" class="stack npc__form" @submit.prevent="save">
        <div v-if="!bestiary" class="npc__grid">
          <div class="field">
            <label :for="`role-${entry.id}`">Who they are</label>
            <input
              :id="`role-${entry.id}`"
              v-model="form.role"
              class="input"
              maxlength="120"
              placeholder="Ferryman on the Greywater"
            />
          </div>
          <div class="field">
            <label :for="`att-${entry.id}`">Attitude</label>
            <select :id="`att-${entry.id}`" v-model="form.attitude" class="input">
              <option value="">Not sure</option>
              <option v-for="a in ATTITUDES" :key="a" :value="a">{{ a }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label :for="`met-${entry.id}`">{{
            bestiary ? 'Where we fought it' : 'Where we met'
          }}</label>
          <input :id="`met-${entry.id}`" v-model="form.met" class="input" maxlength="160" />
        </div>
        <div class="field">
          <label :for="`notes-${entry.id}`">{{ bestiary ? 'What we learned' : 'Notes' }}</label>
          <textarea
            :id="`notes-${entry.id}`"
            v-model="form.notes"
            class="input"
            rows="4"
            maxlength="4000"
          />
        </div>
        <div class="row" style="justify-content: flex-end; gap: 8px">
          <button type="button" class="btn btn--ghost btn--sm" @click="editing = false">
            Cancel
          </button>
          <button type="submit" class="btn btn--sm">Save notes</button>
        </div>
      </form>
      <template v-else>
        <p v-if="entry.fields?.notes" class="npc__notes">
          <b v-if="bestiary">Party notes · </b>{{ entry.fields.notes }}
        </p>
        <p v-else class="small muted">
          No notes yet{{ canWrite ? ' — add what the party knows.' : '.' }}
        </p>
        <span v-if="entry.fields?.met" class="npc__met"
          >{{ bestiary ? 'Fought' : 'Met' }}: {{ entry.fields.met }}</span
        >
      </template>

      <div v-if="gm && npc?.gm_notes" class="npc__gm"><b>GM note · </b>{{ npc.gm_notes }}</div>

      <div v-if="!editing" class="npc__tools">
        <button v-if="canWrite" type="button" class="btn btn--ghost btn--sm" @click="startEdit">
          {{ entry.fields?.notes || entry.fields?.role ? 'Edit notes' : 'Add notes' }}
        </button>
        <template v-if="gm">
          <button
            v-if="allFacts.length"
            type="button"
            class="btn btn--ghost btn--sm"
            :aria-expanded="revealOpen"
            @click="revealOpen = !revealOpen"
          >
            {{
              revealOpen ? 'Done revealing' : `Reveal facts (${facts.length}/${allFacts.length})`
            }}
          </button>
          <template v-if="revealOpen">
            <button type="button" class="btn btn--quiet btn--sm" @click="revealAll">
              Reveal all
            </button>
            <button type="button" class="btn btn--quiet btn--sm" @click="hideAll">Hide all</button>
          </template>
          <button
            type="button"
            class="btn btn--quiet btn--sm"
            @click="journal.setVisibility(entry, entry.visibility === 'gm' ? 'party' : 'gm')"
          >
            {{ entry.visibility === 'gm' ? 'Show to party' : 'Hide from party' }}
          </button>
          <button type="button" class="btn btn--quiet btn--sm" @click="removeOpen = true">
            Delete
          </button>
        </template>
      </div>
    </div>

    <UiDialog v-model="removeOpen" :title="`Delete “${entry.title}”?`" alert width="460px">
      <p>The party loses this entry and their notes on it.</p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="removeOpen = false">Keep it</button>
        <button type="button" class="btn btn--danger" @click="confirmRemove">Delete</button>
      </template>
    </UiDialog>
  </article>
</template>

<style scoped lang="scss">
.npc {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &--beast {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 18px;
    padding: 18px;
  }

  &--hidden {
    opacity: 0.8;
    border-style: dashed;
  }
}

.npc__art {
  position: relative;
  height: 150px;
  background: var(--inset);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--page-muted);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .npc--beast & {
    flex: 0 0 120px;
    height: 120px;
    border-radius: min(var(--radius-control), 10px);
    overflow: hidden;
  }
}

.npc__att,
.npc__hidden {
  position: absolute;
  padding: 4px 10px;
  border-radius: var(--radius-control);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--panel-bg) 90%, transparent);
  border: 1px solid var(--line);
}

.npc__att {
  left: 14px;
  bottom: 12px;

  &[data-att='friendly'] {
    background: var(--ok-bg);
    color: var(--ok-text);
  }

  &[data-att='hostile'] {
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  &[data-att='wary'] {
    background: var(--warn-bg);
    color: var(--warn-text);
  }
}

.npc__hidden {
  right: 12px;
  top: 12px;
  border-style: dashed;
  border-color: var(--danger);
}

.npc__body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;

  .npc--beast & {
    padding: 0;
    flex: 1 1 380px;
    min-width: 0;
  }
}

.npc__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;

  h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 22px;
    line-height: 1.15;
    width: 100%;

    .npc--beast & {
      width: auto;
      font-size: 24px;
    }
  }
}

.npc__role {
  font-size: 14px;
  color: var(--page-muted);
}

.npc__lvl {
  padding: 2px 8px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line-strong);
  font-size: 12px;
  font-weight: 700;
}

.facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.fact {
  padding: 8px 10px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 2px;

  dt {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  dd {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  &--off {
    background: transparent;
    border-style: dashed;
    opacity: 0.75;
  }
}

.fact__btn {
  align-self: flex-start;
  margin-top: 4px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: min(var(--radius-control), 6px);
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--page-text);
  font-size: 12px;
  font-weight: 600;

  &[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
}

.npc__notes {
  margin: 0;
  font-size: 15px;
  line-height: 1.55;
  color: var(--page-soft);
  white-space: pre-wrap;
}

.npc__met {
  font-size: 13px;
  font-style: italic;
  color: var(--page-muted);
}

.npc__gm {
  padding: 8px 10px;
  border-radius: min(var(--radius-control), 8px);
  border: 1px dashed var(--accent-text);
  font-size: 14px;
  line-height: 1.45;

  b {
    color: var(--accent-text);
  }
}

.npc__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.npc__tools {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
