<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'
import { syncCompanions } from '~/utils/nimbleBuild'
import type { NimbleCustomSummon } from '~/types/sheets'
import {
  CUSTOM_ABILITIES,
  CUSTOM_KINDS,
  CUSTOM_LASTS,
  customAbilityLines,
  summonLookKey,
} from '~/utils/nimbleSummons'
import { DAMAGE_TYPES } from '~/utils/nimbleItems'
import { parseDice } from '~/utils/dice'

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
  spirit,
  armorOfShadows,
  addCustom,
  dismiss,
  slay,
  sacrifice,
  spiritHeal,
  left,
  spiritCost,
  summonAttacks,
} = useNimbleSummons()
const { summonSpells } = useNimbleSpells()
const isFull = (id: string) => !!available.value.find((a) => a.id === id)?.full

function stackAttack(g: { id: string }, first: { name: string; custom?: NimbleCustomSummon }) {
  const key =
    g.id === 'shadow-minion'
      ? 'minions'
      : g.id === 'lifebinding-spirit'
        ? 'spirit'
        : first.custom?.attack
          ? `custom:${first.name.replace(/ [A-Z]$/, '')}|${first.custom.attack.name}|${first.custom.attack.dice}`
          : ''
  return key ? summonAttacks.value.find((a) => a.key === key) : undefined
}

const customizing = ref('')

/** One card per summon kind (a stack of identical minions); hand-added ones each get their own. */
const cards = computed(() =>
  groups.value.flatMap((g) =>
    (g.id === 'custom' ? g.members.map((m) => [m]) : [g.members]).flatMap((list) => {
      const first = list[0]
      const last = list.at(-1)
      if (!first || !last) return []
      const title = list.length > 1 ? first.name.replace(/ [A-Z]$/, '') : first.name
      const custom = first.custom
      const stats = [
        first.hpMax ? `${first.hpMax} HP` : g.permanent ? 'HP abstracted' : 'Immune to harm',
        custom?.armor ? `Armor ${custom.armor}` : '',
        custom?.speed ? `Speed ${custom.speed}` : '',
        custom?.attack
          ? `${custom.attack.name}: ${custom.attack.dice}${custom.attack.type ? ` ${custom.attack.type.toLowerCase()}` : ''}${custom.attack.reach ? ` · Reach ${custom.attack.reach}` : ''}`
          : g.attack,
        first.charges !== undefined ? `${first.charges} heals left` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const looks = g.id === 'custom' ? [summonLookKey(first)] : g.looks
      const kindLine = [
        custom
          ? (CUSTOM_KINDS.find((k) => k.value === custom.kind)?.label.replace(/ \(.*\)$/, '') ?? '')
          : title.toLowerCase() === g.name.toLowerCase() || g.id === 'custom'
            ? ''
            : g.name,
        g.cap ? `${g.members.length} / ${g.cap}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const key = g.id === 'custom' ? first.id : g.id
      const desc = custom ? (custom.notes ?? '') : g.desc
      const traits = customAbilityLines(custom)
      const duration = custom
        ? (CUSTOM_LASTS.find((l) => l.value === custom.lasts)?.label ?? '')
        : g.duration
      const attack = stackAttack(g, first)
      return [
        {
          key,
          g,
          list,
          first,
          last,
          title,
          kindLine,
          stats,
          looks,
          desc,
          duration,
          traits,
          attack,
        },
      ]
    }),
  ),
)
const building = ref(false)
const blankCustom = () => ({
  name: '',
  hp: 1,
  count: 1,
  kind: 'companion' as NimbleCustomSummon['kind'],
  lasts: 'slain' as NimbleCustomSummon['lasts'],
  armor: 0,
  speed: 6,
  hasAttack: true,
  attackName: 'Attack',
  dice: '1d6',
  type: '',
  reach: 1,
  actions: 1,
  notes: '',
  abilities: [] as string[],
  resist: 'Fire',
})
const draftSummon = ref(blankCustom())
const diceOk = computed(() => !draftSummon.value.hasAttack || !!parseDice(draftSummon.value.dice))
const ready = computed(() => !!draftSummon.value.name.trim() && diceOk.value)

const abilitySummary = computed(() => draftSummon.value.abilities.join(', '))

function toggleAbility(name: string, on: boolean) {
  const list = draftSummon.value.abilities.filter((a) => a !== name)
  draftSummon.value.abilities = on
    ? CUSTOM_ABILITIES.map((a) => a.name).filter((a) => a === name || list.includes(a))
    : list
}

function submitCustom() {
  const d = draftSummon.value
  if (!ready.value) return
  addCustom(
    d.name,
    d.hp,
    {
      kind: d.kind,
      lasts: d.lasts,
      armor: d.armor,
      speed: d.speed,
      notes: d.notes,
      abilities: d.abilities,
      resist: d.resist,
      ...(d.hasAttack
        ? {
            attack: {
              name: d.attackName,
              dice: d.dice,
              type: d.type,
              reach: d.reach,
              actions: d.actions,
            },
          }
        : {}),
    },
    d.count,
  )
  draftSummon.value = blankCustom()
  building.value = false
}
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="sum-h">
    <UiFold name="Summons" />
    <div class="title-help">
      <h2 id="sum-h">Summons</h2>
      <UiHelp
        label="About summons"
        text="Minions, spirits, companions and friends your spells and abilities call up. Casting the spell or using the ability adds them; New encounter clears minions that abandon you outside combat, and a Safe Rest ends the rest. The GM can seat them in initiative with Sync summons."
      />
    </div>

    <div v-for="c in cards" :key="c.key" class="tile group">
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
                v-if="c.g.dismissable"
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
              class="companion__customize"
              :aria-expanded="customizing === c.key"
              :aria-label="customizing === c.key ? 'Done customizing' : `Customize ${c.title}`"
              :title="customizing === c.key ? 'Done' : 'Customize name and picture'"
              @click="customizing = customizing === c.key ? '' : c.key"
            >
              <svg
                v-if="customizing !== c.key"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12.5 9 18.5 21 5.5" />
              </svg>
            </button>
          </div>
          <small v-if="c.kindLine" class="companion__kind">{{ c.kindLine }}</small>
          <small class="companion__stats">{{ c.stats }}</small>
          <div v-if="c.attack || c.g.id === 'lifebinding-spirit'" class="stack-actions">
            <button
              v-if="c.attack"
              type="button"
              class="btn btn--sm btn--wrap"
              :disabled="!canEdit || !!c.attack.why"
              :title="c.attack.why || c.attack.props"
              @click="c.attack.run"
            >
              {{ c.attack.why || `${c.attack.name.replace(/^.*?: /, '')} · ${c.attack.cost}` }}
            </button>
            <button
              v-if="c.g.id === 'lifebinding-spirit' && spirit"
              type="button"
              class="btn btn--sm btn--ghost"
              :disabled="!canEdit || !spirit.charges || left < spiritCost() || !sheet.turnActive"
              @click="spiritHeal"
            >
              Spirit heals · {{ spirit.charges ?? 0 }} left
            </button>
          </div>
          <p v-if="c.g.id === 'shadow-minion' && armorOfShadows" class="group__desc">
            Armor of Shadows: you take {{ armorOfShadows }} less damage from every hit.
          </p>
          <p v-for="o in c.g.options.filter((x) => x.passive)" :key="o.name" class="group__desc">
            <strong>{{ o.name }}</strong> {{ o.text }}
          </p>
          <details class="companion__abilities">
            <summary>Abilities</summary>
            <p v-for="t in c.traits" :key="t" class="group__desc">{{ t }}</p>
            <p v-if="c.desc && !c.g.options.length" class="group__desc">{{ c.desc }}</p>
            <p v-for="n in c.g.notes" :key="n" class="group__desc">{{ n }}</p>
            <NimbleModifiers v-if="c.g.id !== 'custom'" :summon="c.g.id" />
            <p v-if="c.duration" class="group__desc">
              <em>{{ c.duration }}</em>
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
                  class="btn btn--sm btn--wrap"
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
      <template v-if="customizing === c.key">
        <NimbleSummonLook
          v-for="k in c.looks"
          :key="k"
          :look-key="k"
          @switch="customizing = $event"
        />
      </template>
    </div>
    <p v-if="!sheet.summons.length" class="empty">Nothing summoned right now.</p>

    <div v-if="canEdit" class="stack" style="gap: 8px">
      <span v-if="summonSpells.length" class="caps">Summoning spells</span>
      <div v-if="summonSpells.length" class="spell-grid">
        <NimbleSpellCard
          v-for="s in summonSpells"
          :key="s.name"
          :spell="s"
          :blocked="s.blocked || (isFull(s.summon) ? 'At the max' : '')"
        />
      </div>
      <button
        type="button"
        class="btn btn--ghost btn--sm builder__toggle"
        :aria-expanded="building"
        :disabled="!canEdit"
        @click="building = !building"
      >
        {{ building ? 'Cancel custom summon' : '+ Build a custom summon or companion' }}
      </button>
      <form v-if="building" class="tile builder" @submit.prevent="submitCustom">
        <div class="builder__row">
          <label class="field grow"
            ><span class="caps">Name</span
            ><input
              v-model="draftSummon.name"
              class="input"
              maxlength="60"
              placeholder="Bramble the wolf"
          /></label>
          <label class="field"
            ><span class="caps">Type</span
            ><select v-model="draftSummon.kind" class="input">
              <option v-for="k in CUSTOM_KINDS" :key="k.value" :value="k.value">
                {{ k.label }}
              </option>
            </select></label
          >
        </div>
        <div class="builder__row">
          <label class="field num"
            ><span class="caps">HP</span
            ><input v-model.number="draftSummon.hp" class="input" type="number" min="0" max="999"
          /></label>
          <label class="field num"
            ><span class="caps">Armor</span
            ><input v-model.number="draftSummon.armor" class="input" type="number" min="0" max="99"
          /></label>
          <label class="field num"
            ><span class="caps">Speed</span
            ><input v-model.number="draftSummon.speed" class="input" type="number" min="0" max="99"
          /></label>
          <label class="field num"
            ><span class="caps">How many</span
            ><input v-model.number="draftSummon.count" class="input" type="number" min="1" max="20"
          /></label>
          <label class="field grow"
            ><span class="caps">Lasts</span
            ><select v-model="draftSummon.lasts" class="input">
              <option v-for="l in CUSTOM_LASTS" :key="l.value" :value="l.value">
                {{ l.label }}
              </option>
            </select></label
          >
        </div>
        <UiSwitch v-model="draftSummon.hasAttack" label="It attacks" class="builder__switch" />
        <div v-if="draftSummon.hasAttack" class="builder__row">
          <label class="field grow"
            ><span class="caps">Attack name</span
            ><input
              v-model="draftSummon.attackName"
              class="input"
              maxlength="40"
              placeholder="Bite"
          /></label>
          <label class="field num"
            ><span class="caps">Damage</span
            ><input v-model="draftSummon.dice" class="input" maxlength="12" placeholder="1d8+2"
          /></label>
          <NimbleDamageTypes v-model="draftSummon.type" class="field grow" />
          <label class="field num"
            ><span class="caps">Reach</span
            ><input v-model.number="draftSummon.reach" class="input" type="number" min="0" max="99"
          /></label>
          <label class="field num"
            ><span class="caps">Actions</span
            ><select v-model.number="draftSummon.actions" class="input">
              <option :value="0">Free</option>
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
            </select></label
          >
        </div>
        <p v-if="!diceOk" class="small" style="color: var(--danger)">
          Damage looks like 1d8 or 2d6+3.
        </p>
        <UiCheckMenu label="Abilities" :value="abilitySummary" class="field">
          <label
            v-for="a in CUSTOM_ABILITIES"
            :key="a.name"
            class="check-menu__item ability-opt"
            :class="{ on: draftSummon.abilities.includes(a.name) }"
            :title="a.desc"
          >
            <input
              type="checkbox"
              :checked="draftSummon.abilities.includes(a.name)"
              @change="toggleAbility(a.name, ($event.target as HTMLInputElement).checked)"
            />
            <span class="ability-opt__text"
              ><strong>{{ a.name }}</strong> <small>{{ a.desc }}</small></span
            >
            <select
              v-if="a.name === 'Resistant'"
              v-model="draftSummon.resist"
              class="input ability-opt__type"
              aria-label="Resistant to"
              @click.stop
            >
              <option v-for="t in DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
        </UiCheckMenu>
        <label class="field"
          ><span class="caps">Notes</span
          ><textarea
            v-model="draftSummon.notes"
            class="input"
            rows="2"
            maxlength="600"
            placeholder="Anything else: how it looks, what it won't do, special orders…"
          />
        </label>
        <button type="submit" class="btn btn--sm" :disabled="!ready">
          Add {{ draftSummon.count > 1 ? `${draftSummon.count} summons` : 'summon' }}
        </button>
      </form>
    </div>
  </section>
</template>

<style scoped lang="scss">
.stack-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0;
}

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
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin: -4px -4px -4px auto;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
    color: var(--accent-text);
    cursor: pointer;

    &[aria-expanded='true'] {
      border-color: var(--accent);
    }
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

.spell-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
  gap: 8px;
  align-items: start;
}

.builder__toggle {
  align-self: flex-start;
}

.builder {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.builder__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;

  .grow {
    flex: 1 1 160px;
    min-width: 0;
  }

  .num {
    flex: 0 0 84px;
  }
}

.ability-opt {
  align-items: flex-start;

  input[type='checkbox'] {
    margin-top: 3px;
  }
}

.ability-opt__text {
  flex: 1;
  line-height: 1.35;

  small {
    display: block;
    font-size: 11px;
    color: var(--page-muted);
  }
}

.ability-opt__type {
  width: auto;
  min-height: 30px;
  padding: 2px 28px 2px 8px;
  font-size: 12px;
}

.builder__switch {
  align-self: flex-start;
  justify-content: flex-start;
  gap: 10px;
  min-height: 32px;
}
</style>
