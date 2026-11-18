<script setup lang="ts">
import { beastsFor } from '~/data/nimble/beasts'
import { summonById, summonBySource } from '~/data/nimble/summons'
import type { NimbleSheet } from '~/types/sheets'
import { summonChoices } from '~/utils/nimbleBuild'
import { setSummonLook, summonBaseName, switchSummonOption } from '~/utils/nimbleSummons'

const MAX_BYTES = 5 * 1024 * 1024

const props = defineProps<{ lookKey: string }>()
const emit = defineEmits<{ switch: [lookKey: string] }>()

const { draft, canEdit, saveNow, say } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const store = useCharacterStore()
const snackbar = useSnackbarStore()

const id = useId()
const look = computed(() => sheet.value.summonLooks[props.lookKey] ?? {})
const base = computed(() => summonBaseName(sheet.value, props.lookKey))
const fallback = computed(
  () => summonById(props.lookKey)?.name ?? props.lookKey.replace(/^custom:/, ''),
)
const beasts = computed(() => beastsFor(props.lookKey))
const sizes = computed(
  () =>
    summonChoices(sheet.value).find((c) => summonBySource(c.held)?.id === props.lookKey) ?? null,
)

function switchTo(option: string) {
  const held = sizes.value?.held
  if (!canEdit.value || !held || held === option) return
  const message = switchSummonOption(sheet.value, held, option)
  if (!message) return
  say(message)
  const next = summonBySource(option)?.id
  if (next) emit('switch', next)
}
const name = ref(base.value)
const uploading = ref(false)

watch(base, (value) => (name.value = value))

function rename() {
  if (!canEdit.value || name.value.trim() === base.value) return
  name.value = setSummonLook(sheet.value, props.lookKey, { ...look.value, name: name.value })
}

function pickBeast(slug: string) {
  if (!canEdit.value) return
  name.value = setSummonLook(sheet.value, props.lookKey, {
    name: look.value.name,
    portrait: look.value.portrait,
    beast: look.value.beast === slug ? '' : slug,
  })
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  if (!file || !canEdit.value) return
  if (!file.type.startsWith('image/')) return snackbar.show('Images only, please', 'error')
  if (file.size > MAX_BYTES) return snackbar.show('Images can be up to 5 MB', 'error')
  uploading.value = true
  const previous = look.value.portrait
  let uploaded = ''
  try {
    uploaded = await store.uploadPortrait(draft.value.id, file)
    setSummonLook(sheet.value, props.lookKey, { ...look.value, portrait: uploaded })
    await saveNow()
    if (previous && previous !== uploaded) await store.removePortrait(previous)
  } catch (err) {
    if (uploaded && look.value.portrait === uploaded) {
      setSummonLook(sheet.value, props.lookKey, { ...look.value, portrait: previous })
      await store.removePortrait(uploaded)
    }
    snackbar.error(err, 'Could not upload the image')
  } finally {
    uploading.value = false
  }
}

async function removeImage() {
  const previous = look.value.portrait
  if (!canEdit.value || !previous) return
  setSummonLook(sheet.value, props.lookKey, { ...look.value, portrait: '' })
  await saveNow()
  await store.removePortrait(previous)
}
</script>

<template>
  <div class="look">
    <UiAvatar
      :name="base"
      :portrait-path="look.portrait ?? null"
      :beast="look.beast ?? null"
      :size="56"
    />
    <form class="look__name" @submit.prevent="rename">
      <label :for="id" class="caps">Name</label>
      <input
        :id="id"
        v-model="name"
        class="input"
        :placeholder="fallback"
        maxlength="60"
        :disabled="!canEdit"
        @blur="rename"
      />
    </form>
    <div v-if="canEdit" class="row" style="gap: 6px; flex-wrap: wrap">
      <label class="btn btn--quiet btn--sm look__upload">
        <input type="file" accept="image/*" :disabled="uploading" @change="upload" />
        {{ uploading ? 'Uploading…' : look.portrait ? 'Change image' : 'Add image' }}
      </label>
      <button
        v-if="look.portrait"
        type="button"
        class="btn btn--quiet btn--sm"
        @click="removeImage"
      >
        Remove image
      </button>
    </div>
    <div v-if="sizes" class="sizes" role="group" aria-label="Companion size">
      <button
        v-for="o in sizes.options"
        :key="o.name"
        type="button"
        class="btn btn--sm"
        :class="o.name === sizes.held ? '' : 'btn--ghost'"
        :aria-pressed="o.name === sizes.held"
        :disabled="!canEdit || draft.level < o.level"
        :title="draft.level < o.level ? `Unlocks at level ${o.level}` : undefined"
        @click="switchTo(o.name)"
      >
        {{ o.name.replace(/ Companion$/, '')
        }}<template v-if="draft.level < o.level"> · L{{ o.level }}</template>
      </button>
    </div>
    <div v-if="beasts.length" class="beasts" role="group" :aria-label="`${fallback} animal`">
      <button
        v-for="b in beasts"
        :key="b.slug"
        type="button"
        class="beast-pick"
        :aria-pressed="look.beast === b.slug"
        :disabled="!canEdit"
        @click="pickBeast(b.slug)"
      >
        <NimbleBeast :slug="b.slug" :size="40" />
        <span>{{ b.name }}</span>
      </button>
      <small class="credit">
        Icons by Lorc, Delapouite, Caro Asercion and Carl Olsen from
        <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>
        (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener"
          >CC BY 3.0</a
        >)
      </small>
    </div>
  </div>
</template>

<style scoped lang="scss">
.look {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 10px 0;
  border-top: 1px solid var(--track);
}

.look__name {
  flex: 1 1 180px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  .input {
    width: 100%;
  }
}

.sizes {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.beasts {
  flex: 1 1 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 6px;
}

.credit {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--page-muted);

  a {
    color: inherit;
  }
}

.beast-pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px 6px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--field);
  color: var(--page-soft);
  font-size: 11px;
  font-weight: 600;
  text-align: center;

  &[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, var(--field));
    color: var(--page-text);
  }
}

.look__upload {
  position: relative;
  cursor: pointer;

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}
</style>
