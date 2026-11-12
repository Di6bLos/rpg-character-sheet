<script setup lang="ts">
// Party tab: shared initiative strip, roster and chat. In the console the GM
// also gets the add-combatants dialog and table management (invites, session, players).
import type { Combatant } from '~/types'
import { plural } from '~/utils/format'
import { combatantName, groupLabels } from '~/utils/initiative'

const snackbar = useSnackbarStore()
const { mode, campaign, campaignId, isGm, gmControls, roster, reloadRoster } = useCampaignBoard()

const init = useInitiative(campaignId, isGm)

const turnCharacterId = computed(
  () => init.order.value.find((c) => c.id === init.activeId.value)?.character_id ?? null,
)

// Roster HP and conditions change on the players' sheets; refresh with the turn.
watch(init.activeId, () => void reloadRoster())

// --- Add combatants (GM) --------------------------------------------------------
const addOpen = ref(false)
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
  roster.value.filter(
    (r) => r.character_id && !init.rows.value.some((c) => c.character_id === r.character_id),
  ),
)

async function addParty() {
  adding.value = true
  try {
    const n = await init.addParty(roster.value)
    if (n) snackbar.show(`${plural(n, 'character')} added to initiative`)
    addOpen.value = false
  } catch (err) {
    snackbar.error(err, 'Could not add the party')
  } finally {
    adding.value = false
  }
}

async function addCustom() {
  const d = draft.value
  const name = d.name.trim()
  if (!name) return
  adding.value = true
  try {
    const count = Math.min(20, Math.max(1, d.count))
    const labels = count === 1 ? [null] : groupLabels(count)
    await init.insert(
      labels.map((label) => ({
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
    addOpen.value = false
  } catch (err) {
    snackbar.error(err, 'Could not add the combatant')
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="party">
    <BoardInitiative :init="init" :roster="roster" :gm="gmControls" @add="addOpen = true" />

    <div class="party__cols">
      <BoardRoster
        v-if="campaign"
        class="party__roster"
        :roster="roster"
        :system="campaign.system"
        :turn-character-id="turnCharacterId"
      />
      <BoardChat class="party__chat" :roster="roster" />
    </div>

    <BoardTableAdmin v-if="mode === 'console'" />

    <UiDialog v-model="addOpen" title="Add to initiative" width="540px">
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
          <NuxtLink :to="`/campaigns/${campaignId}/gm/npcs`" @click="addOpen = false">NPCs</NuxtLink
          >.
        </p>
        <form class="stack" @submit.prevent="addCustom">
          <div class="add-grid add-grid--top">
            <div class="field">
              <label for="cb-name">Name</label>
              <input
                id="cb-name"
                v-model="draft.name"
                class="input"
                maxlength="76"
                placeholder="Bandit"
                required
              />
            </div>
            <div class="field">
              <label for="cb-count">How many</label>
              <input
                id="cb-count"
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
              <label for="cb-kind">Kind</label>
              <select id="cb-kind" v-model="draft.kind" class="input">
                <option value="monster">Monster</option>
                <option value="npc">NPC</option>
                <option value="pc">PC</option>
              </select>
            </div>
            <div class="field">
              <label for="cb-init">Initiative</label>
              <input id="cb-init" v-model.number="draft.initiative" class="input" type="number" />
            </div>
            <div class="field">
              <label for="cb-mod">Init. modifier</label>
              <input id="cb-mod" v-model.number="draft.init_mod" class="input" type="number" />
            </div>
            <div class="field">
              <label for="cb-hp">Hit points</label>
              <input id="cb-hp" v-model.number="draft.hp" class="input" type="number" min="0" />
            </div>
            <div class="field">
              <label for="cb-ac">Armor</label>
              <input id="cb-ac" v-model.number="draft.ac" class="input" type="number" />
            </div>
          </div>
          <p v-if="draft.count > 1 && draft.name.trim()" class="small muted">
            Adds {{ draft.name.trim() }} A to {{ draft.name.trim() }}
            {{ String.fromCharCode(64 + Math.min(20, draft.count)) }}.
          </p>
          <div class="row" style="justify-content: flex-end">
            <button type="button" class="btn btn--ghost" @click="addOpen = false">Cancel</button>
            <button type="submit" class="btn" :disabled="adding || !draft.name.trim()">
              {{ draft.count > 1 ? `Add ${Math.min(20, draft.count)}` : 'Add combatant' }}
            </button>
          </div>
        </form>
      </div>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.party {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.party__cols {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}

.party__roster {
  flex: 999 1 560px;
}

.party__chat {
  flex: 1 1 380px;
  min-width: 0;
}

.add-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 12px;

  &--top {
    grid-template-columns: 1fr 110px;
  }
}
</style>
