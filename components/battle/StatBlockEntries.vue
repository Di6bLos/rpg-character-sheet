<script setup lang="ts">
// The linked stat block's sections (traits, actions, bloodied, last stand…) and GM notes.
// An entry with dice in its text gets a Roll button: the first dice expression rolls
// and posts to party chat as an action line under the creature's name.
import type { CampaignNpc, StatEntry } from '~/types'
import { findDice, rollDice } from '~/utils/dice'

const props = defineProps<{ npc: CampaignNpc; name: string }>()

const chat = useBoardChat()
const last = ref<{ key: string; text: string } | null>(null)

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
  last.value = { key, text }
  await chat.send(`${props.name} · ${it.n || 'Roll'} ${text}`, 'party', 'action')
}
</script>

<template>
  <div class="sbe">
    <section v-for="(sec, si) in sections" :key="`${sec.title}-${si}`" class="sbe__sec">
      <h3 class="sbe__title">{{ sec.title }}</h3>
      <p v-for="(it, i) in sec.items" :key="`${it.n}-${i}`" class="sbe__entry">
        <b v-if="it.n">{{ it.n }}.</b> {{ it.t }}
        <button
          v-if="diceOf(it)"
          type="button"
          class="btn btn--sm sbe__roll"
          :aria-label="`Roll ${it.n || 'it'}: ${diceOf(it)?.text}`"
          @click="roll(it, `${si}-${i}`)"
        >
          Roll {{ diceOf(it)?.text }}
        </button>
        <span v-if="last?.key === `${si}-${i}`" class="sbe__result" role="status">{{
          last.text
        }}</span>
      </p>
    </section>
    <section v-if="npc.gm_notes" class="sbe__sec">
      <h3 class="sbe__title">Notes</h3>
      <p class="sbe__entry sbe__notes">{{ npc.gm_notes }}</p>
    </section>
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

.sbe__result {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
  font-variant-numeric: tabular-nums;
}

.sbe__notes {
  white-space: pre-line;
}
</style>
