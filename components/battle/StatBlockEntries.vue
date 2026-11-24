<script setup lang="ts">
// The linked stat block's sections (traits, actions, bloodied, last stand…) and GM notes.
// An entry with dice in its text gets a Roll button: the first dice expression rolls
// (thrown in the dice tray), posts to party chat as an action line under the
// creature's name, and shows in a result bar pinned to the bottom of the panel, like
// the player's result bar under their actions.
import type { CampaignNpc, StatEntry } from '~/types'
import { findDice, rollDice } from '~/utils/dice'

const props = defineProps<{ npc: CampaignNpc; name: string }>()

const chat = useBoardChat()
// On touch the Roll buttons are 44px targets, 8px apart.
const { touch } = useBoardLayout()
const last = ref<{ key: string; text: string } | null>(null)
// A new creature starts with no result showing.
watch(
  () => [props.npc.id, props.name],
  () => (last.value = null),
)

const sections = computed(() => (props.npc.stat_block.sections ?? []).filter((s) => s.items.length))

function diceOf(it: StatEntry) {
  return findDice(it.t) ?? findDice(it.n)
}

async function roll(it: StatEntry, key: string) {
  const found = diceOf(it)
  if (!found) return
  const { total, rolls } = rollDice(found.dice)
  const mod = found.dice.mod ? ` ${found.dice.mod > 0 ? '+' : '−'} ${Math.abs(found.dice.mod)}` : ''
  const detail = rolls.length > 1 || mod ? `${rolls.join(' + ')}${mod} = ` : ''
  const text = `${found.text}: ${detail}${total}`
  last.value = { key, text: `${props.name} · ${it.n || 'Roll'}: ${text}` }
  await chat.send(`${props.name} · ${it.n || 'Roll'} ${text}`, 'party', 'action')
}
</script>

<template>
  <div class="sbe" :class="{ 'sbe--touch': touch }">
    <section v-for="(sec, si) in sections" :key="`${sec.title}-${si}`" class="sbe__sec">
      <h3 class="sbe__title">{{ sec.title }}</h3>
      <p v-for="(it, i) in sec.items" :key="`${it.n}-${i}`" class="sbe__entry">
        <b v-if="it.n">{{ it.n }}.</b> {{ it.t }}
        <button
          v-if="diceOf(it)"
          type="button"
          class="btn btn--sm sbe__roll"
          :aria-label="`Roll ${it.n || 'it'}: ${diceOf(it)?.text}`"
          :class="{ 'is-last': last?.key === `${si}-${i}` }"
          @click="roll(it, `${si}-${i}`)"
        >
          Roll {{ diceOf(it)?.text }}
        </button>
      </p>
    </section>
    <section v-if="npc.gm_notes" class="sbe__sec">
      <h3 class="sbe__title">Notes</h3>
      <p class="sbe__entry sbe__notes">{{ npc.gm_notes }}</p>
    </section>
    <p v-if="last" class="sbe__bar" role="status">
      <span class="sbe__last">{{ last.text }}</span>
      <span class="sbe__posted">Posted to party chat</span>
    </p>
  </div>
</template>

<style scoped lang="scss">
.sbe {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sbe__sec {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sbe__title {
  margin: 0;
  font-size: 11px !important;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.sbe__entry {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--page-soft);

  b {
    color: var(--page-text);
  }
}

.sbe__roll {
  min-height: 26px;
  margin-left: 4px;
  padding: 0 10px;
  font-size: 12px;
}

.sbe__roll.is-last {
  box-shadow: 0 0 0 2px var(--accent);
}

// Pinned to the bottom of the scrolling column, so the result stays in view.
.sbe__bar {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin: 4px 0 0;
  padding: 8px 12px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--ok-bg);
  color: var(--ok-text);
  font-size: 12px;
  box-shadow: 0 -6px 12px -6px rgba(0, 0, 0, 0.35);
}

.sbe__last {
  min-width: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.sbe__posted {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.85;
}

.sbe__notes {
  white-space: pre-line;
}

// --- Touch -----------------------------------------------------------------------------
.sbe--touch {
  .sbe__sec {
    gap: 8px;
  }

  .sbe__roll {
    min-height: 44px;
    margin: 4px 0 4px 8px;
    padding: 0 14px;
    font-size: 13px;
  }
}
</style>
