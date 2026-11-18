<script setup lang="ts">
// Level 1 stats and skill points: the stat array, where each value goes and the
// 4 extra skill points. Shared by the hero builder and Reconfigure.
import { STARTING_SKILL_POINTS, STAT_ARRAYS } from '~/data/nimble/core'
import type { AncestryDef, ClassDef } from '~/data/nimble/types'
import type { NimbleStat } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { recommendedStats } from '~/utils/nimbleBuild'
import { defaultSheet } from '~/utils/sheetDefaults'

const props = defineProps<{ cls?: ClassDef; ancestry?: AncestryDef }>()
const arrayId = defineModel<string>('arrayId', { required: true })
const stats = defineModel<Record<NimbleStat, number>>('stats', { required: true })
const skillPoints = defineModel<Record<string, number>>('skillPoints', { required: true })

const STATS: NimbleStat[] = ['STR', 'DEX', 'INT', 'WIL']
const SKILLS = defaultSheet('nimble').skills

const fmt = (n: number) => sign(n).replace('-', '−')

const statArray = computed(() => STAT_ARRAYS.find((a) => a.id === arrayId.value) ?? STAT_ARRAYS[0]!)
const arrayOptions = computed(() => [...new Set(statArray.value.values)].sort((a, b) => b - a))

watch(arrayId, () => {
  if (props.cls) stats.value = recommendedStats(props.cls, statArray.value.values)
})

/** Setting a stat swaps values with whichever stat held the new value. */
function setStat(stat: NimbleStat, value: number) {
  const old = stats.value[stat]
  const other = STATS.find((s) => s !== stat && stats.value[s] === value)
  const next = { ...stats.value, [stat]: value }
  if (other) next[other] = old
  stats.value = next
}

const pointsLeft = computed(
  () => STARTING_SKILL_POINTS - Object.values(skillPoints.value).reduce((a, b) => a + b, 0),
)

function skillBonus(skillName: string, stat: NimbleStat) {
  const a = props.ancestry
  return (
    stats.value[stat] +
    (skillPoints.value[skillName] ?? 0) +
    (a?.skills?.all ?? 0) +
    (a?.skills?.named?.[skillName] ?? 0)
  )
}

function bumpSkill(skillName: string, delta: number) {
  const cur = skillPoints.value[skillName] ?? 0
  if (delta > 0 && pointsLeft.value <= 0) return
  skillPoints.value = { ...skillPoints.value, [skillName]: Math.max(0, cur + delta) }
}
</script>

<template>
  <div class="panel stack">
    <div class="field">
      <span class="label">Stat array</span>
      <div class="chips" role="radiogroup" aria-label="Stat array">
        <button
          v-for="a in STAT_ARRAYS"
          :key="a.id"
          type="button"
          role="radio"
          class="chip"
          :class="{ 'is-active': a.id === arrayId }"
          :aria-checked="a.id === arrayId"
          @click="arrayId = a.id"
        >
          {{ a.name }} · {{ a.values.map(fmt).join(', ') }}
        </button>
      </div>
      <span class="hint small muted">
        Recommended: the highest numbers in {{ cls?.name }}’s key stats ({{
          cls?.keyStats.join(' and ')
        }}). Changing a stat swaps it with the one that had that value.
      </span>
    </div>
    <div class="stat-grid">
      <div
        v-for="s in STATS"
        :key="s"
        class="tile stat"
        :class="{ key: cls?.keyStats.includes(s) }"
      >
        <label class="tile__label" :for="`stat-${s}`">{{ s }}</label>
        <select
          :id="`stat-${s}`"
          class="input"
          :value="stats[s]"
          @change="setStat(s, Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="v in arrayOptions" :key="v" :value="v">{{ fmt(v) }}</option>
        </select>
        <span class="small muted stat__notes">
          <span v-if="cls?.keyStats.includes(s)">Key stat</span>
          <span v-if="cls?.saveAdv === s" class="save save--adv">Save · advantage</span>
          <span v-if="!ancestry?.clearSaveDis && cls?.saveDis === s" class="save save--dis"
            >Save · disadvantage</span
          >
        </span>
      </div>
    </div>
  </div>

  <div class="panel stack">
    <div class="panel-title" style="margin: 0">
      <h3>Skills</h3>
      <span class="small points" :class="{ done: pointsLeft === 0 }">
        {{ pointsLeft }} of {{ STARTING_SKILL_POINTS }} points left
      </span>
    </div>
    <p class="small muted">
      Each skill starts at its stat. Place 4 extra points wherever you like.
    </p>
    <div class="skills">
      <div v-for="sk in SKILLS" :key="sk.name" class="skill">
        <span class="grow"
          >{{ sk.name }} <small>{{ sk.stat }}</small></span
        >
        <button
          type="button"
          class="step step--sm"
          :aria-label="`Remove a point from ${sk.name}`"
          :disabled="!(skillPoints[sk.name] ?? 0)"
          @click="bumpSkill(sk.name, -1)"
        >
          −
        </button>
        <strong class="skill__v">{{ fmt(skillBonus(sk.name, sk.stat)) }}</strong>
        <button
          type="button"
          class="step step--sm"
          :aria-label="`Add a point to ${sk.name}`"
          :disabled="pointsLeft <= 0"
          @click="bumpSkill(sk.name, 1)"
        >
          +
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(130px, 100%), 1fr));
  gap: 10px;
}

.stat.key {
  border-color: var(--accent);
}

.stat__notes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-height: 20px;
}

.save {
  font-weight: 600;

  &--adv {
    color: var(--accent-text);
  }
}

.points {
  font-weight: 600;
  color: var(--accent-text);

  &.done {
    color: var(--page-muted);
  }
}

.skills {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
  gap: 8px 24px;
}

.skill {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;

  small {
    color: var(--page-muted);
    font-size: 11px;
  }
}

.skill__v {
  width: 36px;
  text-align: center;
}

.step--sm {
  width: 44px;
  height: 44px;
  font-size: 18px;
}
</style>
