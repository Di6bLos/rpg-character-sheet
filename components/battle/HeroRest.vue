<script setup lang="ts">
// The hero column's rests: Field rest (catch breath or make camp, spending Hit Dice)
// and Safe rest, each confirmed in a small dialog. Same rules as the sheet's Vitals.
import type { NimbleSheet } from '~/types/sheets'

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const {
  diceLeft,
  camp,
  restDice,
  canFieldRest,
  ownRestRolls,
  fieldRestTitle,
  adjustRestDice,
  rest,
  takeSafeRest,
} = useNimbleVitals()

const fieldOpen = ref(false)
const safeOpen = ref(false)

/** `rolls`: the Hit Dice the player rolled, with Manual dice. */
function fieldRest(rolls?: number[]) {
  rest(rolls)
  fieldOpen.value = false
}

function safeRest() {
  takeSafeRest()
  safeOpen.value = false
}
</script>

<template>
  <div class="rest">
    <span class="sect">Rest</span>
    <div class="rest__btns">
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="fieldOpen = true"
      >
        Field rest
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="safeOpen = true"
      >
        Safe rest
      </button>
    </div>

    <UiDialog v-model="fieldOpen" title="Field rest" width="420px">
      <div class="stack" style="gap: 12px">
        <p class="small">
          Hit Dice left: <strong>{{ diceLeft }} / {{ sheet.hitDice }} d{{ sheet.hitDie }}</strong> ·
          HP {{ sheet.hp }} / {{ sheet.hpMax }}
        </p>
        <UiSwitch v-model="camp" label="Made camp (8h, food & sleep)" :disabled="!canEdit" />
        <NimbleDiceEntry
          v-if="ownRestRolls"
          :label="`Hit Dice rolled, e.g. ${Math.ceil(sheet.hitDie / 2)}, ${sheet.hitDie}`"
          action="Catch Breath"
          :disabled="!canFieldRest"
          @submit="fieldRest"
        />
        <div v-else class="row" style="gap: 8px">
          <span class="small">Hit Dice to spend</span>
          <button
            type="button"
            class="step step--xs"
            aria-label="Spend one fewer Hit Die"
            :disabled="!canFieldRest || restDice <= 1"
            @click="adjustRestDice(-1)"
          >
            −
          </button>
          <strong aria-live="polite">{{ restDice }}</strong>
          <button
            type="button"
            class="step step--xs"
            aria-label="Spend one more Hit Die"
            :disabled="!canFieldRest || restDice >= diceLeft"
            @click="adjustRestDice(1)"
          >
            +
          </button>
        </div>
        <p class="small muted">{{ fieldRestTitle }}</p>
      </div>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="fieldOpen = false">Not yet</button>
        <button
          v-if="!ownRestRolls"
          type="button"
          class="btn"
          :disabled="!canFieldRest"
          @click="fieldRest()"
        >
          {{ camp ? 'Make Camp' : 'Catch Breath' }}
        </button>
      </template>
    </UiDialog>

    <UiDialog v-model="safeOpen" title="Take a Safe Rest?" width="460px">
      <p>
        HP, Hit Dice, mana and limited uses are restored, 1 Wound is healed, and temp HP and class
        dice are cleared.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="safeOpen = false">Not yet</button>
        <button type="button" class="btn" @click="safeRest">Safe Rest</button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
// One row: the label, then the two buttons.
.rest {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rest__btns {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
</style>
