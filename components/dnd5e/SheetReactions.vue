<script setup lang="ts">
// The 5e sheet's Reactions, a panel of their own as on the Nimble and PF2e sheets: the
// Opportunity Attack (one melee attack when a creature leaves your reach, SRD 5.2.1 p. 15),
// reaction spells (Shield, Counterspell, Hellish Rebuke…) cast through useDnd5eCasting, and the
// hero's reaction features, feats and options (Uncanny Dodge, Parry, Riposte, Sentinel…). One
// Reaction a round, back at the start of your turn. Results nothing else claims show here.
import type { Dnd5eSheet } from '~/types/sheets'
import { showOutcome, sign } from '~/utils/dice'
import { rollAttack5e, weaponAttack, weaponDef } from '~/utils/dnd5eAttacks'
import { costWhy, payCost } from '~/utils/dnd5ePlay'
import { levelName } from '~/utils/dnd5eSpells'
import { tipText } from '~/utils/ruleTips'

const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim, resultFor, unclaimed } = useResultOwner()
const { data, columns, entries, target, attackMode } = useDnd5eSheet()
const casting = useDnd5eCasting()
const typed = useTypedRoll()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const ready = computed(() => sheet.value.turn?.reaction !== false)

const melee = computed(() =>
  sheet.value.weapons
    .map((w, i) => ({ w, i, def: weaponDef(w, data.value?.weapons ?? []) }))
    .filter((x) => (x.def ? x.def.type === 'Melee' : !/\d+\s*\/\s*\d+/.test(x.w.range))),
)
const picked = ref(0)
const oaWhy = computed(() =>
  melee.value.length ? costWhy(sheet.value, 'reaction') : 'No melee weapon',
)

function opportunity() {
  const m = melee.value[picked.value] ?? melee.value[0]
  if (!canEdit.value || !m || oaWhy.value) return
  const plan = weaponAttack(sheet.value, level.value, m.w, m.def, {
    key: 'rea:oa',
    target: target.value,
    columns: columns.value,
  })
  typed.run('rea:oa', 'Opportunity Attack', () => {
    payCost(sheet.value, level.value, 'reaction')
    const r = rollAttack5e(
      sheet.value,
      { ...plan, name: `Opportunity Attack (${m.w.name})` },
      {
        mode: attackMode.value,
        target: target.value,
      },
    )
    claim('rea:oa', () => say(r.line))
    showOutcome({ label: 'Opportunity Attack', total: r.damage, detail: r.line })
  })
  attackMode.value = 'normal'
}

const spells = computed(() =>
  casting.spells.value.filter((r) => !r.book && casting.defOf(r.slug)?.activation === 'reaction'),
)
const own = computed(() => entries.value.filter((e) => e.cost === 'reaction'))
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="rea-h">
    <UiFold name="Reactions" :open="!sheet.turn?.active" />
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="rea-h">Reactions</h2>
        <UiHelp
          label="About reactions"
          text="One Reaction a round, on any turn, when its trigger happens; it comes back at the start of your turn (SRD 5.2.1 p. 13). Using one here, a reaction spell, Uncanny Dodge beside Hit points or an Opportunity Attack spends it; the Turn panel's ↺ shows it and gives it back."
        />
      </div>
      <span class="small" :class="ready ? 'rea-ready' : 'muted'">{{
        ready ? 'Reaction ready' : 'Reaction used'
      }}</span>
    </div>
    <div class="rows">
      <div class="tile attack">
        <div class="stack" style="gap: 2px">
          <strong style="font-size: 15px">Opportunity Attack</strong>
          <span class="small muted"
            >One melee attack when a creature you can see leaves your reach.</span
          >
          <Dnd5eCostPill cost="reaction" />
        </div>
        <select
          v-if="melee.length > 1"
          v-model.number="picked"
          class="input input--sm"
          aria-label="Weapon for the Opportunity Attack"
        >
          <option v-for="(m, k) in melee" :key="m.i" :value="k">
            {{ m.w.name }}
            {{ sign(weaponAttack(sheet, level, m.w, m.def, { key: 'x' }).test.bonus) }}
          </option>
        </select>
        <button
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit || !!oaWhy"
          @click="opportunity"
        >
          {{ oaWhy || 'Attack' }}
        </button>
        <NimbleDiceEntry
          v-if="typed.prompt('rea:oa')"
          :label="typed.prompt('rea:oa')"
          action="Roll"
          :disabled="!canEdit"
          @submit="typed.submit"
        />
        <p v-if="resultFor('rea:oa')" class="roll-status" role="status">
          {{ resultFor('rea:oa') }}
        </p>
      </div>
      <div v-for="r in spells" :key="r.slug" class="tile attack">
        <div class="stack" style="gap: 2px">
          <strong style="font-size: 15px"
            ><SheetRuleTip
              :title="r.name"
              :text="tipText(casting.defOf(r.slug)?.text ?? casting.defOf(r.slug)?.summary ?? '')"
              >{{ r.name }}</SheetRuleTip
            ></strong
          >
          <span class="small muted"
            >{{ levelName(r.level) }} · {{ casting.defOf(r.slug)?.trigger }}</span
          >
          <Dnd5eCostPill cost="reaction" />
        </div>
        <select
          v-if="casting.options(r).length > 1"
          class="input input--sm"
          :aria-label="`Cast ${r.name} with`"
          :value="casting.option(r)?.key"
          @change="casting.choose(r, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="o in casting.options(r)" :key="o.key" :value="o.key">
            {{ o.label }}{{ o.left !== undefined ? ` (${o.left} left)` : '' }}
          </option>
        </select>
        <button
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit || !!casting.why(r)"
          @click="casting.cast(r)"
        >
          {{ casting.why(r) || 'Cast' }}
        </button>
        <p v-if="resultFor(`spell:${r.slug}`)" class="roll-status" role="status">
          {{ resultFor(`spell:${r.slug}`) }}
        </p>
      </div>
      <Dnd5eEntryCard v-for="e in own" :key="e.key" :entry="e" />
    </div>
    <p v-if="unclaimed" class="roll-status" role="status" aria-live="polite">{{ unclaimed }}</p>
  </section>
</template>

<style scoped lang="scss">
.rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 8px;
  align-items: start;
}

.attack {
  gap: 8px;
  padding: 14px;
}

.rea-ready {
  font-weight: 700;
  color: var(--accent-text);
}
</style>
