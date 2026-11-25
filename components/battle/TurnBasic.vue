<script setup lang="ts">
// The player's turn line on the battle board for systems without the Nimble turn steps
// (D&D 5e, Pathfinder 2e): "Your turn", "<name> is acting" or "Not in combat", with the
// round while the encounter runs. While the GM has seated the hero without an Initiative
// ("–" on the strip: before the first turn or mid-encounter) it reads "Roll your
// initiative", with a Roll initiative button that rolls d20 + the hero's Init, shows the
// total with the Init in the dice tray and sends it to the tracker (`sendInitiative`); the
// button goes once the row has a number. Rolled before the GM's first Next turn it reads
// "Waiting for the GM to start" (the strip already marks its first token, so it never
// says whose turn it is yet). A failed write reads "Initiative not sent", keeps the rolled
// total and offers to resend it, as the Nimble turn bar does. With Manual dice on (account
// menu, `profiles.own_dice`) a field takes the player's own total instead.
// Compact (the phone's turn slot): inset 8px from the sides and the tab bar below.
import type { useInitiative } from '~/composables/useInitiative'
import { sendInitiative } from '~/composables/useSendInitiative'
import { quietly, rollDie, showDice, showOutcome, sign } from '~/utils/dice'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  characterId: string
  compact?: boolean
}>()

const { campaignId, roster } = useCampaignBoard()
const { touch } = useBoardLayout()
const auth = useAuthStore()
/** Manual dice: the player types the total they rolled. */
const ownDice = computed(() => auth.profile?.own_dice ?? false)

/** The hero's row on the tracker, if the GM has seated them. */
const row = computed(() =>
  props.init.rows.value.find((r) => r.kind === 'pc' && r.character_id === props.characterId),
)
const acting = computed(() => props.init.order.value.find((c) => c.id === props.init.turnId.value))
const mine = computed(() => !!acting.value && acting.value.character_id === props.characterId)
const canRoll = computed(() => !!row.value && row.value.initiative_rolled === false)
const round = computed(() => (props.init.turnId.value ? `Round ${props.init.round.value}` : ''))

const busy = ref(false)
/** "Initiative 17. Sent to the GM's initiative tracker." after a roll. */
const result = ref('')
/** A total the tracker didn't get; Resend sends it again instead of rolling anew. */
const unsent = ref<number | null>(null)
/**
 * The turn line. A total the tracker didn't get comes first (as the Resend button says);
 * then an unrolled row (seated before the first turn, or mid-encounter), then before the
 * GM's first Next turn, then whose turn it is.
 */
const headline = computed(() => {
  if (row.value && unsent.value !== null) return 'Initiative not sent'
  if (canRoll.value) return 'Roll your initiative'
  if (!acting.value) return row.value ? 'Waiting for the GM to start' : 'Not in combat'
  return mine.value ? 'Your turn' : `${acting.value.name} is acting`
})
function clear() {
  result.value = ''
  unsent.value = null
}
// A new hero (Playing as), a new or removed tracker row (the GM removed and re-added the
// hero), or a fresh wait for Initiative starts with no result.
watch([() => props.characterId, () => row.value?.id], () => clear())
watch(canRoll, (now, before) => {
  if (now && !before) clear()
})

/**
 * The turn line takes focus for a roll, so focus doesn't drop to the page when the button
 * goes: the dice tray (a modal dialog) hands focus back to what had it when it opened.
 */
const who = ref<HTMLElement | null>(null)

async function send(total: number) {
  if (busy.value) return
  busy.value = true
  try {
    const { note, failed } = await sendInitiative(campaignId.value, props.characterId, total)
    result.value = `Initiative ${total}.${note}`
    unsent.value = failed ? total : null
    if (!failed) await props.init.reload()
  } catch {
    result.value = `Initiative ${total}. Could not update the initiative tracker.`
    unsent.value = total
  } finally {
    busy.value = false
  }
  await nextTick()
  // No tray (animation off, own dice): the button may have gone with focus on it.
  if (!canRoll.value && (!document.activeElement || document.activeElement === document.body))
    who.value?.focus()
}

function roll() {
  if (unsent.value !== null) return send(unsent.value)
  who.value?.focus()
  const mod = roster.value.find((r) => r.character_id === props.characterId)?.summary?.initMod ?? 0
  const d20 = quietly(() => rollDie(20))
  const total = d20 + mod
  showDice({
    sides: 20,
    dice: [d20],
    dropped: [],
    primary: -1,
    explosions: [],
    extra: null,
    mod,
    total,
    miss: false,
    crit: false,
    odds: 0,
  })
  showOutcome({
    label: 'Initiative',
    total,
    detail: `Initiative ${total} (d20 ${d20} ${sign(mod)}).`,
  })
  return send(total)
}

/** The total typed with Manual dice on (it already has the hero's Init in it). */
function typed(values: number[]) {
  const total = values[0]
  if (total === undefined) return
  who.value?.focus()
  return send(total)
}

const sub = computed(() => [round.value, result.value].filter(Boolean).join(' · '))
</script>

<template>
  <section
    class="panel tb"
    :class="{ 'tb--now': mine, 'tb--touch': touch, 'tb--compact': compact }"
    aria-label="Your turn"
    data-track-area="Turn"
  >
    <div ref="who" class="tb__who" role="status" tabindex="-1">
      <strong class="tb__title">{{ headline }}</strong>
      <span v-if="sub" class="tb__sub">{{ sub }}</span>
    </div>
    <NimbleDiceEntry
      v-if="canRoll && ownDice && unsent === null"
      class="tb__entry"
      label="Your Initiative total"
      action="Set"
      signed
      :disabled="busy"
      @submit="typed"
    />
    <button
      v-else-if="canRoll"
      type="button"
      class="btn btn--sm"
      :disabled="busy"
      :title="
        unsent !== null
          ? 'The initiative tracker didn\'t get your total: sends the same one again'
          : undefined
      "
      @click="roll"
    >
      {{ unsent !== null ? 'Resend initiative' : 'Roll initiative' }}
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
  // Wide enough that the typed-total field wraps under the headline on a phone.
  min-width: 140px;

  &:focus {
    outline: none;
  }
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

// The phone: clear of the screen edges and the tab bar, so its corners show.
.tb--compact {
  margin: 0 8px 8px;
}

// The typed total takes its own row on a narrow turn line.
.tb__entry {
  flex: 1 1 220px;
}

.tb--touch .btn,
.tb--touch :deep(.btn) {
  min-height: 44px;
  padding: 0 16px;
}

.tb--touch :deep(.input) {
  min-height: 44px;
}
</style>
