<script setup lang="ts">
// The stats modal's main area for a D&D 5e hero: the six abilities with modifier, score
// and saving throw (proficient saves marked), Passive Perception, proficiency, Hit Die and
// speed, the death saves (live from the roster) and the features as Key abilities. Shows
// only what campaign_hero_card returned.
import type { Dnd5eHeroCard } from '~/types'
import type { HeroLive } from '~/composables/useHeroCard'
import { sign } from '~/utils/dice'
import { deathSaveState, dnd5eAbilityRows, oneLine } from '~/utils/heroCardStats'
import { deathSavesLine, heroDown } from '~/utils/roster'

const props = defineProps<{ card: Dnd5eHeroCard; live: HeroLive }>()

const abilities = computed(() =>
  dnd5eAbilityRows(props.card).map((a) => ({
    ...a,
    title: `${a.k} ${a.score} (${a.mod}); saving throw ${a.save}${a.prof ? ', proficient' : ''}`,
  })),
)

const facts = computed(() => [
  { name: 'Passive Perception', value: String(props.card.passivePerception) },
  { name: 'Proficiency bonus', value: sign(props.card.profBonus) },
  { name: 'Hit die', value: props.card.hitDie ? `d${props.card.hitDie}` : '—' },
  { name: 'Speed', value: props.card.speed || '—' },
])

const saves = computed(() => props.live.deathSaves ?? props.card.deathSaves)
const down = computed(() => heroDown(props.live.hp, props.live.hpMax))
const savesLabel = computed(() => deathSavesLine({ deathSaves: saves.value }, true))
const state = computed(() => deathSaveState(down.value, saves.value))

const features = computed(() => (props.card.features ?? []).filter((f) => f.name))
</script>

<template>
  <div class="hcs">
    <div class="hcs__full">
      <span class="hcs__sect">Abilities &amp; saves</span>
      <div class="hcs__six">
        <div
          v-for="a in abilities"
          :key="a.k"
          class="hcs__stat"
          :class="{ 'hcs__stat--prof': a.prof }"
          :title="a.title"
        >
          <b>{{ a.mod }}</b>
          <span>{{ a.k }} {{ a.score }}</span>
          <span class="hcs__save">
            <i v-if="a.prof" class="hcs__dot" aria-hidden="true" />Save {{ a.save }}
          </span>
        </div>
      </div>
      <p class="hcs__legend"><i class="hcs__dot" aria-hidden="true" />Proficient save</p>
    </div>

    <div>
      <span class="hcs__sect">Senses &amp; training</span>
      <dl class="hcs__pairs">
        <template v-for="f in facts" :key="f.name">
          <dt>{{ f.name }}</dt>
          <dd>{{ f.value }}</dd>
        </template>
      </dl>
    </div>

    <div>
      <span class="hcs__sect">Death saves</span>
      <div class="hcs__ds" role="img" :aria-label="savesLabel">
        <span class="hcs__ds-row">
          <span>Successes</span>
          <span class="hcs__pips hcs__pips--good">
            <i v-for="n in 3" :key="n" :class="{ 'is-on': n <= saves.successes }" />
          </span>
        </span>
        <span class="hcs__ds-row">
          <span>Failures</span>
          <span class="hcs__pips">
            <i v-for="n in 3" :key="n" :class="{ 'is-on': n <= saves.failures }" />
          </span>
        </span>
      </div>
      <p class="hcs__none">{{ state }}</p>
    </div>

    <div class="hcs__full">
      <span class="hcs__sect">Key abilities</span>
      <ul v-if="features.length" class="hcs__abil">
        <li v-for="(f, i) in features" :key="i" :title="f.desc || undefined">
          <b>{{ f.name }}.</b> {{ oneLine(f.desc) }}
        </li>
      </ul>
      <p v-else class="hcs__none">None</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../assets/styles/hero-stats';

.hcs__six {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 560px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.hcs__save {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}

.hcs__stat--prof .hcs__save {
  color: var(--page-text);
  font-weight: 700;
}

.hcs__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
}

.hcs__legend {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--page-muted);
}

.hcs__ds {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}

.hcs__ds-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: var(--page-soft);
}
</style>
