<script setup lang="ts">
// Manual stat block builder, system-aware. The parent owns the form (v-model)
// and shows the live preview beside it.
import type { GameSystem } from '~/types'
import { CREATURE_TYPES } from '~/utils/creatureTypes'
import { LEVEL_LABEL, STAT_KEYS, TOP_FIELDS, type NpcForm } from '~/utils/npcStatBlock'

const form = defineModel<NpcForm>({ required: true })
const image = defineModel<string | null>('image', { default: null })

const props = defineProps<{
  system: GameSystem
  busy?: boolean
  saveLabel?: string
  /** Pool entries (Admin → NPCs) have no GM notes. */
  hideNotes?: boolean
}>()
const emit = defineEmits<{ save: [] }>()

const snackbar = useSnackbarStore()
const npcs = useNpcStore()
const uploading = ref(false)
const id = useId()

const stats = computed(() => STAT_KEYS[props.system])
const fields = computed(() => TOP_FIELDS[props.system])

async function onImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploading.value = true
  try {
    image.value = await npcs.uploadImage(file)
  } catch (err) {
    snackbar.error(err, 'Could not upload the image')
  } finally {
    uploading.value = false
  }
}

function addLine() {
  form.value.lines.push(['', ''])
}
function addItem(si: number) {
  form.value.sections[si]!.items.push({ n: '', t: '' })
}
</script>

<template>
  <form class="mf" aria-label="Manual stat block" @submit.prevent="emit('save')">
    <div role="radiogroup" aria-label="Kind" class="seg">
      <button
        type="button"
        role="radio"
        :aria-checked="form.kind === 'monster'"
        @click="form.kind = 'monster'"
      >
        Monster
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="form.kind === 'humanoid'"
        @click="form.kind = 'humanoid'"
      >
        Humanoid
      </button>
    </div>

    <div class="mf__grid">
      <div class="field mf__wide">
        <label :for="`${id}-name`">Name</label>
        <input :id="`${id}-name`" v-model="form.name" class="input" maxlength="80" required />
      </div>
      <div class="field">
        <label :for="`${id}-lvl`">{{ LEVEL_LABEL[system] }}</label>
        <input
          :id="`${id}-lvl`"
          v-model="form.level"
          class="input"
          maxlength="20"
          placeholder="1"
        />
      </div>
      <div class="field">
        <label :for="`${id}-ctype`">Creature type</label>
        <select :id="`${id}-ctype`" v-model="form.creatureType" class="input">
          <option value="">Not set</option>
          <option v-for="t in CREATURE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>
      <div class="field">
        <label :for="`${id}-type`">Type</label>
        <input
          :id="`${id}-type`"
          v-model="form.type"
          class="input"
          maxlength="60"
          placeholder="Skeleton archer"
        />
      </div>
      <div class="field">
        <label :for="`${id}-size`">Size</label>
        <input
          :id="`${id}-size`"
          v-model="form.size"
          class="input"
          maxlength="30"
          placeholder="Medium"
        />
      </div>
      <div v-if="system === 'dnd5e'" class="field">
        <label :for="`${id}-align`">Alignment</label>
        <input :id="`${id}-align`" v-model="form.alignment" class="input" maxlength="40" />
      </div>
      <div v-for="f in fields" :key="f.label" class="field">
        <label :for="`${id}-${f.label}`">{{ f.label }}</label>
        <input
          :id="`${id}-${f.label}`"
          v-model="form.top[f.label]"
          class="input"
          maxlength="120"
          :placeholder="f.hint"
        />
      </div>
    </div>

    <fieldset v-if="stats.length" class="mf__box">
      <legend>{{ system === 'dnd5e' ? 'Ability scores' : 'Attribute modifiers' }}</legend>
      <div class="mf__stats">
        <label v-for="k in stats" :key="k">
          <span>{{ k }}</span>
          <input v-model="form.stats[k]" class="input" maxlength="6" :aria-label="k" />
        </label>
      </div>
    </fieldset>

    <fieldset class="mf__box">
      <legend>Senses, languages, defenses</legend>
      <div v-for="(line, i) in form.lines" :key="i" class="mf__line">
        <input
          v-model="line[0]"
          class="input"
          maxlength="40"
          placeholder="Senses"
          :aria-label="`Line ${i + 1} label`"
        />
        <input
          v-model="line[1]"
          class="input"
          maxlength="300"
          placeholder="darkvision 60 ft."
          :aria-label="`Line ${i + 1} text`"
        />
        <button
          type="button"
          class="mf__x"
          :aria-label="`Remove line ${i + 1}`"
          @click="form.lines.splice(i, 1)"
        >
          ×
        </button>
      </div>
      <button type="button" class="btn-dashed mf__add" @click="addLine">Add a line</button>
    </fieldset>

    <fieldset v-for="(sec, si) in form.sections" :key="sec.title" class="mf__box">
      <legend>{{ sec.title }}</legend>
      <div v-for="(it, ii) in sec.items" :key="ii" class="mf__item">
        <div class="mf__item-head">
          <input
            v-model="it.n"
            class="input"
            maxlength="80"
            placeholder="Name"
            :aria-label="`${sec.title} ${ii + 1} name`"
          />
          <button
            type="button"
            class="mf__x"
            :aria-label="`Remove ${it.n || `${sec.title} ${ii + 1}`}`"
            @click="sec.items.splice(ii, 1)"
          >
            ×
          </button>
        </div>
        <textarea
          v-model="it.t"
          class="input"
          rows="3"
          maxlength="2000"
          placeholder="What it does"
          :aria-label="`${sec.title} ${ii + 1} text`"
        />
      </div>
      <button type="button" class="btn-dashed mf__add" @click="addItem(si)">
        Add {{ sec.title.toLowerCase().replace(/s$/, '') }}
      </button>
    </fieldset>

    <div class="mf__image">
      <img v-if="image" :src="npcImageUrl(image) ?? ''" alt="" />
      <label class="btn btn--ghost btn--sm mf__file" :class="{ 'is-busy': uploading }">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="onImage" />
        {{ uploading ? 'Uploading…' : image ? 'Change image' : 'Add an image' }}
      </label>
      <button v-if="image" type="button" class="btn btn--quiet btn--sm" @click="image = null">
        Remove image
      </button>
      <span class="small muted">Shown in initiative and the party journal. Use your own art.</span>
    </div>

    <div v-if="!hideNotes" class="field">
      <label :for="`${id}-notes`">GM notes (never shown to players)</label>
      <textarea
        :id="`${id}-notes`"
        v-model="form.gmNotes"
        class="input"
        rows="2"
        maxlength="2000"
      />
    </div>

    <button
      type="submit"
      class="btn btn--block mf__save"
      :disabled="busy || uploading || !form.name.trim()"
    >
      {{ busy ? 'Saving…' : (saveLabel ?? 'Save to index') }}
    </button>
  </form>
</template>

<style scoped lang="scss">
.mf {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.seg {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);
  background: var(--field);

  button {
    flex: 1;
    min-height: 38px;
    border: 0;
    border-radius: min(var(--radius-control), 7px);
    background: transparent;
    color: var(--page-soft);
    font-weight: 600;

    &[aria-checked='true'] {
      background: var(--accent);
      color: var(--on-accent);
    }
  }
}

.mf__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.mf__wide {
  grid-column: 1 / -1;
}

.mf__box {
  margin: 0;
  padding: 10px 12px 12px;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-control), 10px);
  display: flex;
  flex-direction: column;
  gap: 8px;

  legend {
    padding: 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.mf__stats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;

  label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    font-weight: 700;
  }

  .input {
    text-align: center;
    padding: 0 4px;
  }
}

.mf__line {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 2fr 40px;
  gap: 6px;
}

.mf__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--line);
}

.mf__item-head {
  display: flex;
  gap: 6px;

  .input {
    flex: 1;
    min-width: 0;
    font-weight: 600;
  }
}

.mf__x {
  flex: 0 0 40px;
  min-height: 40px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);
  background: transparent;
  color: var(--page-muted);
  font-size: 18px;
}

.mf__add {
  align-self: flex-start;
}

.mf__image {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;

  img {
    width: 64px;
    height: 64px;
    border-radius: min(var(--radius-control), 10px);
    object-fit: cover;
  }
}

.mf__file {
  position: relative;

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}

.is-busy {
  opacity: 0.7;
  pointer-events: none;
}

.mf__save {
  min-height: 48px;
  font-family: var(--font-heading);
  font-size: 17px;
}

@media (max-width: 480px) {
  .mf__stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
