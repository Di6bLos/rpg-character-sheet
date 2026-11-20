<script setup lang="ts">
// The GM's "Add to initiative" dialog: seat the party characters not in the order yet,
// or add custom combatants (one, or a lettered group continuing after any of the same
// name). Index creatures with stat blocks are added from the console's NPCs page.
// Opened from the Party tab's Initiative panel and the battle board's GM turn bar.
import type { Combatant, RosterEntry } from '~/types'
import type { useInitiative } from '~/composables/useInitiative'
import { plural } from '~/utils/format'
import { combatantName, groupLabels } from '~/utils/initiative'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
}>()
const open = defineModel<boolean>({ required: true })

const snackbar = useSnackbarStore()
const { mode, campaignId } = useCampaignBoard()
const uid = useId()

const adding = ref(false)
const blank = () => ({
  name: '',
  count: 1,
  kind: 'monster' as Combatant['kind'],
  initiative: 10,
  init_mod: 0,
  hp: 10,
  ac: 12,
})
const draft = ref(blank())

const partyMissing = computed(() =>
  props.roster.filter(
    (r) => r.character_id && !props.init.rows.value.some((c) => c.character_id === r.character_id),
  ),
)

async function addParty() {
  adding.value = true
  try {
    const n = await props.init.addParty(props.roster)
    if (n) snackbar.show(`${plural(n, 'character')} added to initiative`)
    open.value = false
  } catch (err) {
    snackbar.error(err, 'Could not add the party')
  } finally {
    adding.value = false
  }
}

/** Letters for the custom group, continuing after any of the same name already on the board. */
const customLabels = computed<(string | null)[]>(() => {
  const name = draft.value.name.trim()
  const count = Math.min(20, Math.max(1, draft.value.count || 1))
  if (!name) return []
  const existing = props.init.rows.value
    .filter((c) => !c.campaign_npc_id && !c.character_id)
    .filter((c) => c.name === combatantName(name, c.group_label))
    // A lone copy without a letter counts as A.
    .map((c) => c.group_label ?? 'A')
  return count === 1 && !existing.length ? [null] : groupLabels(count, existing)
})

async function addCustom() {
  const d = draft.value
  const name = d.name.trim()
  if (!name) return
  adding.value = true
  try {
    await props.init.insert(
      customLabels.value.map((label) => ({
        name: combatantName(name, label),
        group_label: label,
        kind: d.kind,
        initiative: d.initiative,
        init_mod: d.init_mod,
        hp: d.hp,
        hp_max: d.hp,
        ac: d.ac,
      })),
    )
    draft.value = blank()
    open.value = false
  } catch (err) {
    snackbar.error(err, 'Could not add the combatant')
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <UiDialog v-model="open" title="Add to initiative" width="540px">
    <div class="stack">
      <div v-if="partyMissing.length" class="row" style="justify-content: space-between">
        <span class="small"
          >{{ plural(partyMissing.length, 'party character') }} not in the order yet.</span
        >
        <button type="button" class="btn btn--ghost" :disabled="adding" @click="addParty">
          Add the party
        </button>
      </div>
      <p v-if="mode === 'console'" class="small muted">
        To add creatures from your index (with their portraits and a journal entry for the party),
        use
        <NuxtLink :to="`/campaigns/${campaignId}/gm/npcs`" @click="open = false">NPCs</NuxtLink>.
      </p>
      <form class="stack" @submit.prevent="addCustom">
        <div class="add-grid add-grid--top">
          <div class="field">
            <label :for="`${uid}-name`">Name</label>
            <input
              :id="`${uid}-name`"
              v-model="draft.name"
              class="input"
              maxlength="76"
              placeholder="Bandit"
              required
            />
          </div>
          <div class="field">
            <label :for="`${uid}-count`">How many</label>
            <input
              :id="`${uid}-count`"
              v-model.number="draft.count"
              class="input"
              type="number"
              min="1"
              max="20"
            />
          </div>
        </div>
        <div class="add-grid">
          <div class="field">
            <label :for="`${uid}-kind`">Kind</label>
            <select :id="`${uid}-kind`" v-model="draft.kind" class="input">
              <option value="monster">Monster</option>
              <option value="npc">NPC</option>
              <option value="pc">PC</option>
            </select>
          </div>
          <div class="field">
            <label :for="`${uid}-init`">Initiative</label>
            <input
              :id="`${uid}-init`"
              v-model.number="draft.initiative"
              class="input"
              type="number"
            />
          </div>
          <div class="field">
            <label :for="`${uid}-mod`">Init. modifier</label>
            <input :id="`${uid}-mod`" v-model.number="draft.init_mod" class="input" type="number" />
          </div>
          <div class="field">
            <label :for="`${uid}-hp`">Hit points</label>
            <input
              :id="`${uid}-hp`"
              v-model.number="draft.hp"
              class="input"
              type="number"
              min="0"
            />
          </div>
          <div class="field">
            <label :for="`${uid}-ac`">Armor</label>
            <input :id="`${uid}-ac`" v-model.number="draft.ac" class="input" type="number" />
          </div>
        </div>
        <p v-if="customLabels.length > 1 && customLabels[0]" class="small muted">
          Adds {{ draft.name.trim() }} {{ customLabels[0] }} to {{ draft.name.trim() }}
          {{ customLabels[customLabels.length - 1] }}.
        </p>
        <div class="row" style="justify-content: flex-end">
          <button type="button" class="btn btn--ghost" @click="open = false">Cancel</button>
          <button type="submit" class="btn" :disabled="adding || !draft.name.trim()">
            {{ draft.count > 1 ? `Add ${Math.min(20, draft.count)}` : 'Add combatant' }}
          </button>
        </div>
      </form>
    </div>
  </UiDialog>
</template>

<style scoped lang="scss">
.add-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 12px;

  &--top {
    grid-template-columns: 1fr 110px;
  }
}
</style>
