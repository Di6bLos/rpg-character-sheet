<script setup lang="ts" generic="T extends object">
// Generic add/remove/edit grid for the list-shaped parts of a sheet
// (weapons, inventory, feats…). Columns describe each field of a row.
export interface ListColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'checkbox' | 'select' | 'textarea'
  options?: string[]
  width?: string
}

const props = defineProps<{
  title: string
  addLabel: string
  columns: ListColumn[]
  blank: () => T
  fixed?: boolean
}>()

const rows = defineModel<T[]>({ required: true })
const uid = useId()

function cell(row: T, key: string) {
  return (row as Record<string, unknown>)[key]
}

function setCell(row: T, column: ListColumn, event: Event) {
  const target = event.target as HTMLInputElement
  const record = row as Record<string, unknown>
  if (column.type === 'checkbox') record[column.key] = target.checked
  else if (column.type === 'number') record[column.key] = Number(target.value) || 0
  else record[column.key] = target.value
}

const template = computed(() =>
  [...props.columns.map((c) => c.width ?? 'minmax(0, 1fr)'), props.fixed ? '' : '44px']
    .filter(Boolean)
    .join(' '),
)
</script>

<template>
  <fieldset class="list-editor">
    <legend>{{ title }}</legend>
    <div class="list-editor__scroll">
      <div class="list-editor__grid" :style="{ gridTemplateColumns: template }">
        <template v-if="rows.length">
          <span v-for="col in columns" :key="col.key" class="list-editor__head">{{
            col.label
          }}</span>
          <span v-if="!fixed" />
        </template>
        <template v-for="(row, index) in rows" :key="index">
          <template v-for="col in columns" :key="col.key">
            <label v-if="col.type === 'checkbox'" class="list-editor__check">
              <input
                type="checkbox"
                :checked="cell(row, col.key) === true"
                :aria-label="`${col.label}, row ${index + 1}`"
                @change="setCell(row, col, $event)"
              />
            </label>
            <select
              v-else-if="col.type === 'select'"
              class="input"
              :value="cell(row, col.key)"
              :aria-label="`${col.label}, row ${index + 1}`"
              @change="setCell(row, col, $event)"
            >
              <option v-for="opt in col.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <textarea
              v-else-if="col.type === 'textarea'"
              class="input list-editor__area"
              rows="2"
              :value="String(cell(row, col.key) ?? '')"
              :aria-label="`${col.label}, row ${index + 1}`"
              @input="setCell(row, col, $event)"
            />
            <input
              v-else
              :id="`${uid}-${index}-${col.key}`"
              class="input"
              :type="col.type === 'number' ? 'number' : 'text'"
              :value="cell(row, col.key)"
              :aria-label="`${col.label}, row ${index + 1}`"
              @input="setCell(row, col, $event)"
            />
          </template>
          <button
            v-if="!fixed"
            type="button"
            class="step"
            :aria-label="`Remove row ${index + 1} from ${title}`"
            @click="rows.splice(index, 1)"
          >
            ×
          </button>
        </template>
      </div>
    </div>
    <button v-if="!fixed" type="button" class="btn-dashed" @click="rows.push(blank())">
      + {{ addLabel }}
    </button>
  </fieldset>
</template>

<style scoped lang="scss">
.list-editor {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;

  legend {
    padding: 0;
    margin-bottom: 10px;
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 600;
  }
}

.list-editor__scroll {
  overflow-x: auto;
  padding: 2px;
}

.list-editor__grid {
  display: grid;
  gap: 8px;
  align-items: start;
  min-width: min(560px, 200%);
}

.list-editor__head {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.list-editor__check {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;

  input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
}

.list-editor__area {
  min-height: 44px;
}
</style>
