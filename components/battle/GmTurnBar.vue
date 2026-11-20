<script setup lang="ts">
// The GM's turn bar on the battle board (top of the centre column): who is acting and
// who is next, "+ Add creatures" (the add dialog), a menu with Add the party, Sync
// summons and Reroll NPC initiative, and Next turn. It also drops summons that left
// their hero's sheet as the roster refreshes (as the Party tab's Initiative panel does).
import type { RosterEntry } from '~/types'
import type { useInitiative } from '~/composables/useInitiative'
import { plural } from '~/utils/format'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
}>()

const snackbar = useSnackbarStore()
const board = useCampaignBoard()

const order = computed(() => props.init.order.value)
const acting = computed(() => order.value.find((c) => c.id === props.init.turnId.value))

const title = computed(() => {
  if (!order.value.length) return 'No encounter running'
  if (acting.value) return `${acting.value.name} is acting`
  return `${order.value[0]?.name ?? 'Nobody'} is up first`
})

const upNext = computed(() => {
  const list = order.value
  if (!list.length) return 'Add creatures and the party, then press Next turn.'
  if (!acting.value) return `Round ${props.init.round.value} · Next turn starts the encounter`
  const at = list.findIndex((c) => c.id === acting.value?.id)
  const next = [1, 2]
    .map((k) => list[(at + k) % list.length])
    .filter((c, i, all) => !!c && c.id !== acting.value?.id && all.indexOf(c) === i)
    .map((c) => c?.name)
  return `Round ${props.init.round.value}${next.length ? ` · Up next: ${next.join(', then ')}` : ''}`
})

watch(
  () => props.roster,
  (roster) => void props.init.pruneSummons(roster),
)

// --- Add, and the menu ------------------------------------------------------------------
const addOpen = ref(false)
const menuOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)
const menuBtn = ref<HTMLButtonElement | null>(null)
const menuId = useId()
const busy = ref(false)

const partyMissing = computed(
  () =>
    props.roster.filter(
      (r) =>
        r.character_id && !props.init.rows.value.some((c) => c.character_id === r.character_id),
    ).length,
)

function closeMenu(refocus = false) {
  if (!menuOpen.value) return
  menuOpen.value = false
  if (refocus) menuBtn.value?.focus()
}
function onDocClick(event: MouseEvent) {
  if (menuEl.value && !menuEl.value.contains(event.target as Node)) closeMenu()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

async function run(job: () => Promise<void>) {
  closeMenu()
  busy.value = true
  try {
    await job()
  } finally {
    busy.value = false
  }
}

const addParty = () =>
  run(async () => {
    try {
      const n = await props.init.addParty(props.roster)
      snackbar.show(n ? `${plural(n, 'character')} added to initiative` : 'The party is seated')
    } catch (err) {
      snackbar.error(err, 'Could not add the party')
    }
  })

const syncSummons = () =>
  run(async () => {
    try {
      await board.reloadRoster()
      const result = await props.init.syncSummons(board.roster.value)
      if (!result) return
      const parts: string[] = []
      if (result.added) parts.push(`${plural(result.added, 'summon')} added`)
      if (result.removed)
        parts.push(
          result.added
            ? `${result.removed} removed`
            : `${plural(result.removed, 'summon')} removed`,
        )
      snackbar.show(parts.length ? parts.join(', ') : 'Summons are up to date')
    } catch (err) {
      snackbar.error(err, 'Could not sync the summons')
    }
  })

const reroll = () => run(() => props.init.rollForNpcs())
</script>

<template>
  <section class="panel gtb" aria-label="Turn">
    <div class="gtb__who">
      <strong class="gtb__title" role="status" :title="title">{{ title }}</strong>
      <span class="gtb__sub" :title="upNext">{{ upNext }}</span>
    </div>
    <div class="gtb__tools">
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        aria-label="Add creatures"
        @click="addOpen = true"
      >
        + Add<span class="gtb__long"> creatures</span>
      </button>
      <div ref="menuEl" class="gtb__more" @keydown.esc="closeMenu(true)">
        <button
          ref="menuBtn"
          type="button"
          class="btn btn--ghost btn--sm gtb__more-btn"
          aria-haspopup="true"
          :aria-expanded="menuOpen"
          :aria-controls="menuId"
          aria-label="More encounter tools"
          @click="menuOpen = !menuOpen"
        >
          ⋯
        </button>
        <div v-if="menuOpen" :id="menuId" class="gtb__menu panel">
          <button
            type="button"
            class="gtb__item"
            :disabled="busy || !partyMissing"
            @click="addParty"
          >
            Add the party
            <small>{{
              partyMissing ? `${plural(partyMissing, 'hero')} not seated` : 'Everyone is seated'
            }}</small>
          </button>
          <button
            type="button"
            class="gtb__item"
            :disabled="busy || !order.length"
            @click="syncSummons"
          >
            Sync summons
            <small>Seat the heroes' summons, drop dismissed ones</small>
          </button>
          <button type="button" class="gtb__item" :disabled="busy || !order.length" @click="reroll">
            Reroll NPC initiative
            <small>Every monster and NPC rolls again</small>
          </button>
        </div>
      </div>
      <button type="button" class="btn btn--sm" :disabled="!order.length" @click="init.nextTurn">
        Next turn ▸
      </button>
    </div>
    <BoardAddCombatants v-model="addOpen" :init="init" :roster="roster" />
  </section>
</template>

<style scoped lang="scss">
.gtb {
  container: gtb / inline-size;
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 8px 12px;
}

// Takes what the tools leave, so the bar stays on one row at 1200px; long lines
// truncate (the full text is in their title).
.gtb__who {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 100px;
  flex: 1 1 0;
}

.gtb__title,
.gtb__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gtb__title {
  font-family: var(--font-heading);
  font-size: 15px;
}

.gtb__sub {
  font-size: 12px;
  color: var(--page-muted);
}

// A narrow bar (1200–1280px windows) says just "+ Add", so the headline keeps its room.
@container gtb (max-width: 480px) {
  .gtb__long {
    display: none;
  }
}

.gtb__tools {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.gtb__more {
  position: relative;
}

.gtb__more-btn {
  padding: 0 10px;
  font-size: 18px;
  line-height: 1;
}

.gtb__menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  right: 0;
  width: 260px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gtb__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--page-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;

  small {
    font-size: 11px;
    font-weight: 400;
    color: var(--page-muted);
  }

  &:hover:not(:disabled) {
    background: var(--accent-tint);
  }

  &:disabled {
    opacity: 0.5;
  }
}
</style>
