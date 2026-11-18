<script setup lang="ts">
import { SELF_EFFECTS } from '~/data/nimble/effects'
import { portraitUrl } from '~/stores/character'
import type { NimbleSheet } from '~/types/sheets'
import { knownSpells, knownUtilitySpells } from '~/utils/nimbleBuild'

const MAX_BYTES = 5 * 1024 * 1024

const { draft, canEdit, saveNow } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const store = useCharacterStore()
const snackbar = useSnackbarStore()
const { effects, useEffect, stopEffect } = useNimbleActions()

const uploading = ref('')

const transforms = computed(() => {
  const spells = new Set(
    [...knownSpells(sheet.value), ...knownUtilitySpells(sheet.value)].map((s) => s.name),
  )
  const forms = effects.value.filter((e) => e.transform)
  const cast = SELF_EFFECTS.filter(
    (e) => e.transform && e.trigger === 'cast' && spells.has(e.source),
  )
  return [
    ...forms.map((e) => ({ ...e, shift: true })),
    ...cast.map((e) => ({
      ...e,
      shift: false,
      on: sheet.value.effects.some((x) => x.source === e.source),
      cost: undefined,
    })),
  ].map((e) => ({ ...e, image: portraitUrl(sheet.value.formPortraits[e.source]) }))
})

async function upload(source: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  if (!file || !canEdit.value) return
  if (!file.type.startsWith('image/')) return snackbar.show('Images only, please', 'error')
  if (file.size > MAX_BYTES) return snackbar.show('Images can be up to 5 MB', 'error')
  uploading.value = source
  const previous = sheet.value.formPortraits[source]
  let uploaded = ''
  try {
    uploaded = await store.uploadPortrait(draft.value.id, file)
    sheet.value.formPortraits = { ...sheet.value.formPortraits, [source]: uploaded }
    if (sheet.value.effects.some((e) => e.source === source))
      sheet.value.portraitOverride = uploaded
    await saveNow()
    if (previous && previous !== uploaded) await store.removePortrait(previous)
  } catch (err) {
    if (uploaded && sheet.value.formPortraits[source] === uploaded) {
      sheet.value.formPortraits = { ...sheet.value.formPortraits, [source]: previous ?? '' }
      if (sheet.value.portraitOverride === uploaded) sheet.value.portraitOverride = previous ?? ''
      await store.removePortrait(uploaded)
    }
    snackbar.error(err, 'Could not upload the image')
  } finally {
    uploading.value = ''
  }
}

async function removeImage(source: string) {
  const previous = sheet.value.formPortraits[source]
  if (!canEdit.value || !previous) return
  const rest = { ...sheet.value.formPortraits }
  delete rest[source]
  sheet.value.formPortraits = rest
  if (sheet.value.portraitOverride === previous) sheet.value.portraitOverride = ''
  await saveNow()
  await store.removePortrait(previous)
}
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="forms-h">
    <div class="title-help">
      <h2 id="forms-h">Transformations</h2>
      <UiHelp
        label="About transformations"
        text="While you're transformed, your portrait on the sheet, the party roster and the initiative strip shows the form's image. Upload one image per form; without one your usual portrait stays."
      />
    </div>
    <div class="forms">
      <article v-for="t in transforms" :key="t.source" class="tile form" :class="{ on: t.on }">
        <div class="form__img">
          <img v-if="t.image" :src="t.image" :alt="`${t.source} image`" />
          <span v-else aria-hidden="true">No image</span>
        </div>
        <div class="stack" style="gap: 4px; min-width: 0">
          <strong>{{ t.source }}</strong>
          <small>{{ t.until }}</small>
          <div class="row" style="gap: 6px; flex-wrap: wrap">
            <template v-if="t.shift">
              <button
                v-if="!t.on"
                type="button"
                class="btn btn--sm"
                :disabled="!canEdit || (!!t.cost && t.cost.left < 1)"
                @click="useEffect(t.source)"
              >
                Shift{{ t.cost ? ` · ${t.cost.left} left` : '' }}
              </button>
            </template>
            <button
              v-if="t.on"
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit"
              @click="stopEffect(t.source)"
            >
              End
            </button>
            <label v-if="canEdit" class="btn btn--quiet btn--sm form__upload">
              <input
                type="file"
                accept="image/*"
                :disabled="!!uploading"
                @change="upload(t.source, $event)"
              />
              {{ uploading === t.source ? 'Uploading…' : t.image ? 'Change image' : 'Add image' }}
            </label>
            <button
              v-if="canEdit && t.image"
              type="button"
              class="btn btn--quiet btn--sm"
              @click="removeImage(t.source)"
            >
              Remove image
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
.forms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 8px;
}

.form {
  flex-direction: row;
  gap: 12px;
  padding: 10px 12px;

  &.on {
    border-color: var(--accent);
  }

  small {
    font-size: 12px;
    color: var(--page-muted);
  }
}

.form__img {
  flex: 0 0 64px;
  height: 64px;
  border-radius: 8px;
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--page-muted);
  background: var(--inset);
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.form__upload {
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
