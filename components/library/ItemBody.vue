<script setup lang="ts">
// The body of one named piece of a Library entry (a feat's benefit, a species trait, a class
// feature): SRD or book text as markdown, or a non-SRD 5e summary with its mechanics as fact
// lines, then its own options one level down.
import type { EntryItem } from '~/utils/libraryDnd5e'
import { loreHtml } from '~/utils/loreText'

defineProps<{ item: EntryItem }>()

const html = (md: string) => loreHtml(md, { headingBase: 5 })
</script>

<template>
  <div class="item-body">
    <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
    <div v-if="item.text" class="item-body__text" v-html="html(item.text)" />
    <p v-if="item.summary" class="item-body__summary">{{ item.summary }}</p>
    <ul v-if="item.facts.length" class="item-body__facts">
      <li v-for="f in item.facts" :key="f">{{ f }}</li>
    </ul>
    <div v-for="o in item.options ?? []" :key="o.name" class="item-body__option">
      <strong>{{ o.name }}</strong>
      <LibraryItemBody :item="o" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.item-body {
  font-size: 15px;
  line-height: 1.6;

  > :last-child {
    margin-bottom: 0;
  }
}

.item-body__text {
  :deep(p),
  :deep(ul),
  :deep(ol),
  :deep(.md-table) {
    margin: 0 0 10px;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 22px;
  }

  :deep(> :last-child) {
    margin-bottom: 0;
  }

  :deep(h5),
  :deep(h6) {
    margin: 14px 0 4px;
    font-size: 15px;
  }
}

.item-body__summary {
  margin: 0 0 8px;
}

.item-body__facts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 8px;
  padding-left: 20px;
  font-size: 14px;
  color: var(--page-soft);
}

.item-body__option {
  margin: 8px 0 0;
  padding-left: 12px;
  border-left: 2px solid var(--line);

  > strong {
    display: block;
    font-size: 14px;
  }
}
</style>
