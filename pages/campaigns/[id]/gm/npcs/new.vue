<script setup lang="ts">
// GM console → NPCs → Generator: build a stat block by hand (live preview) or
// with the AI assistant. ?edit=<id> edits a campaign NPC; ?dup=<id> or
// ?dup=pool:<id> starts from a copy; ?kind=humanoid preselects the kind.
import { supabase } from '~/lib/supabase'
import type { NpcKind, PoolNpc } from '~/types'
import { blankNpcForm, fromStatBlock, toStatBlock, type NpcForm } from '~/utils/npcStatBlock'
import { systemLabel } from '~/utils/systems'

const route = useRoute()
const snackbar = useSnackbarStore()
const site = useSiteStore()
const npcs = useNpcStore()
const { campaign, campaignId } = useCampaignBoard()

const system = computed(() => campaign.value?.system ?? 'nimble')
const mode = ref<'manual' | 'ai'>(route.query.mode === 'ai' ? 'ai' : 'manual')
const editId = ref<string | null>(typeof route.query.edit === 'string' ? route.query.edit : null)
const kind: NpcKind = route.query.kind === 'humanoid' ? 'humanoid' : 'monster'

const form = ref<NpcForm>(blankNpcForm(system.value, kind))
const image = ref<string | null>(null)
const aiGenerated = ref(false)
const saving = ref(false)
const loadingSource = ref(false)

const preview = computed(() => toStatBlock(form.value, system.value))

onMounted(async () => {
  const edit = editId.value
  const dup = typeof route.query.dup === 'string' ? route.query.dup : null
  const needSource = !!edit || (!!dup && !dup.startsWith('pool:'))
  if (!edit && !dup) {
    // Saving reads the cached index; make sure it belongs to this campaign.
    if (npcs.campaignId !== campaignId.value)
      await npcs.fetchCampaign(campaignId.value).catch(() => undefined)
    return
  }
  loadingSource.value = true
  try {
    if (needSource && npcs.campaignId !== campaignId.value)
      await npcs.fetchCampaign(campaignId.value)
    if (dup?.startsWith('pool:')) {
      const { data, error } = await supabase
        .from('npcs')
        .select('*')
        .eq('id', dup.slice(5))
        .single()
      if (error) throw error
      const p = data as PoolNpc
      form.value = fromStatBlock(p.stat_block, system.value, {
        name: `${p.name} (copy)`,
        kind: p.kind,
        level: p.level,
      })
      image.value = p.image_path
      return
    }
    const src = npcs.campaignNpcs.find((n) => n.id === (edit ?? dup))
    if (!src) throw new Error('That NPC is not in this campaign')
    form.value = fromStatBlock(src.stat_block, system.value, {
      name: edit ? src.name : `${src.name} (copy)`,
      kind: src.kind,
      level: src.level,
      gmNotes: src.gm_notes,
    })
    image.value = src.image_path
    aiGenerated.value = !!edit && src.ai_generated
  } catch (err) {
    snackbar.error(err, 'Could not open that NPC')
    editId.value = null
  } finally {
    loadingSource.value = false
  }
})

async function save() {
  if (!form.value.name.trim() || loadingSource.value) return
  saving.value = true
  try {
    const { saved, published } = await npcs.save(
      campaignId.value,
      {
        system: system.value,
        kind: form.value.kind,
        name: form.value.name.trim(),
        level: form.value.level.trim(),
        stat_block: preview.value,
        image_path: image.value,
        gm_notes: form.value.gmNotes.trim(),
        ai_generated: aiGenerated.value,
      },
      editId.value,
    )
    if (!published)
      snackbar.show(
        `${saved.name} saved to your index, but it could not be shared to the pool`,
        'error',
      )
    else
      snackbar.show(
        editId.value
          ? `${saved.name} saved`
          : site.settings.npc_pool_enabled
            ? `${saved.name} saved to your index and the shared pool`
            : `${saved.name} saved to your index`,
      )
    await navigateTo({
      path: `/campaigns/${campaignId.value}/gm/npcs`,
      query: { kind: saved.kind === 'humanoid' ? 'humanoid' : undefined, id: saved.id },
    })
  } catch (err) {
    snackbar.error(err, 'Could not save the NPC')
  } finally {
    saving.value = false
  }
}

// --- AI draft -----------------------------------------------------------------------
const assumptions = ref<string[]>([])
const checks = ref<string[]>([])
function onDraft(draft: { form: NpcForm; assumptions: string[]; checks: string[] }) {
  form.value = draft.form
  assumptions.value = draft.assumptions
  checks.value = draft.checks
  aiGenerated.value = true
}
function editDraft() {
  mode.value = 'manual'
}
const hasAiDraft = computed(() => aiGenerated.value && !!form.value.name && mode.value === 'ai')

const note = computed(() =>
  mode.value === 'manual'
    ? `Fields follow ${systemLabel(system.value)} stat blocks.`
    : `Drafts in ${systemLabel(system.value)}, converted from any system you upload.`,
)
</script>

<template>
  <div class="gen">
    <NpcTabs current="new" />

    <div class="gen__cols">
      <section class="panel gen__build" aria-labelledby="gen-h">
        <div class="gen__head">
          <h2 id="gen-h">{{ editId ? `Edit ${form.name || 'NPC'}` : 'New NPC' }}</h2>
          <NuxtLink :to="`/campaigns/${campaignId}/gm/npcs`" class="btn btn--ghost btn--sm"
            >Cancel</NuxtLink
          >
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
          :save-label="editId ? 'Save changes' : 'Save to index'"
          @save="save"
        />
        <NpcAiForm v-else :system="system" :kind="form.kind" @draft="onDraft" />
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
          :ai-generated="aiGenerated"
          :gm-notes="form.gmNotes"
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
              Save to index
            </button>
            <button type="button" class="btn btn--ghost" @click="editDraft">Edit manually</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gen {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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

.gen__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 22px;
  }
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

    &[aria-selected='true'] {
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
