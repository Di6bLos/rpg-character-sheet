<script setup lang="ts">
// Attacks, reactions and the abilities with limited uses
// (per turn, encounter or Safe Rest, or a pool), each with its counter. Abilities
// the rules don't limit are listed only under All abilities.
import type { NimbleSheet } from '~/types/sheets'

const { draft, canEdit, lastRoll } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const {
  attacks,
  reactions,
  toggleReaction,
  abilities,
  inventionAttacks,
  readied,
  setReady,
  resource,
} = useNimbleActions()
const { summonAttacks } = useNimbleSummons()
const { reactionSpells, cast } = useNimbleSpells()

const mine = computed(() => abilities.value.filter((a) => !a.linked && !a.companion))
</script>

<template>
  <div class="stack" style="gap: 24px; min-width: 0">
    <section class="panel stack" style="gap: 14px" aria-labelledby="atk-h">
      <UiFold name="Attacks" />
      <div class="title-help">
        <h2 id="atk-h">Attacks</h2>
        <UiHelp
          label="About attacks"
          text="No attack roll: a 1 on the first die misses, and its max explodes as a crit. Each attack after the first in a turn is Rushed and rolls with one more disadvantage."
        />
      </div>
      <div v-if="attacks.length || summonAttacks.length || inventionAttacks.length" class="attacks">
        <div v-for="(w, i) in attacks" :key="i" class="tile attack">
          <div class="attack__head">
            <div class="stack" style="gap: 2px">
              <strong style="font-size: 16px">{{ w.name }}</strong>
              <span class="muted" style="font-size: 12px">{{ w.props }}</span>
              <span v-if="w.boost" class="boost">{{ w.boost }}</span>
            </div>
            <span class="dmg" style="font-size: 15px; white-space: nowrap">{{ w.dmg }}</span>
          </div>
          <NimbleModifiers :target="w.name" :weapon="w.props" />
          <button
            type="button"
            class="btn"
            :disabled="!canEdit || w.blocked"
            :title="w.blocked ? 'No actions left' : undefined"
            @click="w.roll"
          >
            {{ sheet.ownDice ? 'Attack' : 'Roll'
            }}<template v-if="w.rushed"> · {{ w.rushed }}× disadvantage</template>
          </button>
        </div>
        <div
          v-for="inv in inventionAttacks"
          :key="inv.name"
          class="tile attack"
          :class="{ 'attack--broken': inv.inoperable }"
        >
          <div class="attack__head">
            <div class="stack" style="gap: 2px">
              <strong style="font-size: 16px">
                <NimbleBrokenIcon v-if="inv.inoperable" />
                {{ inv.name }}
              </strong>
              <span class="muted" style="font-size: 12px">{{ inv.props }}</span>
              <span class="boost">{{ inv.cost }}</span>
            </div>
            <span class="dmg" style="font-size: 15px; white-space: nowrap">{{ inv.dmg }}</span>
          </div>
          <div class="ready">
            <span>{{ resource?.diceName }} Dice readied</span>
            <button
              type="button"
              class="step step--xs"
              :aria-label="`Ready one fewer ${resource?.diceName} Die`"
              :disabled="!canEdit || readied === 0"
              @click="setReady(readied - 1)"
            >
              −
            </button>
            <strong aria-live="polite">{{ readied }}</strong>
            <button
              type="button"
              class="step step--xs"
              :aria-label="`Ready one more ${resource?.diceName} Die`"
              :disabled="!canEdit || readied >= sheet.resource.count"
              @click="setReady(readied + 1)"
            >
              +
            </button>
          </div>
          <NimbleModifiers :target="inv.name" />
          <button
            type="button"
            class="btn"
            :disabled="!canEdit || !!inv.why"
            :title="inv.why || undefined"
            @click="inv.run"
          >
            {{ inv.why || (sheet.ownDice ? 'Attack' : 'Roll') }}
          </button>
        </div>
        <div v-for="a in summonAttacks" :key="a.key" class="tile attack attack--summon">
          <div class="attack__head">
            <div class="stack" style="gap: 2px">
              <strong style="font-size: 16px">{{ a.name }}</strong>
              <span v-if="a.who" class="attack__who">{{ a.who }}</span>
              <span class="muted" style="font-size: 12px">{{ a.props }}</span>
              <span class="boost">{{ a.cost }}</span>
            </div>
            <span class="dmg" style="font-size: 15px; white-space: nowrap">{{ a.dmg }}</span>
          </div>
          <NimbleModifiers :summon="a.summon" />
          <button
            type="button"
            class="btn"
            :disabled="!canEdit || !!a.why"
            :title="a.why || undefined"
            @click="a.run"
          >
            {{ a.why || (sheet.ownDice ? 'Attack' : 'Roll') }}
          </button>
        </div>
      </div>
      <p v-else class="empty">No attacks yet. Use “Edit sheet” to add one.</p>
      <div v-if="lastRoll" class="roll-status" role="status">{{ lastRoll }}</div>
    </section>

    <section class="panel stack" style="gap: 18px" aria-labelledby="act-h">
      <UiFold name="Actions" />
      <div class="title-help">
        <h2 id="act-h">Actions</h2>
        <UiHelp
          label="About actions"
          text="Tap a reaction to use it: each costs 1 action and can be used once per round. Limited-use abilities count their uses per turn, encounter or Safe Rest; tap one for its details."
        />
      </div>

      <div class="stack" style="gap: 8px">
        <div class="caps">Reactions</div>
        <div class="cards">
          <div v-for="r in reactions" :key="r.name" class="reaction-wrap">
            <button
              type="button"
              class="tile card reaction"
              :aria-pressed="r.used"
              :disabled="!canEdit || r.blocked"
              @click="toggleReaction(r.name)"
            >
              <span class="reaction__head">
                <strong>{{ r.name }}</strong>
                <em>{{ r.used ? 'Used · tap to undo' : 'Costs 1 action' }}</em>
              </span>
              <span>{{ r.desc }}</span>
            </button>
            <NimbleModifiers :target="r.name" />
          </div>
          <button
            v-for="s in reactionSpells"
            :key="s.name"
            type="button"
            class="tile card reaction"
            :disabled="!canEdit || !!s.blocked"
            :title="s.blocked || `${s.cast}. ${s.desc}`"
            @click="cast(s)"
          >
            <span class="reaction__head">
              <strong>{{ s.name }}</strong>
              <em>{{ s.blocked || `Spell · ${s.cost}` }}</em>
            </span>
            <span>{{ s.trigger }}</span>
          </button>
        </div>
      </div>

      <div v-if="mine.length" class="stack" style="gap: 8px">
        <div class="caps">Limited-use abilities</div>
        <NimbleAbilityCounters :items="mine" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.ready {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--page-soft);

  span {
    margin-right: auto;
  }

  strong {
    min-width: 18px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
}

.attack--broken {
  border: 1px dashed var(--danger);
}

.attack__who {
  font-size: 12px;
  font-weight: 600;
  color: var(--page-soft);
}

.boost {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-text);
}

.attacks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 12px;
}

.attack {
  gap: 12px;
  padding: 16px;

  > .btn {
    margin-top: auto;
  }
}

.attack__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
  gap: 8px;
}

.card {
  padding: 12px;
  text-align: left;
  color: var(--page-text);

  strong {
    font-size: 14px;
  }

  span {
    font-size: 12px;
    line-height: 1.45;
    color: var(--page-soft);
  }
}

.reaction-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;

  > .reaction {
    flex: 1;
  }
}

.reaction {
  justify-content: flex-start;

  &[aria-pressed='true'] {
    border-style: dashed;

    > span:last-child {
      opacity: 0.6;
    }
  }
}

.reaction__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;

  em {
    margin-left: auto;
    font-style: normal;
    font-size: 11px;
    font-weight: 700;
    color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
  }
}

.reaction[aria-pressed='true'] em {
  color: var(--page-soft);
}
</style>
