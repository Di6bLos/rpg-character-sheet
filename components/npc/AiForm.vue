<script setup lang="ts">
// AI stat block assistant: describe a creature and/or upload art or another
// system's stat block; the generate-npc Edge Function drafts it in the
// given system with the user's own provider key (a GM for a campaign, or staff
// for the shared pool when no campaign is passed).
import { supabase } from '~/lib/supabase'
import type { AiProvider, GameSystem, NpcKind, StatBlock } from '~/types'
import { functionError, providerLabel } from '~/stores/aiKeys'
import { fromStatBlock, type NpcForm } from '~/utils/npcStatBlock'
import {
  budgetLines,
  budgetSummary,
  checkNimbleDraft,
  defaultLevel,
  levelOptions,
  nimbleBudget,
  usesPartyLevel,
  type Threat,
} from '~/utils/npcBudget'

const props = withDefaults(
  defineProps<{
    system: GameSystem
    kind: NpcKind
    /** The campaign the draft is for; staff leave it out to draft for the shared pool. */
    campaignId?: string | null
    /** Average level of the party's characters (1 without a party). */
    partyLevel?: number
  }>(),
  { campaignId: null, partyLevel: 1 },
)
const emit = defineEmits<{
  draft: [{ form: NpcForm; assumptions: string[]; checks: string[] }]
}>()

const keys = useAiKeysStore()
const snackbar = useSnackbarStore()

const MAX_TOTAL = 8 * 1024 * 1024
const ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,.md,.txt'

const desc = ref('')
const files = ref<File[]>([])
const source = ref<'auto' | GameSystem | 'other'>('auto')
const threat = ref<Threat>('Standard')
/** With an upload: keep the stat block's own level and threat instead of the picks below. */
const followBlock = ref(true)
const following = computed(() => followBlock.value && files.value.length > 0)
const kind = ref<NpcKind>(props.kind)
const provider = ref<AiProvider | null>(null)
const busy = ref(false)

// --- Level and the GM's Guide budget --------------------------------------------------
const partyLevel = computed(() => props.partyLevel)
const levels = computed(() => levelOptions(props.system, threat.value))
const byParty = computed(() => usesPartyLevel(props.system, threat.value))
const level = ref(defaultLevel(props.system, threat.value, partyLevel.value))
// Switching between monster levels and party levels: keep the pick if it still exists.
watch([levels, partyLevel], () => {
  if (!levels.value.includes(level.value))
    level.value = defaultLevel(props.system, threat.value, partyLevel.value)
})
const budget = computed(() =>
  props.system === 'nimble' ? nimbleBudget(threat.value, level.value) : null,
)
const error = ref('')

onMounted(async () => {
  try {
    await keys.fetch()
    provider.value = keys.defaultKey?.provider ?? null
  } catch (err) {
    snackbar.error(err, 'Could not read your AI providers')
  }
})

const canGo = computed(
  () => !!provider.value && (desc.value.trim().length > 0 || files.value.length > 0),
)

function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  const next = [...files.value, ...picked].slice(0, 4)
  const total = next.reduce((n, f) => n + f.size, 0)
  if (total > MAX_TOTAL) {
    snackbar.show('Uploads are limited to 8 MB in total', 'error')
    return
  }
  files.value = next
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

interface DraftResponse {
  npc: { name: string; kind: NpcKind; level: string; stat_block: StatBlock }
  assumptions: string[]
}

async function generate() {
  if (!canGo.value) return
  busy.value = true
  error.value = ''
  // The controls stay editable while it drafts; check the reply against what was asked.
  const follow = following.value
  const asked = follow ? null : budget.value
  try {
    const payloadFiles = await Promise.all(
      files.value.map(async (f) => ({
        name: f.name,
        type: f.type || (f.name.endsWith('.md') ? 'text/markdown' : 'text/plain'),
        data: await toBase64(f),
      })),
    )
    const { data, error: fnError } = await supabase.functions.invoke('generate-npc', {
      body: {
        campaignId: props.campaignId ?? undefined,
        provider: provider.value,
        system: props.system,
        kind: kind.value,
        threat: threat.value,
        level: level.value,
        partyLevel: byParty.value,
        budget: asked ? budgetLines(asked) : [],
        sourceSystem: source.value,
        followStatBlock: follow,
        description: desc.value.trim(),
        files: payloadFiles,
      },
    })
    if (fnError) throw new Error(await functionError(fnError))
    const res = data as DraftResponse
    emit('draft', {
      form: fromStatBlock(res.npc.stat_block, props.system, {
        name: res.npc.name,
        kind: res.npc.kind,
        level: res.npc.level,
      }),
      assumptions: res.assumptions ?? [],
      checks: asked ? checkNimbleDraft(res.npc.stat_block, asked) : [],
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'The assistant could not draft that'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="keys.loaded && !keys.keys.length" class="ai-none">
    <p>
      The AI assistant uses your own Claude, Gemini or ChatGPT API key. Add one in Settings and come
      back here.
    </p>
    <NuxtLink to="/settings#ai" class="btn">Add an API key</NuxtLink>
  </div>
  <form v-else class="ai" aria-label="AI stat block assistant" @submit.prevent="generate">
    <div class="field">
      <label for="ai-desc">Describe the creature or character</label>
      <textarea
        id="ai-desc"
        v-model="desc"
        class="input"
        rows="5"
        maxlength="4000"
        placeholder="e.g. A drowned knight in barnacled plate who drags victims under the waves"
      />
    </div>

    <label class="ai__drop">
      <input type="file" multiple :accept="ACCEPT" @change="onFiles" />
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
      </svg>
      <strong>Upload an image or a stat block</strong>
      <span class="small muted"
        >Art, a photo of a book page, or a PDF from another system (up to 4 files, 8 MB)</span
      >
    </label>
    <div v-if="files.length" class="chips">
      <span v-for="(f, i) in files" :key="f.name + i" class="filechip">
        {{ f.name }}
        <button type="button" :aria-label="`Remove ${f.name}`" @click="files.splice(i, 1)">
          ×
        </button>
      </span>
    </div>

    <div class="field">
      <label for="ai-src">Uploaded stat block is from</label>
      <select id="ai-src" v-model="source" class="input">
        <option value="auto">Detect automatically</option>
        <option value="nimble">Nimble</option>
        <option value="pf2e">Pathfinder 2e</option>
        <option value="dnd5e">5e</option>
        <option value="other">Another system</option>
      </select>
    </div>

    <UiSwitch
      v-if="files.length"
      v-model="followBlock"
      label="It's a stat block: keep its level and threat"
    />
    <p v-if="files.length" class="small muted ai__hint">
      {{
        followBlock
          ? 'An uploaded stat block keeps its own power level. Turn off to rebuild it at the threat and level you pick.'
          : 'An uploaded stat block is rebuilt at the threat and level below.'
      }}
    </p>

    <div v-if="!following" class="field">
      <span id="ai-threat" class="label">Threat</span>
      <div role="radiogroup" aria-labelledby="ai-threat" class="seg">
        <button
          v-for="t in ['Minion', 'Standard', 'Elite', 'Boss'] as const"
          :key="t"
          type="button"
          role="radio"
          :aria-checked="threat === t"
          @click="threat = t"
        >
          {{ t }}
        </button>
      </div>
    </div>
    <div v-if="!following" class="field">
      <label for="ai-level">{{
        byParty ? 'Party level' : system === 'dnd5e' ? 'Challenge rating' : 'Level'
      }}</label>
      <select id="ai-level" v-model="level" class="input" aria-describedby="ai-budget">
        <option v-for="l in levels" :key="l" :value="l">{{ l }}</option>
      </select>
      <p v-if="budget" id="ai-budget" class="small muted ai__budget">
        GM’s Guide targets: {{ budgetSummary(budget) }}
      </p>
    </div>
    <div class="field">
      <span id="ai-kind" class="label">Kind</span>
      <div role="radiogroup" aria-labelledby="ai-kind" class="seg">
        <button
          type="button"
          role="radio"
          :aria-checked="kind === 'monster'"
          @click="kind = 'monster'"
        >
          Monster
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="kind === 'humanoid'"
          @click="kind = 'humanoid'"
        >
          Humanoid
        </button>
      </div>
    </div>

    <div v-if="keys.keys.length > 1" class="field">
      <label for="ai-provider">Provider</label>
      <select id="ai-provider" v-model="provider" class="input">
        <option v-for="k in keys.keys" :key="k.provider" :value="k.provider">
          {{ providerLabel(k.provider) }} (key ending {{ k.last4 }})
        </option>
      </select>
    </div>

    <p v-if="error" class="ai__error" role="alert">{{ error }}</p>

    <button type="submit" class="btn btn--block ai__go" :disabled="busy || !canGo">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"
        />
      </svg>
      {{ busy ? 'Drafting a stat block…' : 'Generate' }}
    </button>
    <p v-if="provider" class="small muted ai__using">
      Using {{ providerLabel(provider) }} with your key. Check the draft before you save it.
    </p>
  </form>
</template>

<style scoped lang="scss">
.ai {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-none {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: min(var(--radius-control), 10px);
  border: 1px dashed var(--line-strong);

  p {
    margin: 0;
    line-height: 1.5;
  }
}

.ai__drop {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
  border-radius: min(var(--radius-control), 10px);
  border: 1.5px dashed var(--line-strong);
  text-align: center;
  cursor: pointer;

  svg {
    color: var(--accent-text);
  }

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}

.filechip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 10px;
  border-radius: var(--radius-control);
  background: var(--inset);
  border: 1px solid var(--line);
  font-size: 13px;

  button {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 0;
    background: transparent;
    color: var(--page-muted);
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
    min-height: 36px;
    border: 0;
    border-radius: min(var(--radius-control), 7px);
    background: transparent;
    color: var(--page-soft);
    font-size: 13px;
    font-weight: 600;

    &[aria-checked='true'] {
      background: var(--accent);
      color: var(--on-accent);
    }
  }
}

.ai__error {
  margin: 0;
  padding: 10px 12px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--danger-bg);
  color: var(--danger-text);
  font-size: 14px;
}

.ai__go {
  min-height: 48px;
  font-family: var(--font-heading);
  font-size: 17px;
}

.ai__budget {
  margin: 6px 0 0;
}

.ai__hint {
  margin: -8px 0 0;
}

.ai__using {
  margin: 0;
  text-align: center;
}
</style>
