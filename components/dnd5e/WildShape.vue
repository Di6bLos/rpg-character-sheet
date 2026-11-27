<script setup lang="ts">
// The 5e sheet's Wild Shape panel (SRD 5.2.1 p. 44): the Beast Shapes limits at the hero's level
// (known forms, highest CR, Fly Speed), the known forms with their AC, Speed and attacks, Take
// form / Leave form, and a form to add one by hand (the data has no stat blocks). In a form,
// its attacks join the Attacks panel and its AC and Speed the Vitals. Rules in
// utils/dnd5eWildShape.ts.
import type { Dnd5eBeastForm, Dnd5eSheet } from '~/types/sheets'
import { usesLeft } from '~/utils/dnd5ePlay'
import {
  activeForm,
  assumeForm,
  beastShapes,
  forgetForm,
  formWhy,
  leaveForm,
  learnForm,
  shapeWhy,
} from '~/utils/dnd5eWildShape'

const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim, resultIn } = useResultOwner()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const limits = computed(() => beastShapes(sheet.value, level.value))
const forms = computed(() => sheet.value.beastForms ?? [])
const current = computed(() => activeForm(sheet.value))
const why = computed(() => shapeWhy(sheet.value))

function run(line: string) {
  if (line) claim('ws:', () => say(line))
}

const CRS = ['0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '6']
const blank = (): Dnd5eBeastForm => ({
  name: '',
  cr: '1/4',
  ac: 12,
  speed: '40 ft',
  attacks: [{ name: 'Bite', bonus: 4, damage: '1d6+2', type: 'Piercing' }],
})
const draftForm = ref<Dnd5eBeastForm>(blank())
const adding = ref(false)
const draftWhy = computed(() =>
  draftForm.value.name.trim() ? formWhy(sheet.value, level.value, draftForm.value) : 'Name it',
)

function save() {
  if (!canEdit.value || draftWhy.value) return
  const f = { ...draftForm.value, name: draftForm.value.name.trim() }
  run(learnForm(sheet.value, level.value, f))
  if (sheet.value.beastForms?.some((x) => x.name === f.name)) {
    draftForm.value = blank()
    adding.value = false
  }
}
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="ws-h">
    <UiFold name="Wild Shape" />
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="ws-h">Wild Shape</h2>
        <UiHelp
          label="About Wild Shape"
          text="A Bonus Action and a use: you take a Beast form you know, with temporary HP equal to your Druid level (three times it with Circle Forms). Its stat block replaces your game statistics, but you keep your HP, Hit Dice, mental scores, features and proficiencies; you can't cast spells. It lasts half your Druid level in hours, until you use it again, are Incapacitated or die (SRD 5.2.1 p. 44). Type in each form's numbers from its stat block."
        />
      </div>
      <span class="badge badge--outline">{{ usesLeft(sheet, 'Wild Shape') }} uses left</span>
    </div>
    <p class="small muted" style="margin: 0">
      Known forms {{ forms.length }} / {{ limits.known }} · CR {{ limits.maxCrText }} or lower ·
      {{ limits.fly ? 'Fly Speed allowed' : 'no Fly Speed yet' }}
    </p>
    <div v-if="current" class="notice" role="status">
      You are a <strong>{{ current.name }}</strong
      >: AC {{ current.ac }}, {{ current.speed }}.
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="run(leaveForm(sheet, level))"
      >
        Leave form
      </button>
    </div>
    <div class="forms">
      <div v-for="f in forms" :key="f.name" class="tile form">
        <div class="form__head">
          <strong>{{ f.name }}</strong>
          <small class="muted"
            >CR {{ f.cr }} · AC {{ f.ac }} · {{ f.speed }}{{ f.fly ? ' · flies' : '' }}</small
          >
        </div>
        <ul class="small form__attacks">
          <li v-for="a in f.attacks" :key="a.name">
            {{ a.name }} {{ a.bonus >= 0 ? '+' : '' }}{{ a.bonus }} · {{ a.damage }} {{ a.type }}
          </li>
        </ul>
        <p v-if="formWhy(sheet, level, f)" class="small notice notice--error" style="margin: 0">
          {{ formWhy(sheet, level, f) }}
        </p>
        <div class="row" style="gap: 6px">
          <button
            type="button"
            class="btn btn--sm"
            :disabled="!canEdit || !!why || !!formWhy(sheet, level, f) || current?.name === f.name"
            @click="run(assumeForm(sheet, level, f.name))"
          >
            {{ current?.name === f.name ? 'In this form' : why || 'Take form' }}
          </button>
          <button
            type="button"
            class="btn btn--quiet btn--sm"
            :disabled="!canEdit"
            :aria-label="`Forget ${f.name}`"
            @click="forgetForm(sheet, f.name)"
          >
            Forget
          </button>
        </div>
      </div>
    </div>
    <p v-if="resultIn('ws:')" class="roll-status" role="status">{{ resultIn('ws:') }}</p>
    <details
      class="add"
      :open="adding"
      @toggle="adding = ($event.target as HTMLDetailsElement).open"
    >
      <summary class="small">Add a known form</summary>
      <form class="stack add__form" style="gap: 8px" @submit.prevent="save">
        <div class="add__row">
          <label class="field">
            <span class="small">Beast</span>
            <input v-model="draftForm.name" class="input input--sm" placeholder="Wolf" />
          </label>
          <label class="field">
            <span class="small">CR</span>
            <select v-model="draftForm.cr" class="input input--sm">
              <option v-for="c in CRS" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="field">
            <span class="small">AC</span>
            <input v-model.number="draftForm.ac" class="input input--sm" type="number" min="1" />
          </label>
          <label class="field field--wide">
            <span class="small">Speed</span>
            <input
              v-model="draftForm.speed"
              class="input input--sm"
              placeholder="40 ft, climb 30 ft"
            />
          </label>
          <label class="crit">
            <input v-model="draftForm.fly" type="checkbox" />
            Fly Speed
          </label>
        </div>
        <div v-for="(a, i) in draftForm.attacks" :key="i" class="add__row">
          <label class="field">
            <span class="small">Attack</span>
            <input v-model="a.name" class="input input--sm" />
          </label>
          <label class="field">
            <span class="small">To hit</span>
            <input v-model.number="a.bonus" class="input input--sm" type="number" />
          </label>
          <label class="field">
            <span class="small">Damage</span>
            <input v-model="a.damage" class="input input--sm" placeholder="1d6+2" />
          </label>
          <label class="field">
            <span class="small">Type</span>
            <input v-model="a.type" class="input input--sm" placeholder="Piercing" />
          </label>
        </div>
        <div class="row" style="gap: 6px; flex-wrap: wrap">
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            @click="draftForm.attacks.push({ name: '', bonus: 0, damage: '', type: '' })"
          >
            Another attack
          </button>
          <button type="submit" class="btn btn--sm" :disabled="!canEdit || !!draftWhy">
            {{ draftWhy || 'Learn this form' }}
          </button>
        </div>
      </form>
    </details>
  </section>
</template>

<style scoped lang="scss">
.forms {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 8px;
}

.form {
  gap: 6px;
  padding: 12px;
}

.form__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.form__attacks {
  margin: 0;
  padding-left: 18px;
}

.add summary {
  min-height: 32px;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--page-muted);
}

.add__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 90px;

  &--wide {
    width: 160px;
  }
}

.crit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  font-size: 13px;
}

@media (pointer: coarse) {
  .add summary,
  .crit {
    min-height: 44px;
  }
}
</style>
