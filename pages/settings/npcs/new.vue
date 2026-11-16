<script setup lang="ts">
// Settings → Suggest an NPC: build a stat block by hand (live preview) and send it to
// the moderators for the shared pool. ?edit=<id> edits a pending or rejected
// suggestion; ?from=<campaignNpcId> starts from one of the GM's campaign NPCs
// (without the GM notes).
import { supabase } from '~/lib/supabase'
import type { CampaignNpc, GameSystem, NpcSubmission } from '~/types'
import { blankNpcForm, fromStatBlock, toStatBlock, type NpcForm } from '~/utils/npcStatBlock'
import { SYSTEMS, systemLabel } from '~/utils/systems'

definePageMeta({ middleware: 'auth', key: (route) => route.fullPath })
useHead({ title: 'Suggest an NPC · Lantern' })

const route = useRoute()
const snackbar = useSnackbarStore()
const store = useNpcSubmissionStore()

const editId = ref<string | null>(typeof route.query.edit === 'string' ? route.query.edit : null)
const fromId = typeof route.query.from === 'string' ? route.query.from : null
const system = ref<GameSystem>('nimble')
const form = ref<NpcForm>(blankNpcForm(system.value))
const image = ref<string | null>(null)
const note = ref('')
const reviewNote = ref<string | null>(null)
const saving = ref(false)
const loadingSource = ref(false)

const preview = computed(() => toStatBlock(form.value, system.value))

function load(
  src: Pick<NpcSubmission, 'system' | 'stat_block' | 'name' | 'kind' | 'level' | 'image_path'>,
) {
  system.value = src.system
  form.value = fromStatBlock(src.stat_block, src.system, {
    name: src.name,
    kind: src.kind,
    level: src.level,
  })
  image.value = src.image_path
}

onMounted(async () => {
  if (!editId.value && !fromId) return
  loadingSource.value = true
  try {
    if (editId.value) {
      const s = await store.get(editId.value)
      if (s.status === 'approved') throw new Error('That suggestion is already in the Library')
      load(s)
      note.value = s.note
      reviewNote.value = s.status === 'rejected' ? s.review_note : null
    } else if (fromId) {
      const { data, error } = await supabase
        .from('campaign_npcs')
        .select('*')
        .eq('id', fromId)
        .single()
      if (error) throw error
      load(data as CampaignNpc)
    }
  } catch (err) {
    snackbar.error(err, 'Could not open that NPC')
    editId.value = null
  } finally {
    loadingSource.value = false
  }
})

/** A new system starts a blank form (stat block fields differ per system). */
function pickSystem(event: Event) {
  const next = (event.target as HTMLSelectElement).value as GameSystem
  if (next === system.value) return
  system.value = next
  form.value = blankNpcForm(next, form.value.kind)
}

async function submit() {
  if (!form.value.name.trim() || loadingSource.value) return
  saving.value = true
  try {
    const saved = await store.submit(
      {
        system: system.value,
        kind: form.value.kind,
        name: form.value.name.trim(),
        level: form.value.level.trim(),
        stat_block: preview.value,
        image_path: image.value,
        note: note.value.trim(),
      },
      editId.value,
    )
    snackbar.show(`${saved.name} sent for review`)
    await navigateTo({ path: '/settings', hash: '#npc-suggestions' })
  } catch (err) {
    snackbar.error(err, 'Could not send the suggestion')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page" style="max-width: 1320px; gap: 20px">
    <header class="page-head">
      <div>
        <h1>{{ editId ? `Edit ${form.name || 'suggestion'}` : 'Suggest an NPC' }}</h1>
        <p>
          A moderator checks it before it joins the Library. Approved entries are credited to you.
        </p>
      </div>
      <NuxtLink :to="{ path: '/settings', hash: '#npc-suggestions' }" class="btn btn--ghost"
        >Cancel</NuxtLink
      >
    </header>

    <p v-if="reviewNote" class="notice" role="note">
      <strong>Why it wasn’t approved:</strong> {{ reviewNote }} Fix it and send it again.
    </p>

    <div class="gen__cols">
      <section class="panel gen__build" aria-label="Build the NPC">
        <div class="field">
          <label for="sugg-system">System</label>
          <select
            id="sugg-system"
            class="input"
            :value="system"
            :disabled="loadingSource"
            @change="pickSystem"
          >
            <option v-for="s in SYSTEMS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </div>
        <div class="gen__note">
          <span class="gen__sys">{{ systemLabel(system) }}</span>
          <span class="muted">Fields follow {{ systemLabel(system) }} stat blocks.</span>
        </div>
        <div class="field">
          <label for="sugg-note"
            >Note for the moderators <span class="muted">(optional)</span></label
          >
          <textarea
            id="sugg-note"
            v-model="note"
            class="input"
            rows="2"
            maxlength="1000"
            placeholder="Where it comes from, what it’s good for, anything to check"
          />
        </div>
        <div v-if="loadingSource" class="spinner" role="status" aria-label="Loading the NPC" />
        <NpcManualForm
          v-else
          v-model="form"
          v-model:image="image"
          :system="system"
          :busy="saving"
          :save-label="editId ? 'Send again' : 'Send for review'"
          hide-notes
          @save="submit"
        />
      </section>

      <section class="gen__preview" aria-label="Preview">
        <div class="gen__label">Live preview</div>
        <NpcStatBlock
          :name="form.name"
          :system="system"
          :level="form.level"
          :block="preview"
          :image-path="image"
          source="homebrew"
        />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gen__cols {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}

.gen__build {
  flex: 1 1 380px;
  min-width: 0;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;

  .field {
    margin: 0;
  }
}

.gen__note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  font-size: 13px;
}

.gen__sys {
  padding: 2px 8px;
  border-radius: var(--radius-control);
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 700;
  white-space: nowrap;
}

.gen__preview {
  flex: 1 1 400px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 16px;
}

.gen__label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--page-muted);
}

@media (max-width: 900px) {
  .gen__preview {
    position: static;
  }
}
</style>
