<script setup lang="ts">
// The player's turn line on the battle board for systems without the Nimble turn steps
// (D&D 5e, Pathfinder 2e): "Your turn", "<name> is acting" or "Not in combat" ("Waiting
// for your turn" while seated before the GM starts), with the round while the encounter
// runs. While the GM has seated the hero without an Initiative ("–" on the strip) a Roll
// initiative button rolls d20 + the hero's Init and sends it to the tracker
// (`sendInitiative`); the button goes once the row has a number.
import type { useInitiative } from '~/composables/useInitiative'
import { sendInitiative } from '~/composables/useSendInitiative'
import { rollDie } from '~/utils/dice'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  characterId: string
}>()

const { campaignId, roster } = useCampaignBoard()
const { touch } = useBoardLayout()

/** The hero's row on the tracker, if the GM has seated them. */
const row = computed(() =>
  props.init.rows.value.find((r) => r.kind === 'pc' && r.character_id === props.characterId),
)
const acting = computed(() => props.init.order.value.find((c) => c.id === props.init.turnId.value))
const mine = computed(() => !!acting.value && acting.value.character_id === props.characterId)
const headline = computed(() => {
  // Seated before the GM's first Next turn: the Nimble turn bar's wording.
  if (!acting.value) return row.value ? 'Waiting for your turn' : 'Not in combat'
  return mine.value ? 'Your turn' : `${acting.value.name} is acting`
})
const round = computed(() => (props.init.turnId.value ? `Round ${props.init.round.value}` : ''))
const canRoll = computed(() => !!row.value && row.value.initiative_rolled === false)

const busy = ref(false)
/** "Initiative 17. Sent to the GM's initiative tracker." after a roll. */
const result = ref('')
// A new hero (Playing as) starts with no result.
watch(
  () => props.characterId,
  () => (result.value = ''),
)

async function roll() {
  if (busy.value) return
  busy.value = true
  try {
    const mod = roster.value.find((r) => r.character_id === props.characterId)?.summary?.initMod
    const total = rollDie(20) + (mod ?? 0)
    const { note } = await sendInitiative(campaignId.value, props.characterId, total)
    result.value = `Initiative ${total}.${note}`
    await props.init.reload()
  } finally {
    busy.value = false
  }
}

const sub = computed(() => [round.value, result.value].filter(Boolean).join(' · '))
</script>

<template>
  <section
    class="panel tb"
    :class="{ 'tb--now': mine, 'tb--touch': touch }"
    aria-label="Your turn"
    data-track-area="Turn"
  >
    <div class="tb__who">
      <strong class="tb__title" role="status">{{ headline }}</strong>
      <span v-if="sub" class="tb__sub">{{ sub }}</span>
    </div>
    <button v-if="canRoll" type="button" class="btn btn--sm" :disabled="busy" @click="roll">
      Roll initiative
    </button>
  </section>
</template>

<style scoped lang="scss">
.tb {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 8px 12px;

  // Laid over the panel background (Cursed's is a gradient), as on the Nimble turn bar.
  &--now {
    border-color: var(--accent);
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent),
      var(--panel-bg);
  }
}

.tb__who {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 0;
  min-width: 80px;
}

.tb__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-heading);
  font-size: 15px;
}

.tb__sub {
  font-size: 12px;
  color: var(--page-muted);
}

.tb--touch .btn {
  min-height: 44px;
  padding: 0 16px;
}
</style>
