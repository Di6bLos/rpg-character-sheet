<script setup lang="ts">
// The player's hero on the battle board for systems without the sheet-editor hero column
// (D&D 5e, Pathfinder 2e): a read-only card from the campaign roster: portrait, name,
// class and level, HP with temp HP (DownStatus at 0: the death saves, PF2e's Dying value
// or Dead; the bar's band from `hpTone`, as every HP bar), AC, Init (PF2e: Perception, what
// it rolls for Initiative) and Passive Perception, conditions and concentration, and a link
// to the full sheet, where everything is changed (same tab: two open editors of one hero
// would overwrite each other). Compact (the phone's Hero tab): 44px link.
// While HeroScope has the hero's sheet editor (it applies the GM's HP and condition
// changes), the numbers come from that live copy, with the GM's last change beneath HP.
import type { RosterEntry } from '~/types'
import type { Pf2eSheet } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { initiativeBonus, initiativeLabel } from '~/utils/heroCardStats'
import { acNow } from '~/utils/pf2ePlay'
import { conditionLabels, heroDown, hpTone, rosterAc } from '~/utils/roster'

const props = defineProps<{ entry: RosterEntry; compact?: boolean }>()

const { campaignId } = useCampaignBoard()
const { touch } = useBoardLayout()
const system = useBattleSystem()

type Summary = NonNullable<RosterEntry['summary']>
/** The sheet fields the live copy overrides in the roster summary. */
const LIVE_KEYS = [
  'hp',
  'hpMax',
  'tempHp',
  'conditions',
  'deathSaves',
  'dying',
  'wounded',
  'doomed',
  'conditionValues',
  'ac',
  'initMod',
  'passivePerception',
  'saves',
] as const

const host = inject(BOARD_HERO, null)
const editor = computed(() => {
  const ed = host?.value
  return ed && ed.draft.value.id === props.entry.character_id ? ed : null
})
const s = computed<Summary>(() => {
  const summary = props.entry.summary ?? {}
  const sheet = editor.value?.draft.value.sheet as Record<string, unknown> | undefined
  if (!sheet) return summary
  const live: Record<string, unknown> = { ...summary }
  for (const key of LIVE_KEYS) if (sheet[key] !== undefined) live[key] = sheet[key]
  return live as Summary
})
/** The GM's last change, as the sheet worded it ("GM: took 5 damage: 13/18 HP."). */
const gmNote = computed(() => editor.value?.lastRoll.value ?? '')
const name = computed(() => props.entry.character_name ?? props.entry.display_name)
const identity = computed(() =>
  [
    [s.value.lineage, s.value.class].filter(Boolean).join(' '),
    props.entry.character_level ? `Lvl ${props.entry.character_level}` : '',
  ]
    .filter(Boolean)
    .join(' · '),
)
const hp = computed(() => s.value.hp ?? 0)
const hpMax = computed(() => s.value.hpMax ?? 0)
const temp = computed(() => s.value.tempHp ?? 0)
const down = computed(() => heroDown(s.value.hp, s.value.hpMax))
/** The bar's band: teal, accent at half HP or less, danger at 0. */
const tone = computed(() => hpTone(hp.value, hpMax.value))
/** PF2e's Wounded while up (DownStatus says the rest while down). */
const wounded = computed(() => {
  const w = s.value.wounded
  return !down.value && typeof w === 'number' && w > 0 ? `Wounded ${w}` : ''
})
const conditions = computed(() => {
  const list = conditionLabels(s.value.conditions ?? [], system.value, s.value.conditionValues)
  const conc = s.value.concentration
  return conc ? [...list, `Concentrating · ${conc}`] : list
})

function pct(n: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, (n / max) * 100)) : 0
}

const init = computed(() => initiativeBonus(system.value, s.value))
/** PF2e: AC now (conditions, effects, a raised shield), from the live sheet once loaded. */
const ac = computed(() => {
  if (system.value !== 'pf2e') return s.value.ac
  const sheet = editor.value?.draft.value.sheet as Pf2eSheet | undefined
  return sheet ? acNow(sheet).value : rosterAc(props.entry)
})
const tiles = computed(() => [
  { label: 'AC', value: ac.value != null ? String(ac.value) : '—', title: 'Armor Class' },
  {
    label: initiativeLabel(system.value),
    value: init.value !== null ? sign(init.value) : '—',
    title: 'Added to your Initiative roll',
  },
  {
    label: 'Passive',
    value: s.value.passivePerception != null ? String(s.value.passivePerception) : '—',
    title: 'Passive Perception',
  },
])
</script>

<template>
  <section
    class="panel hb"
    :class="{ 'hb--touch': compact || touch, 'hb--compact': compact }"
    aria-label="Your hero"
  >
    <header class="hb__id">
      <UiAvatar
        :name="name"
        :portrait-path="s.portraitOverride || entry.portrait_path"
        :class-slug="s.classSlug ?? null"
        :faded="down"
        :size="compact ? 48 : 38"
      />
      <div class="hb__who">
        <h2 class="hb__name">{{ name }}</h2>
        <div v-if="identity" class="hb__sub">{{ identity }}</div>
      </div>
    </header>

    <div class="hb__hp">
      <div class="hb__hp-head">
        <span class="hb__sect">Hit points</span>
        <span class="hb__hp-num"
          >{{ hp }} / {{ hpMax }}<b v-if="temp" class="hb__temp"> +{{ temp }} temp</b></span
        >
      </div>
      <div
        class="meter hb__bar"
        :class="tone ? `meter--${tone}` : undefined"
        role="img"
        :aria-label="`${hp} of ${hpMax} hit points${temp ? `, ${temp} temporary` : ''}${down ? ', down' : ''}`"
      >
        <span :style="{ width: `${pct(hp, hpMax)}%` }" />
        <i v-if="temp" class="hb__temp-fill" :style="{ width: `${pct(temp, hpMax)}%` }" />
      </div>
      <BattleDownStatus v-if="down" :summary="s" />
      <p v-else-if="wounded" class="hb__dying">{{ wounded }}</p>
      <p v-if="gmNote" class="hb__note" role="status">{{ gmNote }}</p>
    </div>

    <div class="hb__tiles">
      <div v-for="t in tiles" :key="t.label" class="hb__tile" :title="t.title">
        <b>{{ t.value }}</b>
        <span>{{ t.label }}</span>
      </div>
    </div>

    <div>
      <span class="hb__sect">Conditions</span>
      <ul v-if="conditions.length" class="hb__chips">
        <li v-for="c in conditions" :key="c">{{ c }}</li>
      </ul>
      <p v-else class="hb__none">No conditions</p>
    </div>

    <NuxtLink
      v-if="entry.character_id"
      :to="`/character/${entry.character_id}?campaign=${campaignId}`"
      class="btn btn--ghost btn--sm hb__sheet"
      >Open full sheet</NuxtLink
    >
  </section>
</template>

<style scoped lang="scss">
.hb {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 14px 12px;
}

.hb__id {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.hb__who {
  min-width: 0;
}

.hb.panel .hb__name {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 17px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.hb__sub {
  font-size: 12px;
  color: var(--page-muted);
}

.hb__sect {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.hb__hp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hb__hp-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.hb__hp-num {
  margin-left: auto;
  font-family: var(--font-heading);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.hb__temp {
  font-family: var(--font-body);
  font-size: 12px;
  color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
}

.hb__bar {
  position: relative;
  height: 10px;
}

// Temp HP sits over the right end of the bar, as on the hero stats dialog, in its own
// colour (apart from the three HP bands).
.hb__temp-fill {
  position: absolute;
  inset: 0 0 0 auto;
  background: var(--temp-hp);
  opacity: 0.75;
}

.hb__dying {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--page-soft);
}

.hb__note {
  margin: 0;
  font-size: 12px;
  color: var(--page-muted);
}

.hb__tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.hb__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px 4px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  border: 1px solid var(--line);

  b {
    font-family: var(--font-heading);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }

  span {
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.hb__chips {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  li {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--field);
    border: 1px solid var(--line);
    color: var(--page-soft);
  }
}

.hb__none {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--page-muted);
}

.hb__sheet {
  align-self: flex-start;
}

// --- Touch (the phone's Hero tab, tablets): 44px targets ------------------------------
.hb--touch {
  .hb__sheet {
    min-height: 44px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
  }

  .hb__chips {
    gap: 8px;

    li {
      font-size: 13px;
      padding: 4px 12px;
    }
  }
}

.hb--compact {
  padding: 12px 14px;

  .hb__sheet {
    align-self: stretch;
    justify-content: center;
  }
}
</style>
