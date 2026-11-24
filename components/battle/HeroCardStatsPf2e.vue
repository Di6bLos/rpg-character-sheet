<script setup lang="ts">
// The stats modal's main area for a Pathfinder 2e hero: attribute modifiers, saves and
// Perception and Class DC with their ranks, hero and focus points, Dying and Wounded
// (live from the roster), the shield, and every skill with its rank (trained first).
// Shows only what campaign_hero_card returned.
import type { Pf2eAttr } from '~/types/sheets'
import type { Pf2eHeroCard } from '~/types'
import type { HeroLive } from '~/composables/useHeroCard'
import { sign } from '~/utils/dice'
import { pf2eRankName, pf2eSkillRows } from '~/utils/heroCardStats'

const props = defineProps<{ card: Pf2eHeroCard; live: HeroLive }>()

const ATTRS: Pf2eAttr[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

const attrs = computed(() => ATTRS.map((k) => ({ k, v: sign(props.card.attrs[k] ?? 0) })))

const saves = computed(() =>
  props.card.saves
    .filter((s) => s.label)
    .map((s) => ({
      ...s,
      v: s.label === 'Class DC' ? String(s.value) : sign(s.value),
      rankName: pf2eRankName(s.rank),
    })),
)

const skills = computed(() =>
  pf2eSkillRows(props.card.skills).map((s) => ({ ...s, rankName: pf2eRankName(s.rank) })),
)

const points = computed(
  () =>
    props.live.pf2e ?? {
      heroPoints: props.card.heroPoints,
      focus: props.card.focus,
      dying: props.card.dying,
      wounded: props.card.wounded,
    },
)

const shield = computed(() => {
  const s = props.card.shield
  return s && s.name.trim() ? s : null
})
</script>

<template>
  <div class="hcs">
    <div class="hcs__full">
      <span class="hcs__sect">Attributes</span>
      <div class="hcs__six">
        <div v-for="a in attrs" :key="a.k" class="hcs__stat" :title="`${a.k} modifier ${a.v}`">
          <b>{{ a.v }}</b>
          <span>{{ a.k }}</span>
        </div>
      </div>
    </div>

    <div class="hcs__full">
      <span class="hcs__sect">Saves &amp; checks</span>
      <div v-if="saves.length" class="hcs__saves">
        <div
          v-for="s in saves"
          :key="s.label"
          class="hcs__stat"
          :title="`${s.label} ${s.v} (${s.rankName})`"
        >
          <b>{{ s.v }}</b>
          <span class="hcs__save-label">
            <span class="hcs__rank" :class="`hcs__rank--${s.rank}`" aria-hidden="true">{{
              s.rank
            }}</span>
            {{ s.label }}
          </span>
          <span class="sr-only">{{ s.rankName }}</span>
        </div>
      </div>
      <p v-else class="hcs__none">None</p>
    </div>

    <div>
      <span class="hcs__sect">Points</span>
      <dl class="hcs__pairs">
        <dt>Hero points</dt>
        <dd>
          <span
            class="hcs__pips hcs__pips--good"
            role="img"
            :aria-label="`${points.heroPoints} of 3`"
          >
            <i v-for="n in 3" :key="n" :class="{ 'is-on': n <= points.heroPoints }" />
          </span>
        </dd>
        <dt>Focus points</dt>
        <dd>{{ points.focus.max > 0 ? `${points.focus.current} / ${points.focus.max}` : '—' }}</dd>
        <dt>Dying</dt>
        <dd :class="{ hcs__bad: points.dying > 0 }">{{ points.dying }} / 4</dd>
        <dt>Wounded</dt>
        <dd :class="{ hcs__bad: points.wounded > 0 }">{{ points.wounded }}</dd>
      </dl>
    </div>

    <div>
      <span class="hcs__sect">Shield</span>
      <template v-if="shield">
        <p class="hcs__shield-name">
          {{ shield.name }}
          <span v-if="shield.raised" class="hcs__tag">Raised · +2 AC</span>
        </p>
        <dl class="hcs__pairs">
          <dt>Hardness</dt>
          <dd>{{ shield.hardness }}</dd>
          <dt>HP</dt>
          <dd>{{ shield.hp }} / {{ shield.hpMax }}</dd>
          <dt>Broken threshold</dt>
          <dd>{{ shield.bt }}</dd>
        </dl>
      </template>
      <p v-else class="hcs__none">None</p>
    </div>

    <div class="hcs__full">
      <span class="hcs__sect">Skills</span>
      <ul v-if="skills.length" class="hcs__skills">
        <li
          v-for="s in skills"
          :key="s.name"
          :class="{ 'is-trained': s.rank !== 'U' }"
          :title="`${s.name} ${sign(s.value)} (${s.rankName}, ${s.attr})`"
        >
          <span class="hcs__rank" :class="`hcs__rank--${s.rank}`" aria-hidden="true">{{
            s.rank
          }}</span>
          <span class="hcs__skill-name">{{ s.name }}</span>
          <span class="sr-only">{{ s.rankName }}</span>
          <b>{{ sign(s.value) }}</b>
        </li>
      </ul>
      <p v-else class="hcs__none">None</p>
      <p class="hcs__legend">U untrained · T trained · E expert · M master · L legendary</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../assets/styles/hero-stats';

// Contains the .sr-only rank names.
.hcs {
  position: relative;
}

.hcs__six {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 560px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.hcs__saves {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 560px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.hcs__save-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  white-space: nowrap;
}

// The PF2e sheet's rank badge (Pf2eSheet), smaller.
.hcs__rank {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  font-weight: 800;
  background: var(--track);
  color: var(--page-muted);

  &--T {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--page-text);
    color: var(--page-text);
  }

  &--E {
    background: var(--secondary);
    color: var(--on-secondary);
  }

  &--M,
  &--L {
    background: var(--accent);
    color: var(--on-accent);
  }
}

.hcs__bad {
  color: color-mix(in srgb, var(--danger) 60%, var(--page-text));
}

.hcs__shield-name {
  margin: 0 0 4px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.hcs__tag {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--page-text);
}

.hcs__skills {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 3px 18px;

  li {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 13px;
    color: var(--page-muted);

    &.is-trained {
      color: var(--page-soft);
    }
  }

  b {
    margin-left: auto;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--page-text);
  }
}

.hcs__skill-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hcs__legend {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--page-muted);
}
</style>
