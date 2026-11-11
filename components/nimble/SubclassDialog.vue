<script setup lang="ts">
// Replace a Nimble hero's subclass mid-campaign, e.g. an Oathsworn who breaks
// their oath becomes an Oathbreaker (story subclasses, with GM approval).
import { classBySlug } from '~/data/nimble/classes'
import type { NimbleSheet } from '~/types/sheets'
import {
  changeSubclass,
  keyStatValue,
  subclassChangeChoices,
  subclassReplayLevel,
  validatePicks,
  type Picks,
} from '~/utils/nimbleBuild'

const open = defineModel<boolean>({ required: true })
const { draft, save } = useSheet<NimbleSheet>()
const snackbar = useSnackbarStore()

const pick = ref('')
const picks = ref<Picks>({})
const showErrors = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  pick.value = ''
  picks.value = {}
  showErrors.value = false
})
watch(pick, () => (picks.value = {}))

const sheet = computed(() => draft.value.sheet)
const cls = computed(() => classBySlug(sheet.value.classSlug))
const keyValue = computed(() => keyStatValue(sheet.value))
const options = computed(() =>
  (cls.value?.subclasses ?? []).filter((s) => s.slug !== sheet.value.subclassSlug),
)
/** Heroes with level history are rebuilt from the subclass level, undoing hand edits since. */
const replayFrom = computed(() => subclassReplayLevel(sheet.value, draft.value.level))
const preview = computed(() =>
  pick.value
    ? subclassChangeChoices(sheet.value, draft.value.level, pick.value, picks.value)
    : null,
)
const problems = computed(() =>
  (preview.value?.choices ?? []).map((c) => validatePicks(c, picks.value[c.key])).filter(Boolean),
)

async function confirm() {
  showErrors.value = true
  if (!pick.value || problems.value.length) return
  changeSubclass(sheet.value, draft.value.level, pick.value, picks.value)
  open.value = false
  await save()
  snackbar.show(`${draft.value.name} is now ${sheet.value.subclass}`)
}
</script>

<template>
  <UiDialog v-model="open" title="Change subclass" width="720px">
    <p class="small muted">
      Story subclasses are taken at pivotal moments, with your GM’s approval. The new subclass
      replaces {{ sheet.subclass || 'your current one' }}: its abilities are removed and the new
      one’s features up to level {{ draft.level }} are added.
    </p>
    <div v-if="replayFrom !== null" class="notice">
      <strong>Hand edits made since reaching level {{ replayFrom }} will be lost</strong>
      Your hero is rebuilt from level {{ replayFrom }} with the same hit points, stat increases and
      class picks. Changes you made by hand since then, such as attacks, armor, skills and spells,
      go back to what the levels grant.
    </div>
    <div class="subs" role="group" aria-label="Subclasses">
      <button
        v-for="s in options"
        :key="s.slug"
        type="button"
        class="sub"
        :aria-pressed="pick === s.slug"
        @click="pick = s.slug"
      >
        <strong>{{ s.name }}</strong>
        <span class="sub__tag">— {{ s.tagline }} —</span>
        <span v-if="s.story" class="small muted">Story subclass</span>
      </button>
    </div>

    <template v-if="preview">
      <ul v-if="preview.spells.learn.length || preview.spells.lose.length" class="spell-changes">
        <li v-for="s in preview.spells.learn" :key="`+${s}`">
          Learns the spell <strong>{{ s }}</strong>
        </li>
        <li v-for="s in preview.spells.lose" :key="`-${s}`">
          Can no longer cast <strong>{{ s }}</strong>
        </li>
      </ul>
      <div class="gains">
        <div v-for="a in preview.abilities" :key="a.ability.name" class="gain">
          <strong>{{ a.ability.name }}</strong>
          <p><NimbleRulesText :text="a.ability.desc" :key-value="keyValue" /></p>
        </div>
      </div>
      <NimbleChoicePicker
        v-for="c in preview.choices"
        :key="c.key"
        v-model="picks[c.key]"
        :choice="c"
        :show-errors="showErrors"
        :key-value="keyValue"
      />
    </template>

    <template #actions>
      <button type="button" class="btn btn--ghost" @click="open = false">Cancel</button>
      <button type="button" class="btn" :disabled="!pick" @click="confirm">
        Become {{ options.find((s) => s.slug === pick)?.name ?? '…' }}
      </button>
    </template>
  </UiDialog>
</template>

<style scoped lang="scss">
.subs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
  gap: 10px;
}

.sub {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: 12px 14px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  color: var(--page-text);
  border: 1px solid var(--line);

  &[aria-pressed='true'] {
    border: 1.5px solid var(--accent);
    background: var(--accent-tint);
  }
}

.sub__tag {
  font-size: 13px;
  font-style: italic;
  color: var(--page-soft);
}

.spell-changes {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  color: var(--page-soft);
}

.gains {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gain {
  padding: 10px 12px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  border-left: 3px solid var(--accent);

  p {
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
  }
}
</style>
