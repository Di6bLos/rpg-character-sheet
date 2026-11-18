<script setup lang="ts">
// The quick-action dropdowns: attacks, spells, reactions and limited-use
// abilities. Same rules as the sheet (useNimbleActions /
// useNimbleSpells); each result also goes to party chat.
import type { NimbleSheet } from '~/types/sheets'
import {
  actionPips,
  actionsLeft,
  freeMove,
  endEncounter,
  gainAction,
  heal,
  isHollowOne,
  isDead,
  takeDamage,
  beginEncounter,
  initiativeRoll,
  newRound,
  stopCasting,
  toggleActionPip,
  turnActions,
  usedUpLabel,
} from '~/utils/nimblePlay'

defineProps<{ drawer: boolean }>()
const emit = defineEmits<{ dismiss: [] }>()

const { draft, canEdit, lastRoll, say } = useSheet<NimbleSheet>()
const { campaignId } = useCampaignBoard()
const chat = useBoardChat()
const sheet = computed(() => draft.value.sheet)
const uid = useId()

/** Bumped on every result, so a repeated message is still announced. */
const seq = ref(0)

function announce(message: string) {
  seq.value += 1
  void chat.send(`${draft.value.name} · ${message}`, 'party', 'action')
}

const {
  attacks,
  reactions,
  toggleReaction,
  abilities,
  linkedOptions: allLinked,
  companionOptions,
  spend,
  resource,
  readied,
  held,
  setReady,
  rollPower,
  rollJudgment,
  expendJudgment,
  useMove,
  toggleCrit,
  endTurn,
  startTurn,
  rage,
  addFury,
  endRage,
  spendFury,
  setOwnDice,
  malfunctions,
  toggleMalfunction,
  inventions,
  operate,
  abilityActions,
  effects,
  useEffect,
  stopEffect,
  prepaid,
  inventionAttacks,
  attackAbilities,
  attackAbilityKeys,
  opportunityOptions,
} = useNimbleActions({ onResult: announce })
const {
  tiers,
  help: spellHelp,
  cast,
  reactionSpells,
  spellAttacks,
  spellAttackTiers,
  maxTier,
  setUpcast,
  pool: spellPool,
  summonSpells,
} = useNimbleSpells({ onResult: announce })
const {
  available: summonable,
  minions,
  spirit,
  dismiss,
  slay,
  sacrifice,
  command,
  spiritAttack,
  spiritHeal,
  left: summonLeft,
  spiritCost,
  groups: summonGroups,
  summonAttacks,
} = useNimbleSummons({ onResult: announce })
const { allies, help } = useHelpAlly({ onResult: announce })
useHeroEffects()
const isFull = (id: string) => !!summonable.value.find((a) => a.id === id)?.full

/** One row per summon kind, a stack for identical minions; hand-added ones each get a row. */
const summonStacks = computed(() =>
  summonGroups.value.flatMap((g) =>
    (g.id === 'custom' ? g.members.map((m) => [m]) : [g.members]).flatMap((list) => {
      const first = list[0]
      const last = list.at(-1)
      if (!first || !last) return []
      return [
        {
          key: g.id === 'custom' ? first.id : g.id,
          title: list.length > 1 ? first.name.replace(/ [A-Z]$/, '') : first.name,
          count: list.length,
          first,
          last,
          hp: first.hpMax ? `${first.hpMax} HP` : '',
          dismissable: g.dismissable,
          canSacrifice: g.canSacrifice,
        },
      ]
    }),
  ),
)
const summonMenu = computed(() => sheet.value.summons.length > 0 || summonable.value.length > 0)

const spellCount = computed(() => tiers.value.reduce((n, t) => n + t.spells.length, 0))
const reactionsLeft = computed(() => reactions.value.filter((r) => !r.used).length)
const uses = computed(() => {
  const r = resource.value
  if (r?.kind !== 'uses' || isHollowOne(sheet.value)) return null
  return { name: r.name, max: r.max, left: r.max - sheet.value.resource.count }
})
const perTurn = computed(() => turnActions(sheet.value))
const pips = computed(() => actionPips(sheet.value))
const actionsNow = computed(() => actionsLeft(sheet.value))

function blockWhenSpent(event: MouseEvent) {
  if (actionsNow.value === 0 && prepaid.value === 0) event.preventDefault()
}

function toggleAction(n: number) {
  if (canEdit.value) toggleActionPip(sheet.value, n)
}

function startEncounter() {
  if (!canEdit.value) return
  const message = beginEncounter(sheet.value)
  say(message)
  announce(message)
}

const sendInitiative = useSendInitiative()

async function initiative(values?: number[]) {
  if (!canEdit.value) return
  const { message, total } = initiativeRoll(
    sheet.value,
    draft.value.level,
    Math.random,
    values?.[0],
  )
  say(message)
  announce(message)
  const sent = await sendInitiative(total)
  if (sent) say(`${message}${sent}`)
}

function damageOne() {
  if (!canEdit.value) return
  const message = takeDamage(sheet.value, 1, draft.value.level)
  if (message) {
    say(message)
    announce(message)
  }
}

function healOne() {
  if (canEdit.value) heal(sheet.value, 1)
}

function finishEncounter() {
  if (!canEdit.value) return
  const message = endEncounter(sheet.value, draft.value.level)
  say(message)
  announce(message)
}

function extraAction() {
  if (canEdit.value) say(gainAction(sheet.value))
}
const sheetLink = computed(() => `/character/${draft.value.id}?campaign=${campaignId.value}`)
const casting = computed(() => sheet.value.casting)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const diceMenu = computed(() => {
  const r = resource.value
  return r?.ability && ['power', 'dice', 'judgment', 'crit', 'rage', 'counter'].includes(r.kind)
    ? r
    : null
})
const diceHelp = computed(() =>
  [
    diceMenu.value?.desc,
    (
      {
        crit: 'Ready again when your turn starts.',
        power: 'Recharges to full when your turn ends, on New encounter and on a Safe Rest.',
        dice: 'Gained when you roll Initiative (New encounter); lost when combat ends.',
        judgment: 'Held dice clear on New encounter and Safe Rest.',
        rage: 'Fury Dice are lost when your Rage ends: leaving combat, dropping to 0 HP, or a round without attacking or Raging.',
        counter: 'Unused ones are lost when combat ends.',
      } as Record<string, string>
    )[diceMenu.value?.kind ?? ''] ?? '',
  ]
    .filter(Boolean)
    .join('\n\n'),
)
const diceCount = computed(() => {
  const r = diceMenu.value
  const res = sheet.value.resource
  if (!r) return ''
  if (r.kind === 'judgment') return held.value ? `+${held.value}` : '–'
  if (r.kind === 'crit') return res.count ? 'Used' : 'Ready'
  if (r.kind === 'rage') return res.active ? `+${res.rolls.reduce((a, b) => a + b, 0)}` : '–'
  return r.max ? `${res.count}/${r.max}` : `${res.count}`
})
const moves = computed(() => {
  const r = diceMenu.value
  if (r?.kind !== 'dice' && r?.kind !== 'counter') return []
  const fallback = r.kind === 'dice' ? `${r.diceName} Die` : `${r.diceName}`
  return r.moves.length ? r.moves : [{ name: fallback, desc: '' }]
})

/** Shows in the panel only; it isn't news for the party. */
function cancelCasting() {
  if (!canEdit.value) return
  say(stopCasting(sheet.value))
  seq.value += 1
}

/** Spells with why each can't be cast right now ('' when it can). */
const spellGroups = computed(() =>
  tiers.value.map((g) => ({
    ...g,
    spells: g.spells.map((s) => ({
      ...s,
      blocked: s.busy
        ? 'Finish casting first'
        : s.noActions
          ? 'No actions left'
          : s.short
            ? `Needs ${s.usesMinions ? s.cost : `${s.mana} mana`}`
            : '',
    })),
  })),
)

/** One row per counter, so an ability with two limits gets two buttons. */
const counterRows = computed(() =>
  abilities.value.flatMap((a) =>
    a.counters.map((c) => ({
      id: c.id,
      name: a.name,
      title: c.name || a.name,
      desc: a.desc,
      label: [a.counters.length > 1 ? c.label : '', c.costText].filter(Boolean).join(' · '),
      left: c.left,
      max: c.max,
      off: c.left === 0 || c.short,
      warn: c.left === 0 ? usedUpLabel(c) : c.short ? 'Not enough actions' : '',
      linked: a.companion || (c.linked && !!diceMenu.value) || attackAbilityKeys.value.has(a.key),
      counter: c,
    })),
  ),
)
const abilityRows = computed(() => counterRows.value.filter((r) => !r.linked))
const otherActions = computed(() => abilityActions.value.filter((a) => !a.attack))
const linkedOptions = computed(() => (diceMenu.value ? allLinked.value : []))
const effectRows = computed(() =>
  effects.value.filter((e) => !counterRows.value.some((a) => a.name === e.source)),
)
</script>

<template>
  <div class="apm">
    <header class="apm__head">
      <div class="apm__who">
        <strong>{{ draft.name }}<span v-if="isDead(sheet)" class="apm__dead"> (dead)</span></strong>
        <UiSwitch
          :model-value="sheet.ownDice"
          label="I roll my own dice"
          small
          :disabled="!canEdit"
          class="apm__own"
          @update:model-value="setOwnDice"
        />
      </div>
      <NuxtLink
        :to="sheetLink"
        class="btn btn--ghost btn--icon apm__icon"
        aria-label="Open sheet"
        title="Open sheet"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </NuxtLink>
      <button
        type="button"
        class="btn btn--ghost btn--icon apm__icon"
        data-ap-dismiss
        :aria-label="drawer ? 'Close quick actions' : 'Collapse quick actions'"
        :title="drawer ? 'Close' : 'Collapse'"
        @click="emit('dismiss')"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            :d="drawer ? 'M6 6l12 12M18 6L6 18' : 'M15 5l-7 7 7 7'"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </header>

    <p v-if="!canEdit" class="apm__note">Read only.</p>

    <div v-if="casting.actions" class="apm__turn">
      <p class="apm__casting">
        Casting {{ casting.spell }}: {{ plural(casting.actions, 'more action') }} next turn
      </p>
      <button
        type="button"
        class="btn btn--sm btn--ghost"
        :disabled="!canEdit"
        title="Give up on the spell; what it cost is not refunded"
        @click="cancelCasting"
      >
        Stop casting
      </button>
    </div>

    <dl class="apm__vitals">
      <div class="apm__armor" :title="`Defend reduces a hit by your Armor (${sheet.ac})`">
        <dt class="sr-only">Armor</dt>
        <dd>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6Z" />
          </svg>
          <span>{{ sheet.ac }}</span>
        </dd>
      </div>
      <div class="apm__hp" :class="{ 'is-low': sheet.hp * 2 <= sheet.hpMax }">
        <dt>HP</dt>
        <dd>
          <button
            type="button"
            class="apm__hp-btn"
            :disabled="!canEdit"
            aria-label="Take 1 damage"
            @click="damageOne"
          >
            −
          </button>
          <span
            >{{ sheet.hp }}<small>/{{ sheet.hpMax }}</small
            ><small v-if="sheet.tempHp" class="apm__temp"> +{{ sheet.tempHp }}</small></span
          >
          <button
            type="button"
            class="apm__hp-btn"
            :disabled="!canEdit"
            aria-label="Heal 1 HP"
            @click="healOne"
          >
            +
          </button>
        </dd>
      </div>
      <div v-if="sheet.mana.max > 0 || sheet.mana.temp > 0">
        <dt>Mana</dt>
        <dd>
          {{ sheet.mana.current }}<small>/{{ sheet.mana.max }}</small
          ><small v-if="sheet.mana.temp" class="apm__temp"> +{{ sheet.mana.temp }}</small>
        </dd>
      </div>
      <div v-if="uses" :class="{ 'is-low': uses.left <= 0 }">
        <dt>{{ uses.name }}</dt>
        <dd>
          {{ uses.left }}<small>/{{ uses.max }}</small>
        </dd>
      </div>
    </dl>
    <div
      class="apm__actions"
      role="group"
      aria-label="Actions this turn"
      :style="{ '--pip': `${pips > 5 ? 24 : pips > 3 ? 28 : 34}px` }"
    >
      <button
        v-for="n in pips"
        :key="n"
        type="button"
        class="apm__action"
        :class="{ on: n <= actionsNow, extra: n > perTurn }"
        :aria-label="`${n <= actionsNow ? 'Spend' : 'Restore'} action ${n}`"
        :disabled="!canEdit"
        @click="toggleAction(n)"
      >
        {{ n }}
      </button>
      <button
        type="button"
        class="apm__action apm__action--add"
        aria-label="Gain an extra action"
        title="An ally or ability gave you an extra action; it lasts until your turn ends"
        :disabled="!canEdit"
        @click="extraAction"
      >
        +1
      </button>
      <strong class="apm__left" role="status">{{
        actionsNow > perTurn
          ? `${actionsNow} left (${actionsNow - perTurn} extra)`
          : `${actionsNow} of ${perTurn} left`
      }}</strong>
      <small
        v-if="sheet.inEncounter && sheet.initiative != null"
        class="apm__init"
        title="Your Initiative this encounter"
        >Init {{ sheet.initiative }}</small
      >
    </div>
    <div class="apm__steps">
      <button
        v-if="!sheet.inEncounter"
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        title="Refills once-per-encounter abilities; then roll Initiative"
        @click="startEncounter"
      >
        New encounter
      </button>
      <button
        v-if="sheet.awaitingInitiative && !sheet.ownDice"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        title="Your starting actions: 9 or less 1, 10–19 2, 20+ all"
        @click="initiative()"
      >
        Roll Initiative
      </button>
      <button
        v-if="sheet.inEncounter && !sheet.turnActive"
        type="button"
        class="btn btn--quiet btn--sm"
        :disabled="!canEdit"
        title="The battle is over: Rage, unused combat charges and minions end"
        @click="finishEncounter"
      >
        End encounter
      </button>
      <button
        v-if="
          !sheet.turnActive && sheet.inEncounter && !sheet.turnDone && !sheet.awaitingInitiative
        "
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        title="Refills once-per-turn abilities and pays spells still being cast"
        @click="startTurn"
      >
        Start turn
      </button>
      <button
        v-else-if="sheet.inEncounter && sheet.turnDone && !sheet.turnActive"
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        title="Your turn is over for this round; tap when the next round begins"
        @click="say(newRound(sheet, draft.level))"
      >
        New round
      </button>
      <button
        v-if="sheet.turnActive"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        title="All actions and reactions come back; Mana Dice recharge"
        @click="endTurn"
      >
        End turn
      </button>
    </div>
    <NimbleDiceEntry
      v-if="sheet.ownDice && sheet.awaitingInitiative"
      label="Your Initiative total"
      action="Set Initiative"
      signed
      :disabled="!canEdit"
      @submit="initiative"
    />

    <p class="apm__result" :class="{ 'apm__result--empty': !lastRoll }" role="status">
      <span :key="seq">{{ lastRoll }}</span>
    </p>

    <p v-if="!sheet.turnActive" class="apm__offturn">
      {{
        sheet.inEncounter
          ? 'Not your turn: reactions only. Start turn to act.'
          : 'No encounter: tap New encounter, or wait for initiative.'
      }}
    </p>
    <details
      v-if="sheet.turnActive || prepaid > 0"
      name="action-panel"
      class="apm__menu"
      :class="{ 'apm__menu--off': actionsNow === 0 && prepaid === 0 }"
      :open="actionsNow > 0 || prepaid > 0 || undefined"
    >
      <summary
        :aria-disabled="(actionsNow === 0 && prepaid === 0) || undefined"
        @click="blockWhenSpent"
      >
        <span>Attack</span>
        <UiHelp
          label="About attacks"
          text="A 1 on the first die misses; its max explodes as a crit. Each attack after the first in a turn is Rushed (1 more disadvantage)."
        />
        <small>{{
          prepaid > 0 ? 'Paid' : actionsNow === 0 ? 'No actions left' : attacks.length
        }}</small>
      </summary>
      <NimbleTargetArmor class="apm__situation" />
      <NimbleAttackSituation class="apm__situation" />
      <ul
        v-if="
          attacks.length ||
          summonAttacks.length ||
          inventionAttacks.length ||
          spellAttacks.length ||
          attackAbilities.length
        "
        class="apm__list"
      >
        <li v-for="(w, i) in attacks" :key="i">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || w.blocked || undefined"
            :aria-label="`${sheet.ownDice ? 'Attack: ' : ''}${w.name}, ${w.dmg} damage${w.rushed ? `, ${w.rushed}× disadvantage` : ''}${w.blocked ? '. No actions left' : ''}`"
            :aria-describedby="w.props ? `${uid}-w${i}` : undefined"
            :title="w.oddsWhy || undefined"
            @click="canEdit && !w.blocked && w.roll()"
          >
            <span class="apm__name">{{ w.name }}</span>
            <NimbleDmg class="apm__tag" :dmg="w.dmg" :armor-dmg="w.armorDmg" :why="w.armorWhy" />
            <span v-if="w.props || w.rushed || w.boost" :id="`${uid}-w${i}`" class="apm__sub">
              {{
                [w.rushed ? `${w.rushed}× disadvantage` : '', w.boost, w.props]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </span>
          </button>
        </li>
        <template v-for="(w, i) in attacks" :key="`crit-${i}`">
          <li v-if="sheet.ownDice && w.critBy.length">
            <button
              type="button"
              class="apm__row"
              :aria-disabled="!canEdit || undefined"
              @click="canEdit && w.crit()"
            >
              <span class="apm__name">↳ {{ w.name }} crit</span>
              <span class="apm__sub">{{ w.critBy.join(', ') }}</span>
            </button>
          </li>
        </template>
        <li v-for="inv in inventionAttacks" :key="inv.name">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || !!inv.why || undefined"
            :aria-label="`${inv.name}, ${inv.dmg}, ${inv.cost}${inv.rushed ? `, ${inv.rushed}× disadvantage` : ''}${inv.why ? `. ${inv.why}` : ''}`"
            :title="[inv.props, inv.oddsWhy].filter(Boolean).join(' · ')"
            @click="canEdit && !inv.why && inv.run()"
          >
            <span class="apm__name">{{ inv.name }}</span>
            <NimbleDmg
              class="apm__tag"
              :dmg="inv.dmg"
              :armor-dmg="inv.armorDmg"
              :why="inv.armorWhy"
            />
            <span class="apm__sub" :class="{ 'apm__sub--warn': inv.why }">
              {{
                [inv.why, inv.rushed ? `${inv.rushed}× disadvantage` : '', inv.cost]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </span>
          </button>
        </li>
        <li v-for="a in summonAttacks" :key="a.key">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || !!a.why || undefined"
            :aria-label="`${a.name}, ${a.dmg}, ${a.cost}${a.why ? `. ${a.why}` : ''}`"
            :title="a.props"
            @click="canEdit && !a.why && a.run()"
          >
            <span class="apm__name">{{ a.name }}</span>
            <NimbleDmg class="apm__tag" :dmg="a.dmg" :armor-dmg="a.armorDmg" :why="a.armorWhy" />
            <span class="apm__sub" :class="{ 'apm__sub--warn': a.why }">
              {{ [a.why, a.who, a.cost].filter(Boolean).join(' · ') }}
            </span>
          </button>
        </li>
        <template v-for="a in summonAttacks" :key="`crit-${a.key}`">
          <li v-if="sheet.ownDice && a.critBy?.length && a.crit">
            <button
              type="button"
              class="apm__row"
              :aria-disabled="!canEdit || undefined"
              @click="canEdit && a.crit()"
            >
              <span class="apm__name">↳ {{ a.name }} crit</span>
              <span class="apm__sub">{{ a.critBy.join(', ') }}</span>
            </button>
          </li>
        </template>
        <li v-if="spellAttacks.length">
          <details class="apm__spell apm__spells">
            <summary class="apm__row">
              <span class="apm__name">Spells</span>
              <span class="apm__tag">{{ spellAttacks.length }}</span>
              <span v-if="spellPool" class="apm__sub" :class="{ 'apm__sub--warn': spellPool.low }">
                {{ spellPool.label }} {{ spellPool.value }}
              </span>
            </summary>
            <details v-for="g in spellAttackTiers" :key="g.tier" class="apm__spell apm__tier" open>
              <summary class="apm__caps">{{ g.label }}</summary>
              <ul class="apm__list">
                <li v-for="a in g.spells" :key="a.key">
                  <details class="apm__spell">
                    <summary class="apm__row">
                      <span class="apm__name">{{ a.name }}</span>
                      <NimbleDmg
                        class="apm__tag"
                        :dmg="a.dmg"
                        :armor-dmg="a.armorDmg"
                        :why="a.armorWhy"
                      />
                      <span class="apm__sub" :class="{ 'apm__sub--warn': a.why }">
                        {{ [a.why, a.cost].filter(Boolean).join(' · ') }}
                      </span>
                    </summary>
                    <div class="apm__spell-body">
                      <small>{{ a.props }}</small>
                      <NimbleModifiers :target="a.name" />
                      <NimbleUpcast
                        v-if="a.spell.canUpcast"
                        :name="a.name"
                        :tier="a.spell.tier"
                        :at="a.spell.at"
                        :max="maxTier"
                        :price="a.price"
                        :disabled="!canEdit"
                        @set="setUpcast(a.spell, $event)"
                      />
                      <button
                        type="button"
                        class="btn btn--sm btn--wrap"
                        :disabled="!canEdit || !!a.why"
                        :title="a.why || a.oddsWhy || undefined"
                        @click="a.run()"
                      >
                        {{ a.why || (sheet.ownDice ? 'Cast' : 'Cast · Roll')
                        }}<template v-if="!a.why && a.rushed">
                          · {{ a.rushed }}× disadvantage</template
                        >
                      </button>
                      <NimbleCritButton
                        v-if="sheet.ownDice && a.critBy.length"
                        :triggers="a.critBy"
                        :disabled="!canEdit"
                        @crit="a.crit()"
                      />
                    </div>
                  </details>
                </li>
              </ul>
            </details>
          </details>
        </li>
        <li v-for="a in attackAbilities" :key="a.key">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || !!a.why || undefined"
            :aria-label="`Use ${a.name}, ${a.costText}${a.why ? `. ${a.why}` : ''}`"
            :title="a.desc"
            @click="canEdit && !a.why && a.use()"
          >
            <span class="apm__name">{{ a.name }}</span>
            <span class="apm__tag">Use</span>
            <span class="apm__sub" :class="{ 'apm__sub--warn': a.why }">
              {{ [a.why, a.costText].filter(Boolean).join(' · ') }}
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="apm__empty">No attacks on the sheet.</p>
    </details>

    <details v-if="sheet.turnActive && diceMenu" name="action-panel" class="apm__menu">
      <summary>
        <span>{{ diceMenu.name }}</span>
        <UiHelp :label="`About ${diceMenu.name}`" :text="diceHelp" />
        <small>{{ diceCount }}</small>
      </summary>
      <ul class="apm__list">
        <template v-if="diceMenu.kind === 'rage'">
          <li v-if="sheet.ownDice" class="apm__entry">
            <NimbleDiceEntry
              :label="`Fury rolled (d${diceMenu.die})`"
              action="Rage"
              alt="Free"
              :disabled="!canEdit"
              @submit="rage"
              @alt="addFury"
            />
          </li>
          <li v-else>
            <button
              type="button"
              class="apm__row"
              :aria-disabled="
                !canEdit || !!sheet.uses['Rage@turn']?.used || actionsLeft(sheet) === 0 || undefined
              "
              @click="canEdit && !sheet.uses['Rage@turn']?.used && actionsLeft(sheet) > 0 && rage()"
            >
              <span class="apm__name">{{
                sheet.resource.active ? 'Rage again' : diceMenu.name
              }}</span>
              <span class="apm__tag">1 act</span>
              <span class="apm__sub">
                {{
                  sheet.uses['Rage@turn']?.used
                    ? 'Used this turn'
                    : `Roll a d${diceMenu.die} Fury Die`
                }}
              </span>
            </button>
          </li>
          <li v-for="(v, i) in sheet.resource.rolls" :key="`f${i}`">
            <button
              type="button"
              class="apm__row"
              :aria-disabled="!canEdit || undefined"
              @click="canEdit && spendFury(i)"
            >
              <span class="apm__name">Spend Fury Die</span>
              <span class="apm__tag">{{ v }}</span>
              <span class="apm__sub">That all you got?!: −STR+DEX damage when attacked</span>
            </button>
          </li>
          <li v-if="sheet.resource.active">
            <button
              type="button"
              class="apm__row"
              :aria-disabled="!canEdit || undefined"
              @click="canEdit && endRage()"
            >
              <span class="apm__name">End {{ diceMenu.name }}</span>
            </button>
          </li>
        </template>
        <li v-if="diceMenu.kind === 'power'" class="apm__split">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || readied === 0 || undefined"
            :aria-label="`Roll ${readied} ${diceMenu.diceName} Dice`"
            @click="canEdit && readied > 0 && rollPower()"
          >
            <span class="apm__name">Roll {{ readied }}d{{ diceMenu.die }}</span>
            <span class="apm__tag">{{ sheet.resource.count }}/{{ diceMenu.max }} left</span>
            <span class="apm__sub">
              {{
                readied
                  ? `Mishap on ${readied} or less · or used by your next powered attack`
                  : `Use + to ready ${diceMenu.diceName} Dice`
              }}
            </span>
          </button>
          <button
            type="button"
            class="apm__alt apm__step"
            :aria-label="`Ready one fewer ${diceMenu.diceName} Die`"
            :aria-disabled="!canEdit || readied === 0 || undefined"
            @click="canEdit && setReady(readied - 1)"
          >
            −
          </button>
          <button
            type="button"
            class="apm__alt apm__step"
            :aria-label="`Ready one more ${diceMenu.diceName} Die`"
            :aria-disabled="!canEdit || readied >= sheet.resource.count || undefined"
            @click="canEdit && setReady(readied + 1)"
          >
            +
          </button>
        </li>
        <template v-if="diceMenu.kind === 'power'">
          <li v-for="inv in inventions" :key="inv.name">
            <button
              type="button"
              class="apm__row"
              :aria-disabled="
                !canEdit || inv.inoperable || readied < inv.min || inv.noActions || undefined
              "
              @click="
                canEdit &&
                !inv.inoperable &&
                readied >= inv.min &&
                !inv.noActions &&
                operate(inv.name)
              "
            >
              <span class="apm__name"
                ><NimbleBrokenIcon v-if="inv.inoperable" /> {{ inv.name }}</span
              >
              <span class="apm__tag">{{ readied }}d{{ diceMenu.die }}</span>
              <span class="apm__sub" :class="{ 'apm__sub--warn': inv.inoperable }">
                {{
                  inv.inoperable
                    ? 'Inoperable: repair it first'
                    : readied < inv.min
                      ? `Ready at least ${inv.min} die`
                      : inv.noActions
                        ? 'Not enough actions left'
                        : inv.actions
                          ? `${inv.actions} action${inv.actions === 1 ? '' : 's'}`
                          : 'Free with Defend or its own action'
                }}
              </span>
            </button>
          </li>
          <li v-for="m in malfunctions" :key="m.name">
            <button
              type="button"
              class="apm__row"
              :aria-pressed="m.on"
              :aria-disabled="!canEdit || undefined"
              :aria-label="`${m.name}: ${m.on ? m.label : 'working'}. Toggle`"
              @click="canEdit && toggleMalfunction(m.name)"
            >
              <span class="apm__name">{{ m.name }}</span>
              <span class="apm__tag">{{ m.on ? m.label : 'Working' }}</span>
              <span class="apm__sub" :class="{ 'apm__sub--warn': m.on }">
                {{ m.on ? `${m.fix} · tap when fixed` : 'Tap to mark after a mishap' }}
              </span>
            </button>
          </li>
        </template>
        <li v-for="(m, k) in moves" :key="m.name">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="
              !canEdit || (sheet.resource.count === 0 && !freeMove(m.desc)) || undefined
            "
            :aria-label="`${m.name}: roll and spend a ${diceMenu.diceName} Die`"
            :aria-describedby="m.desc ? `${uid}-m${k}` : undefined"
            :title="m.desc"
            @click="canEdit && (sheet.resource.count > 0 || freeMove(m.desc)) && useMove(m.name)"
          >
            <span class="apm__name">{{ m.name }}</span>
            <span class="apm__tag">d{{ diceMenu.die }}</span>
            <span v-if="sheet.resource.count === 0" class="apm__sub apm__sub--warn">None left</span>
            <span v-if="m.desc" :id="`${uid}-m${k}`" class="sr-only">{{ m.desc }}</span>
          </button>
        </li>
        <template v-if="diceMenu.kind === 'judgment'">
          <li v-if="sheet.ownDice && !held" class="apm__entry">
            <NimbleDiceEntry
              :label="`Judgment rolled (${diceMenu.roll}d${diceMenu.die})`"
              action="Hold"
              :disabled="!canEdit"
              @submit="rollJudgment"
            />
          </li>
          <li v-else>
            <button
              type="button"
              class="apm__row"
              :aria-disabled="!canEdit || held > 0 || undefined"
              @click="canEdit && !held && rollJudgment()"
            >
              <span class="apm__name">Roll {{ diceMenu.diceName }} Dice</span>
              <span class="apm__tag">{{ diceMenu.roll }}d{{ diceMenu.die }}</span>
              <span class="apm__sub">
                {{ held ? 'Already holding dice' : 'When an enemy attacks you' }}
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              class="apm__row"
              :aria-disabled="!canEdit || !held || undefined"
              @click="canEdit && held && expendJudgment()"
            >
              <span class="apm__name">Expend</span>
              <span class="apm__tag">{{ held ? `+${held}` : '–' }}</span>
              <span class="apm__sub">
                {{ held ? 'Otherwise added to your next melee hit' : 'No dice held' }}
              </span>
            </button>
          </li>
        </template>
        <li v-if="diceMenu.kind === 'crit'">
          <button
            type="button"
            class="apm__row"
            :class="{ 'apm__row--used': sheet.resource.count > 0 }"
            :aria-pressed="sheet.resource.count > 0"
            :aria-disabled="!canEdit || undefined"
            @click="canEdit && toggleCrit()"
          >
            <span class="apm__name">{{ diceMenu.name }}</span>
            <span class="apm__tag">{{ diceMenu.roll }}d{{ diceMenu.die }}</span>
            <span class="apm__sub">
              {{
                sheet.resource.count
                  ? 'Used this turn · tap to mark ready'
                  : 'Added to your next crit this turn'
              }}
            </span>
          </button>
        </li>
        <li v-for="(o, n) in linkedOptions" :key="o.key">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || o.off || undefined"
            :aria-label="`Use ${o.name}, ${o.uses}`"
            :aria-describedby="`${uid}-l${n}`"
            :title="o.text"
            @click="canEdit && !o.off && o.use()"
          >
            <span class="apm__name">{{ o.name }}</span>
            <span class="apm__tag">{{ o.left }} left</span>
            <span class="apm__sub" :class="{ 'apm__sub--warn': o.off }">
              {{ [o.why, o.costText].filter(Boolean).join(' · ') || o.uses }}
            </span>
            <span :id="`${uid}-l${n}`" class="sr-only">{{ o.text }}</span>
          </button>
        </li>
      </ul>
    </details>

    <details v-if="sheet.turnActive && summonMenu" name="action-panel" class="apm__menu">
      <summary>
        <span>Summons</span>
        <UiHelp
          label="About summons"
          text="Casting a summoning spell or using the ability adds them. Command your minions, act with your spirit or companion, and mark them slain or dismissed. Safe Rest and New encounter (on the sheet) end the ones that don't last."
        />
        <small>{{ sheet.summons.length }}</small>
      </summary>
      <ul class="apm__list">
        <li v-if="minions">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="
              !canEdit || summonLeft < 1 || !!sheet.uses['Command minions@turn']?.used || undefined
            "
            @click="
              canEdit && summonLeft > 0 && !sheet.uses['Command minions@turn']?.used && command()
            "
          >
            <span class="apm__name">Command minions</span>
            <span class="apm__tag">{{ minions }}</span>
            <span class="apm__sub">1 action · all move 6, then attack</span>
          </button>
        </li>
        <li v-if="spirit" class="apm__split">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || summonLeft < spiritCost() || undefined"
            @click="canEdit && summonLeft >= spiritCost() && spiritAttack()"
          >
            <span class="apm__name">{{ spirit.name }} attacks</span>
            <span class="apm__tag">1 act</span>
          </button>
          <button
            type="button"
            class="apm__alt"
            :aria-disabled="!canEdit || !spirit.charges || summonLeft < spiritCost() || undefined"
            :aria-label="`${spirit.name} heals, ${spirit.charges ?? 0} left`"
            @click="canEdit && spirit.charges && summonLeft >= spiritCost() && spiritHeal()"
          >
            Heal {{ spirit.charges ?? 0 }}
          </button>
        </li>
        <li v-for="o in companionOptions" :key="o.key">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || o.off || undefined"
            :aria-label="`Use ${o.name}, ${o.uses}`"
            :title="o.text"
            @click="canEdit && !o.off && o.use()"
          >
            <span class="apm__name">{{ o.name }}</span>
            <span class="apm__tag">{{ o.left }} left</span>
            <span class="apm__sub" :class="{ 'apm__sub--warn': o.off }">
              {{ [o.why, o.costText].filter(Boolean).join(' · ') || o.uses }}
            </span>
          </button>
        </li>
        <li v-for="st in summonStacks" :key="st.key" class="apm__split apm__member">
          <div class="apm__row">
            <UiAvatar
              class="apm__avatar"
              :name="st.title"
              :portrait-path="st.first.portrait ?? null"
              :beast="st.first.beast ?? null"
              :size="24"
            />
            <span class="apm__name">{{ st.title }}</span>
            <span class="apm__tag"
              >{{ st.count > 1 ? `×${st.count}` : '' }}{{ st.count > 1 && st.hp ? ' · ' : ''
              }}{{ st.hp }}</span
            >
          </div>
          <button
            v-if="st.first.hpMax"
            type="button"
            class="apm__alt"
            :aria-disabled="!canEdit || undefined"
            :aria-label="st.count > 1 ? `One ${st.title} is slain` : `${st.title} is slain`"
            @click="canEdit && slay(st.last.id)"
          >
            Slain
          </button>
          <button
            v-if="st.canSacrifice"
            type="button"
            class="apm__alt"
            :aria-disabled="!canEdit || undefined"
            :aria-label="`Sacrifice ${st.last.name}`"
            @click="canEdit && sacrifice(st.last.id)"
          >
            Sacrifice
          </button>
          <button
            v-if="st.dismissable"
            type="button"
            class="apm__alt"
            :aria-disabled="!canEdit || undefined"
            :aria-label="`Dismiss ${st.last.name}`"
            @click="canEdit && dismiss(st.last.id)"
          >
            Dismiss
          </button>
        </li>
        <li v-if="summonSpells.length" class="apm__caps" aria-hidden="true">Summoning spells</li>
        <li v-for="sp in summonSpells" :key="sp.name">
          <button
            type="button"
            class="apm__row"
            :aria-label="`Cast ${sp.name}, ${sp.cost}${sp.blocked ? `. ${sp.blocked}` : ''}`"
            :aria-disabled="!canEdit || !!sp.blocked || isFull(sp.summon) || undefined"
            :title="sp.desc"
            @click="canEdit && !sp.blocked && !isFull(sp.summon) && cast(sp)"
          >
            <span class="apm__name">{{ sp.name }}</span>
            <span class="apm__tag">{{ isFull(sp.summon) ? 'Max' : sp.cost }}</span>
            <span v-if="sp.blocked" class="apm__sub apm__sub--warn">{{ sp.blocked }}</span>
          </button>
        </li>
      </ul>
    </details>

    <details
      v-if="sheet.turnActive && spellCount"
      name="action-panel"
      class="apm__menu"
      :class="{ 'apm__menu--off': actionsNow === 0 }"
      :open="actionsNow > 0 ? undefined : false"
    >
      <summary :aria-disabled="actionsNow === 0 || undefined" @click="blockWhenSpent">
        <span>Cast</span>
        <UiHelp label="About spells" :text="spellHelp" />
        <small>{{
          actionsNow === 0
            ? 'No actions left'
            : spellPool
              ? `${spellPool.label} ${spellPool.value}`
              : spellCount
        }}</small>
      </summary>
      <div v-for="g in spellGroups" :key="g.tier" class="apm__group">
        <div class="apm__caps">{{ g.label }}</div>
        <ul class="apm__list">
          <li v-for="s in g.spells" :key="s.name">
            <details class="apm__spell">
              <summary class="apm__row">
                <span class="apm__name">{{ s.name }}</span>
                <span class="apm__tag">{{ s.cost }}</span>
                <span class="apm__sub" :class="{ 'apm__sub--warn': s.blocked }">
                  {{ s.blocked || (s.actions ? plural(s.actions, 'action') : '') }}
                </span>
              </summary>
              <div class="apm__spell-body">
                <small>{{ s.cast }}</small>
                <p>{{ s.desc }}</p>
                <NimbleModifiers :target="s.name" />
                <NimbleUpcast
                  v-if="s.canUpcast"
                  :name="s.name"
                  :tier="s.tier"
                  :at="s.at"
                  :max="maxTier"
                  :price="s.cost"
                  :disabled="!canEdit"
                  @set="setUpcast(s, $event)"
                />
                <div class="row" style="gap: 6px; flex-wrap: wrap">
                  <button
                    type="button"
                    class="btn btn--sm"
                    :disabled="!canEdit || !!s.blocked"
                    :title="s.blocked || undefined"
                    @click="cast(s)"
                  >
                    {{ s.label }}
                  </button>
                  <button
                    v-if="s.bloodLabel"
                    type="button"
                    class="btn btn--ghost btn--sm"
                    :disabled="!canEdit || s.busy || s.noActions"
                    title="Take 1 Wound instead (My Blood, My Power)"
                    @click="cast(s, true)"
                  >
                    {{ s.bloodLabel }}
                  </button>
                  <button
                    v-for="a in s.alts"
                    :key="a.key"
                    type="button"
                    class="btn btn--ghost btn--sm btn--wrap"
                    :disabled="!canEdit || s.busy || s.noActions || !!a.why"
                    :title="a.why || undefined"
                    @click="cast(s, false, a.key)"
                  >
                    {{ a.why || a.label }}
                  </button>
                </div>
              </div>
            </details>
          </li>
        </ul>
      </div>
    </details>

    <details name="action-panel" class="apm__menu" :open="!sheet.turnActive || undefined">
      <summary>
        <span>React</span>
        <UiHelp
          label="About reactions"
          text="Each costs 1 action, once per round. Tap again to undo."
        />
        <small>{{ reactionsLeft }}/{{ reactions.length }}</small>
      </summary>
      <ul class="apm__list">
        <li v-for="(r, k) in reactions" :key="r.name">
          <details
            v-if="r.name === 'Opportunity Attack' && opportunityOptions.length"
            class="apm__spell"
          >
            <summary class="apm__row" :class="{ 'apm__row--used': r.used }">
              <span class="apm__name">{{ r.name }}</span>
              <span class="apm__tag">{{ r.used ? 'Used' : r.free ? 'Free' : '1 act' }}</span>
              <span class="apm__sub">Melee · pick a weapon</span>
            </summary>
            <ul class="apm__list apm__oa">
              <li v-for="o in opportunityOptions" :key="o.name">
                <button
                  type="button"
                  class="apm__row"
                  :aria-disabled="!canEdit || !!o.why || undefined"
                  :aria-label="`Opportunity Attack with ${o.name}, ${o.dmg}${o.why ? `. ${o.why}` : ''}`"
                  @click="canEdit && !o.why && o.roll()"
                >
                  <span class="apm__name">{{ o.name }}</span>
                  <span class="apm__tag">{{ o.dmg }}</span>
                  <span class="apm__sub" :class="{ 'apm__sub--warn': o.why }">
                    {{ o.why || (o.odds > 0 ? `${o.odds}× disadvantage` : 'Roll') }}
                  </span>
                </button>
              </li>
              <li v-if="r.used">
                <button
                  type="button"
                  class="apm__row"
                  :aria-disabled="!canEdit || undefined"
                  @click="canEdit && toggleReaction(r.name)"
                >
                  <span class="apm__name">Undo Opportunity Attack</span>
                </button>
              </li>
            </ul>
          </details>
          <details v-else-if="r.name === 'Help' && allies.length" class="apm__spell">
            <summary class="apm__row" :class="{ 'apm__row--used': r.used }">
              <span class="apm__name">{{ r.name }}</span>
              <span class="apm__tag">{{ r.used ? 'Used' : r.free ? 'Free' : '1 act' }}</span>
              <span class="apm__sub">Pick an ally: they get advantage</span>
            </summary>
            <ul class="apm__list apm__oa">
              <li v-for="a in allies" :key="a.id">
                <button
                  type="button"
                  class="apm__row"
                  :aria-disabled="!canEdit || r.used || r.blocked || undefined"
                  :aria-label="`Help ${a.name}`"
                  @click="canEdit && !r.used && !r.blocked && help(a.id)"
                >
                  <span class="apm__name">{{ a.name }}</span>
                  <span class="apm__sub">Helped: advantage on their next roll</span>
                </button>
              </li>
              <li v-if="r.used">
                <button
                  type="button"
                  class="apm__row"
                  :aria-disabled="!canEdit || undefined"
                  @click="canEdit && toggleReaction(r.name)"
                >
                  <span class="apm__name">Undo Help</span>
                </button>
              </li>
            </ul>
          </details>
          <button
            v-else
            type="button"
            class="apm__row"
            :class="{ 'apm__row--used': r.used }"
            :aria-pressed="r.used"
            :aria-disabled="!canEdit || r.blocked || undefined"
            :aria-label="`Mark ${r.name} used, ${r.free ? 'free' : '1 action'}${r.blocked ? '. No actions left' : ''}`"
            :aria-describedby="`${uid}-r${k}`"
            :title="r.desc"
            @click="canEdit && !r.blocked && toggleReaction(r.name)"
          >
            <span class="apm__name">{{ r.name }}</span>
            <span class="apm__tag">{{ r.used ? 'Used' : r.free ? 'Free' : '1 act' }}</span>
            <span :id="`${uid}-r${k}`" class="sr-only">{{ r.desc }}</span>
          </button>
        </li>
        <li v-for="s in reactionSpells" :key="`spell-${s.name}`">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || !!s.blocked || undefined"
            :aria-label="`Cast ${s.name} as a reaction, ${s.cost}${s.blocked ? `. ${s.blocked}` : ''}`"
            :title="`${s.cast}. ${s.desc}`"
            @click="canEdit && !s.blocked && cast(s)"
          >
            <span class="apm__name">{{ s.name }}</span>
            <span class="apm__tag">{{ s.cost }}</span>
            <span class="apm__sub" :class="{ 'apm__sub--warn': s.blocked }">
              {{ s.blocked || s.trigger }}
            </span>
          </button>
        </li>
      </ul>
    </details>

    <details
      v-if="sheet.turnActive && (abilityRows.length || effectRows.length || otherActions.length)"
      name="action-panel"
      class="apm__menu"
    >
      <summary>
        <span>Abilities</span>
        <UiHelp
          label="About abilities"
          text="Ability actions and limited-use abilities. Use pays the actions (and mana); limited uses refill when your turn starts, on New encounter or on a Safe Rest."
        />
        <small>{{ abilityRows.length + otherActions.length }}</small>
      </summary>
      <ul class="apm__list">
        <li v-for="(a, n) in otherActions" :key="a.key">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || a.short || undefined"
            :aria-label="`Use ${a.name}, ${a.costText}${a.why ? `. ${a.why}` : ''}`"
            :aria-describedby="`${uid}-x${n}`"
            :title="a.desc"
            @click="canEdit && !a.short && a.use()"
          >
            <span class="apm__name">{{ a.name }}</span>
            <span class="apm__tag">{{ a.costText }}</span>
            <span v-if="a.why" class="apm__sub apm__sub--warn">{{ a.why }}</span>
            <span :id="`${uid}-x${n}`" class="sr-only">{{ a.desc }}</span>
          </button>
        </li>
        <li v-for="e in effectRows" :key="e.source">
          <button
            type="button"
            class="apm__row"
            :class="{ 'apm__row--used': e.on }"
            :aria-pressed="e.on"
            :aria-disabled="!canEdit || (!e.on && !!e.cost && e.cost.left < 1) || undefined"
            @click="canEdit && (e.on ? stopEffect(e.source) : useEffect(e.source))"
          >
            <span class="apm__name">{{ e.source }}</span>
            <span class="apm__tag">{{
              e.on ? 'End' : e.cost ? `${e.cost.left} left` : 'Use'
            }}</span>
            <span class="apm__sub">{{ e.until }}</span>
          </button>
        </li>
        <li v-for="(a, n) in abilityRows" :key="a.id">
          <button
            type="button"
            class="apm__row"
            :aria-disabled="!canEdit || a.off || undefined"
            :aria-label="`Use ${a.title}${a.label ? ` (${a.label})` : ''}, ${a.left} of ${a.max} left`"
            :aria-describedby="`${uid}-a${n}`"
            :title="a.desc"
            @click="canEdit && !a.off && spend(a.counter, a.name, 1)"
          >
            <span class="apm__name">{{ a.title }}</span>
            <span class="apm__tag">{{ a.left }}/{{ a.max }}</span>
            <span v-if="a.label || a.warn" class="apm__sub" :class="{ 'apm__sub--warn': a.warn }">
              {{ [a.warn, a.label].filter(Boolean).join(' · ') }}
            </span>
            <span :id="`${uid}-a${n}`" class="sr-only">{{ a.desc }}</span>
          </button>
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped lang="scss">
.apm {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.apm__head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}

.apm__who {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;

  strong {
    font-family: var(--font-heading);
    font-size: 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.apm__icon {
  width: 32px;
  min-width: 32px;
  min-height: 32px;
  font-size: 18px;
}

.apm__note {
  font-size: 12px;
  color: var(--page-muted);
}

.apm__menu {
  border: 1px solid var(--line);
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);

  > summary {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 10px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::after {
      content: '▾';
      font-size: 12px;
      color: var(--page-muted);

      @media (prefers-reduced-motion: no-preference) {
        transition: rotate 0.15s;
      }
    }

    &:focus-visible {
      outline-offset: -2px;
    }

    small {
      margin-left: auto;
      font-size: 12px;
      font-weight: 600;
      color: var(--page-muted);
      font-variant-numeric: tabular-nums;
    }
  }

  &[open] {
    border-color: var(--accent);

    > summary::after {
      rotate: 180deg;
    }
  }
}

.apm__group + .apm__group {
  margin-top: 4px;
}

.apm__split.apm__member {
  flex-wrap: wrap;
  padding-bottom: 4px;

  .apm__row {
    flex: 1 1 100%;
  }

  .apm__alt {
    flex: 1 1 0;
    min-width: 0;
    min-height: 30px;
  }
}

.apm__row:has(> .apm__avatar) {
  grid-template-columns: auto 1fr auto;
}

.apm__spell {
  > summary {
    list-style: none;
    cursor: pointer;

    &::-webkit-details-marker {
      display: none;
    }
  }

  &[open] > summary {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
}

.apm__oa {
  margin: 2px 0 6px 10px;
}

.apm__tier {
  margin: 4px 0 0 8px;

  > summary {
    padding: 2px 0;
    cursor: pointer;
  }
}

.apm__spell-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 8px 10px;

  small {
    font-size: 11px;
    color: var(--page-muted);
  }

  p {
    font-size: 12px;
    line-height: 1.45;
    color: var(--page-soft);
  }
}

.apm__caps {
  padding: 4px 10px 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.apm__init {
  font-size: 11px;
  font-weight: 700;
  color: var(--page-soft);
  white-space: nowrap;
}

.apm__situation {
  padding: 4px 8px 6px;
}

.apm__list {
  list-style: none;
  margin: 0;
  padding: 0 4px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.apm__split {
  display: flex;
  gap: 2px;

  .apm__row {
    flex: 1;
    min-width: 0;
  }
}

.apm__row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0 8px;
  width: 100%;
  min-height: 36px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--page-text);
  text-align: left;
  font-size: 13px;

  &:hover:not([aria-disabled='true']) {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }

  &:focus-visible {
    outline-offset: -2px;
  }

  // Unavailable rows stay readable and focusable; the sub line says why.
  &[aria-disabled='true'] {
    cursor: not-allowed;

    .apm__name {
      color: var(--page-soft);
    }

    .apm__tag {
      color: var(--page-muted);
    }
  }

  &--used .apm__name {
    text-decoration: line-through;
    color: var(--page-muted);
  }
}

.apm__name {
  font-weight: 600;
  // Two lines at most, so long names stay whole in the narrow panel.
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.apm__tag {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.apm__sub {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--page-soft);

  &:empty {
    display: none;
  }

  &--warn {
    font-weight: 600;
    color: var(--page-text);
  }
}

.apm__alt {
  min-width: 56px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--page-soft);
  font-size: 12px;
  font-weight: 700;

  &:focus-visible {
    outline-offset: -2px;
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
    color: var(--page-muted);
    border-style: dashed;
  }
}

.apm__steps {
  display: flex;
  align-items: center;
  gap: 6px;
}

.apm__entry {
  padding: 4px 8px;
}

.apm__dead {
  color: var(--danger);
  font-size: 0.85em;
}

.apm__own {
  justify-content: flex-start;
  gap: 8px;
  min-height: 28px;
  font-size: 12px;
  color: var(--page-muted);

  :deep(.switch__label) {
    white-space: nowrap;
  }
}

.apm__menu--off {
  opacity: 0.55;

  > summary {
    cursor: not-allowed;
  }
}

.apm__vitals {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;

  > div {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--field);

    &.is-low dd {
      color: var(--danger, #e2735f);
    }
  }

  dt {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  dd {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;

    small {
      font-family: var(--font-body, inherit);
      font-size: 11px;
      font-weight: 600;
      color: var(--page-muted);
    }
  }

  .apm__temp {
    color: var(--secondary);
  }
}

.apm__vitals > .apm__armor {
  flex: 0 0 auto;

  dd {
    position: relative;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    fill: color-mix(in srgb, var(--accent) 12%, transparent);
    stroke: color-mix(in srgb, var(--accent) 55%, transparent);
    stroke-width: 1.2;
  }

  span {
    position: relative;
    margin-top: -3px;
    font-size: 17px;
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--accent-text);
  }
}

.apm__vitals > .apm__hp {
  flex: 2 1 auto;
}

.apm__hp dd {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.apm__vitals dt {
  white-space: nowrap;
}

.apm__hp-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--page-text);
  font-size: 14px;
  line-height: 1;
}

.apm__offturn {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--inset);
  font-size: 12px;
  color: var(--page-soft);
}

.apm__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.apm__action {
  flex: none;
  width: var(--pip, 34px);
  height: var(--pip, 34px);
  padding: 0;
  border-radius: 50%;
  font-weight: 700;
  font-size: calc(var(--pip, 34px) * 0.38);
  background: transparent;
  color: var(--page-muted);
  border: 2px dashed var(--line-strong);

  &.on {
    background: var(--secondary);
    color: var(--on-secondary);
    border: 2px solid var(--secondary);
  }

  &.extra.on {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }

  &--add {
    border-style: solid;
    color: var(--page-soft);
  }
}

.apm__left {
  margin-left: 4px;
  font-size: 13px;
  white-space: nowrap;
}

.apm__step {
  min-width: 36px;
  font-size: 14px;
}

.apm__empty {
  padding: 4px 10px 10px;
  font-size: 12px;
  color: var(--page-muted);
}

.apm__turn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.apm__casting {
  font-size: 12px;
  font-weight: 600;
  color: var(--page-text);
}

.apm__result {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--inset, var(--field));
  font-size: 12px;
  line-height: 1.45;
  color: var(--page-soft);

  // Stays rendered while empty (a live region that appears later may not be read).
  &--empty {
    margin-top: -8px;
    padding: 0;
    background: none;
  }
}

@media (any-pointer: coarse) {
  .apm__row,
  .apm__alt,
  .apm__menu > summary {
    min-height: 44px;
  }

  .apm__icon {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
