<script setup lang="ts">
// Admin → NPCs → Generator: build a pool NPC by hand (live preview) or with the
// AI assistant, in any system, as Official or Homebrew. ?edit=<poolId> edits an
// existing pool entry.
import type { GameSystem, NpcSource } from '~/types'
import { blankNpcForm, fromStatBlock, toStatBlock, type NpcForm } from '~/utils/npcStatBlock'
import { SYSTEMS, systemLabel } from '~/utils/systems'

definePageMeta({
  layout: 'admin',
  middleware: 'staff',
  // The source NPC is read once on mount; remount when ?edit changes.
  key: (route) => route.fullPath,
})
useHead({ title: 'NPC generator · Lantern admin' })

const route = useRoute()
const snackbar = useSnackbarStore()
const site = useSiteStore()
const npcs = useNpcStore()

const editId = ref<string | null>(typeof route.query.edit === 'string' ? route.query.edit : null)
const system = ref<GameSystem>('nimble')
const source = ref<NpcSource>('official')
const mode = ref<'manual' | 'ai'>('manual')

const form = ref<NpcForm>(blankNpcForm(system.value))
const image = ref<string | null>(null)
const aiGenerated = ref(false)
const saving = ref(false)
const loadingSource = ref(false)

const preview = computed(() => toStatBlock(form.value, system.value))
/** What the AI assistant assumed and the GM's Guide checks of its last draft. */
const assumptions = ref<string[]>([])
const checks = ref<string[]>([])

onMounted(async () => {
  void site.fetch().catch(() => undefined)
  if (!editId.value) return
  loadingSource.value = true
  try {
    const p = await npcs.getPool(editId.value)
    system.value = p.system
    source.value = p.source
    form.value = fromStatBlock(p.stat_block, p.system, {
      name: p.name,
      kind: p.kind,
      level: p.level,
    })
    image.value = p.image_path
    aiGenerated.value = p.ai_generated
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
  aiGenerated.value = false
  assumptions.value = []
  checks.value = []
}

async function save() {
  if (!form.value.name.trim() || loadingSource.value) return
  saving.value = true
  try {
    const saved = await npcs.savePool(
      {
        system: system.value,
        kind: form.value.kind,
        name: form.value.name.trim(),
        level: form.value.level.trim(),
        stat_block: preview.value,
        image_path: image.value,
        source: source.value,
        ai_generated: aiGenerated.value,
      },
      editId.value,
    )
    snackbar.show(
      `${saved.name} ${editId.value ? 'saved' : `added to the pool as ${saved.source === 'official' ? 'Official' : 'Homebrew'}`}`,
    )
    await navigateTo('/admin/npcs')
  } catch (err) {
    snackbar.error(err, 'Could not save the NPC')
  } finally {
    saving.value = false
  }
}

// --- AI draft -----------------------------------------------------------------------
function onDraft(draft: { form: NpcForm; assumptions: string[]; checks: string[] }) {
  form.value = draft.form
  assumptions.value = draft.assumptions
  checks.value = draft.checks
  aiGenerated.value = true
}
const hasAiDraft = computed(() => aiGenerated.value && !!form.value.name && mode.value === 'ai')

const note = computed(() =>
  mode.value === 'manual'
    ? `Fields follow ${systemLabel(system.value)} stat blocks.`
    : `Drafts in ${systemLabel(system.value)} with your own AI key, converted from any system you upload.`,
)
</script>

<template>
  <div class="page" style="max-width: 1320px; gap: 20px">
    <header class="page-head">
      <div>
        <h1>{{ editId ? `Edit ${form.name || 'NPC'}` : 'New NPC' }}</h1>
        <p>Saved straight to the shared pool, whatever the pool switches say.</p>
      </div>
      <NuxtLink to="/admin/npcs" class="btn btn--ghost">Back to NPCs</NuxtLink>
    </header>

    <div class="gen__cols">
      <section class="panel gen__build" aria-label="Build the NPC">
        <div class="gen__meta">
          <div class="field">
            <label for="gen-system">System</label>
            <select
              id="gen-system"
              class="input"
              :value="system"
              :disabled="!!editId || loadingSource"
              @change="pickSystem"
            >
              <option v-for="s in SYSTEMS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </div>
          <div class="field">
            <span id="gen-source" class="field__label">Source</span>
            <div role="radiogroup" aria-labelledby="gen-source" class="seg">
              <button
                v-for="s in ['official', 'homebrew'] as const"
                :key="s"
                type="button"
                role="radio"
                :aria-checked="source === s"
                @click="source = s"
              >
                {{ s === 'official' ? 'Official' : 'Homebrew' }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="!editId" role="tablist" aria-label="How to build it" class="seg">
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'manual'"
            @click="mode = 'manual'"
          >
            Manual
          </button>
          <button
            v-if="site.settings.ai_enabled"
            type="button"
            role="tab"
            :aria-selected="mode === 'ai'"
            @click="mode = 'ai'"
          >
            AI assistant
          </button>
        </div>
        <div class="gen__note">
          <span class="gen__sys">{{ systemLabel(system) }}</span>
          <span class="muted">{{ note }}</span>
        </div>
        <div v-if="loadingSource" class="spinner" role="status" aria-label="Loading the NPC" />
        <NpcManualForm
          v-else-if="mode === 'manual'"
          v-model="form"
          v-model:image="image"
          :system="system"
          :busy="saving || loadingSource"
          :save-label="editId ? 'Save changes' : 'Save to pool'"
          hide-notes
          @save="save"
        />
        <NpcAiForm v-else :key="system" :system="system" :kind="form.kind" @draft="onDraft" />
      </section>

      <section class="gen__preview" aria-label="Preview">
        <div class="gen__label">{{ hasAiDraft ? 'AI draft' : 'Live preview' }}</div>
        <NpcStatBlock
          v-if="form.name || mode === 'manual'"
          :name="form.name"
          :system="system"
          :level="form.level"
          :block="preview"
          :image-path="image"
          :source="source"
          :ai-generated="aiGenerated"
        />
        <div v-else class="gen__empty">
          Describe a creature or upload a stat block, then press Generate.<br />
          The draft appears here for you to check, edit and save.
        </div>
        <div v-if="hasAiDraft" class="panel gen__assumed">
          <div class="gen__label">What the assistant assumed</div>
          <ul v-if="assumptions.length">
            <li v-for="(a, i) in assumptions" :key="i">{{ a }}</li>
          </ul>
          <template v-if="system === 'nimble'">
            <div class="gen__label">Checked against the GM’s Guide</div>
            <ul v-if="checks.length" class="gen__checks">
              <li v-for="(c, i) in checks" :key="i">{{ c }}</li>
            </ul>
            <p v-else class="small muted">HP and damage are within the guide’s range.</p>
          </template>
          <div class="row" style="gap: 8px">
            <button type="button" class="btn" :disabled="saving || loadingSource" @click="save">
              Save to pool
            </button>
            <button type="button" class="btn btn--ghost" @click="mode = 'manual'">
              Edit manually
            </button>
          </div>
        </div>
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
}

.gen__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
  gap: 12px;

  .field {
    margin: 0;
  }
}

.field__label {
  font-size: 14px;
  font-weight: 600;
}

.seg {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);

  button {
    flex: 1;
    min-height: 42px;
    border: 0;
    border-radius: min(var(--radius-control), 7px);
    background: transparent;
    color: var(--page-soft);
    font-size: 15px;
    font-weight: 600;

    &[aria-selected='true'],
    &[aria-checked='true'] {
      background: var(--accent);
      color: var(--on-accent);
    }
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

.gen__empty {
  padding: 40px 24px;
  border-radius: var(--radius-panel);
  border: 1.5px dashed var(--line-strong);
  text-align: center;
  color: var(--page-muted);
  line-height: 1.5;
}

.gen__assumed {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
    line-height: 1.45;
  }

  p {
    margin: 0;
  }
}

.gen__checks li::marker {
  color: var(--warn-text);
}

@media (max-width: 900px) {
  .gen__preview {
    position: static;
  }
}
</style>
