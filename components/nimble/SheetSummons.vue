<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'
import { syncCompanions } from '~/utils/nimbleBuild'
import { summonLookKey } from '~/utils/nimbleSummons'

const { draft, canEdit } = useSheet<NimbleSheet>()
const { companionOptions } = useNimbleActions()

function limited(options: { name: string; text: string; passive: boolean }[]) {
  return options
    .filter((o) => !o.passive)
    .map((o) => {
      const card = companionOptions.value.find((c) => c.name === o.name)
      return { ...o, card, text: card?.text ?? o.text }
    })
}
const sheet = computed(() => draft.value.sheet)
onMounted(() => {
  if (canEdit.value) syncCompanions(sheet.value)
})
const {
  groups,
  available,
  minions,
  spirit,
  armorOfShadows,
  summon,
  addCustom,
  dismiss,
  slay,
  sacrifice,
  command,
  spiritAttack,
  spiritHeal,
  left,
  spiritCost,
} = useNimbleSummons()

const customizing = ref('')

/** One card per summon kind (a stack of identical minions); hand-added ones each get their own. */
const cards = computed(() =>
  groups.value.flatMap((g) =>
    (g.id === 'custom' ? g.members.map((m) => [m]) : [g.members]).flatMap((list) => {
      const first = list[0]
      const last = list.at(-1)
      if (!first || !last) return []
      const title = list.length > 1 ? first.name.replace(/ [A-Z]$/, '') : first.name
      const stats = [
        first.hpMax ? `${first.hpMax} HP` : g.permanent ? 'HP abstracted' : 'Immune to harm',
        g.attack,
        first.charges !== undefined ? `${first.charges} heals left` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const looks = g.id === 'custom' ? [summonLookKey(first)] : g.looks
      const kindLine = [
        title.toLowerCase() === g.name.toLowerCase() || g.id === 'custom' ? '' : g.name,
        g.cap ? `${g.members.length} / ${g.cap}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const key = g.id === 'custom' ? first.id : g.id
      return [{ key, g, list, first, last, title, kindLine, stats, looks }]
    }),
  ),
)
const customName = ref('')
const customHp = ref(0)

function submitCustom() {
  addCustom(customName.value, customHp.value)
  customName.value = ''
  customHp.value = 0
}
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="sum-h">
    <div class="title-help">
      <h2 id="sum-h">Summons</h2>
      <UiHelp
        label="About summons"
        text="Minions, spirits, companions and friends your spells and abilities call up. Casting the spell or using the ability adds them; New encounter clears minions that abandon you outside combat, and a Safe Rest ends the rest. The GM can seat them in initiative with Sync summons."
      />
    </div>

    <div v-if="minions || spirit" class="row" style="gap: 8px; flex-wrap: wrap">
      <button
        v-if="minions"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit || left < 1 || !!sheet.uses['Command minions@turn']?.used"
        :title="sheet.uses['Command minions@turn']?.used ? 'Once per turn' : undefined"
        @click="command"
      >
        Command minions · 1 action
      </button>
      <template v-if="spirit">
        <button
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit || left < spiritCost()"
          @click="spiritAttack"
        >
          Spirit attacks
        </button>
        <button
          type="button"
          class="btn btn--sm btn--ghost"
          :disabled="!canEdit || !spirit.charges || left < spiritCost()"
          @click="spiritHeal"
        >
          Spirit heals · {{ spirit.charges ?? 0 }} left
        </button>
      </template>
    </div>
    <p v-if="armorOfShadows" class="small" style="font-size: 13px">
      Armor of Shadows: take {{ armorOfShadows }} less damage from every hit.
    </p>

    <div v-for="c in cards" :key="c.key" class="tile group">
      <template v-if="customizing === c.key">
        <NimbleSummonLook
          v-for="k in c.looks"
          :key="k"
          :look-key="k"
          @switch="customizing = $event"
        />
      </template>
      <div class="companion">
        <span class="stack-pic">
          <UiAvatar
            :name="c.title"
            :portrait-path="c.first.portrait ?? null"
            :beast="c.first.beast ?? null"
            :size="64"
          />
          <span v-if="c.list.length > 1" class="stack-pic__count">×{{ c.list.length }}</span>
        </span>
        <div class="companion__body">
          <div class="companion__top">
            <strong>{{ c.title }}</strong>
            <span v-if="canEdit" class="companion__actions">
              <button
                v-if="c.first.hpMax"
                type="button"
                class="btn btn--quiet btn--sm companion__danger"
                :aria-label="c.list.length > 1 ? `One ${c.title} is slain` : `${c.title} is slain`"
                @click="slay(c.last.id)"
              >
                {{ c.list.length > 1 ? 'One slain' : 'Slain' }}
              </button>
              <button
                v-if="c.g.canSacrifice"
                type="button"
                class="btn btn--quiet btn--sm companion__danger"
                :aria-label="`Sacrifice ${c.last.name}`"
                @click="sacrifice(c.last.id)"
              >
                {{ c.list.length > 1 ? 'Sacrifice one' : 'Sacrifice' }}
              </button>
              <button
                v-if="!c.g.permanent"
                type="button"
                class="btn btn--quiet btn--sm companion__danger"
                :aria-label="`Dismiss ${c.last.name}`"
                @click="dismiss(c.last.id)"
              >
                {{ c.list.length > 1 ? 'Dismiss one' : 'Dismiss' }}
              </button>
            </span>
            <button
              v-if="canEdit"
              type="button"
              class="btn btn--quiet btn--sm companion__customize"
              :aria-expanded="customizing === c.key"
              @click="customizing = customizing === c.key ? '' : c.key"
            >
              {{ customizing === c.key ? 'Done' : 'Customize' }}
            </button>
          </div>
          <small v-if="c.kindLine" class="companion__kind">{{ c.kindLine }}</small>
          <small class="companion__stats">{{ c.stats }}</small>
          <p v-for="o in c.g.options.filter((x) => x.passive)" :key="o.name" class="group__desc">
            <strong>{{ o.name }}</strong> {{ o.text }}
          </p>
          <details class="companion__abilities">
            <summary>Abilities</summary>
            <p v-if="c.g.desc && !c.g.options.length" class="group__desc">{{ c.g.desc }}</p>
            <p v-for="n in c.g.notes" :key="n" class="group__desc">{{ n }}</p>
            <NimbleModifiers v-if="c.g.source" :target="c.g.source" />
            <p v-if="c.g.duration" class="group__desc">
              <em>{{ c.g.duration }}</em>
            </p>
            <div v-for="o in limited(c.g.options)" :key="o.name" class="opt">
              <div class="opt__head">
                <strong>{{ o.name }}</strong>
                <span v-if="o.card" class="opt__pips" aria-hidden="true">
                  <i v-for="n in o.card.max" :key="n" :class="{ on: n <= o.card.left }" />
                </span>
                <small v-if="o.card">{{ o.card.period }}</small>
                <em v-if="o.card?.costText">{{ o.card.costText }}</em>
              </div>
              <p class="opt__text">{{ o.text }}</p>
              <div v-if="o.card" class="opt__actions">
                <button
                  v-if="o.card.used"
                  type="button"
                  class="btn btn--quiet btn--sm"
                  :disabled="!canEdit"
                  :aria-label="`Undo ${o.name}`"
                  @click="o.card.undo()"
                >
                  Undo
                </button>
                <button
                  type="button"
                  class="btn btn--sm"
                  :disabled="!canEdit || o.card.off"
                  :title="o.card.why || undefined"
                  :aria-label="`Use ${o.name}, ${o.card.uses}`"
                  @click="o.card.use()"
                >
                  {{ o.card.why || 'Use' }}
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
    <p v-if="!sheet.summons.length" class="empty">Nothing summoned right now.</p>

    <div v-if="canEdit" class="stack" style="gap: 8px">
      <span v-if="available.length" class="caps">Add by hand (no cost)</span>
      <div v-if="available.length" class="chips" style="gap: 6px">
        <button
          v-for="a in available"
          :key="a.id"
          type="button"
          class="chip"
          :disabled="a.full"
          :title="
            a.full ? 'At the max' : `Add ${a.name} by hand, without casting or spending a use`
          "
          @click="summon(a.id)"
        >
          + {{ a.name }}
        </button>
      </div>
      <form class="row custom" @submit.prevent="submitCustom">
        <label for="nb-sum-name" class="sr-only">Other summon</label>
        <input
          id="nb-sum-name"
          v-model="customName"
          class="input"
          placeholder="Other summon (name)"
          maxlength="60"
        />
        <label for="nb-sum-hp" class="sr-only">Its HP</label>
        <input
          id="nb-sum-hp"
          v-model.number="customHp"
          class="input custom__hp"
          type="number"
          min="0"
          max="999"
          placeholder="HP"
        />
        <button type="submit" class="btn btn--ghost" :disabled="!customName.trim()">Add</button>
      </form>
    </div>
  </section>
</template>

<style scoped lang="scss">
.group {
  gap: 6px;
  padding: 10px 12px;
}

.companion {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.companion__top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;

  strong {
    font-family: var(--font-heading);
    font-size: 17px;
    line-height: 1.2;
  }

  .companion__customize {
    margin: -4px -6px -4px auto;
  }
}

.companion__kind {
  font-size: 11px;
  color: var(--page-muted);
}

.companion__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.opt {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 12px;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--field);
}

.opt__head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;

  strong {
    font-size: 14px;
  }

  small {
    font-size: 11px;
    color: var(--page-muted);
  }

  em {
    margin-left: auto;
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent-text);
  }
}

.opt__pips {
  display: inline-flex;
  gap: 3px;

  i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);

    &.on {
      background: var(--accent);
      box-shadow: none;
    }
  }
}

.opt__text {
  font-size: 13px;
  line-height: 1.45;
  color: var(--page-soft);
}

.opt__actions {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.companion__stats {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
}

.companion__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
}

.companion__danger {
  min-height: 24px;
  padding: 0 6px;
  font-size: 11px;
  color: var(--danger, #e2735f);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger, #e2735f) 12%, transparent);
  }
}

.stack-pic {
  position: relative;
  display: inline-flex;
  flex: none;
}

.stack-pic__count {
  position: absolute;
  right: -6px;
  bottom: -4px;
  min-width: 30px;
  height: 26px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--secondary);
  color: var(--on-secondary);
  font-size: 13px;
  font-weight: 700;
  line-height: 26px;
  text-align: center;
}

.companion__abilities {
  summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent-text);
  }

  p {
    margin-top: 6px;
  }
}

.group__desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--page-soft);
}

.custom {
  gap: 8px;
  flex-wrap: nowrap;

  .input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .custom__hp {
    flex: 0 0 72px;
  }
}
</style>
