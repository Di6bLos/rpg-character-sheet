<script setup lang="ts">
// The linked stat block's sections (traits, actions, bloodied, last stand…) and GM notes.
// An entry with dice in its text gets a Roll button: the first dice expression rolls
// (thrown in the dice tray), posts its total (no dice) to party chat as an action line
// under the creature's name, and shows the dice and total in a result bar pinned to the bottom of the panel, like
// the player's result bar under their actions. In a Nimble campaign an attack follows
// the attack rules (`monsterRollKind`): a 1 on the Primary Die misses, its max crits and
// explodes (Core p. 12); minions and flunkies miss on a 1 but never crit (GM's Guide p. 24).
import type { CampaignNpc, StatEntry } from '~/types'
import { findDice, rollDice, rollNimble, showOutcome } from '~/utils/dice'
import { monsterRollKind } from '~/utils/monsterAttack'

const props = defineProps<{ npc: CampaignNpc; name: string }>()

const chat = useBoardChat()
const system = useBattleSystem()
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

async function roll(it: StatEntry, key: string, section: string) {
  const found = diceOf(it)
  if (!found) return
  const kind =
    system.value === 'nimble' ? monsterRollKind(section, it, props.npc.stat_block) : 'plain'
  if (kind !== 'plain') return rollAttack(it, key, found, kind === 'nocrit')
  const { total, rolls } = rollDice(found.dice)
  const mod = found.dice.mod ? ` ${found.dice.mod > 0 ? '+' : '−'} ${Math.abs(found.dice.mod)}` : ''
  const detail = rolls.length > 1 || mod ? `${rolls.join(' + ')}${mod} = ` : ''
  const text = `${found.text}: ${detail}${total}`
  last.value = { key, text: `${props.name} · ${it.n || 'Roll'}: ${text}` }
  // The party sees only what it came to; the dice stay in the GM's bar.
  await chat.send(`${props.name} · ${it.n || 'Roll'}: ${total}`, 'party', 'action')
}

/** A Nimble monster attack: Miss on a 1, an exploding crit on the max (unless `noCrit`). */
async function rollAttack(
  it: StatEntry,
  key: string,
  found: NonNullable<ReturnType<typeof findDice>>,
  noCrit: boolean,
) {
  const r = rollNimble(found.dice, null, Math.random, 0, { noCrit })
  const label = it.n || 'Attack'
  const result = r.miss ? 'Miss' : r.crit ? `Crit! ${r.total}` : String(r.total)
  const dice = r.dice.join(' + ')
  const mod = found.dice.mod ? ` ${found.dice.mod > 0 ? '+' : '−'} ${Math.abs(found.dice.mod)}` : ''
  const detail = r.miss ? `rolled a 1` : `${dice}${mod}${r.crit ? ' + crit dice' : ''} = ${r.total}`
  last.value = { key, text: `${props.name} · ${label}: ${found.text}: ${result} (${detail})` }
  showOutcome({
    label,
    total: r.miss ? null : r.total,
    detail: `${props.name} · ${label}: ${result}`,
  })
  await chat.send(`${props.name} · ${label}: ${result}`, 'party', 'action')
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
          @click="roll(it, `${si}-${i}`, sec.title)"
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
