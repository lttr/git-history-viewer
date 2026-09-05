<script setup lang="ts">
import type { StackGroup as StackGroupData } from '~/types/stack'

defineProps<{ group: StackGroupData; index: number }>()
const emit = defineEmits<{ (e: 'open', path: string, line?: number): void }>()
</script>

<template>
  <section class="group" :data-group-id="group.id">
    <header class="group-head" :data-group-head="group.id">
      <span class="num">{{ index + 1 }}</span>
      <h2 class="title">{{ group.title }}</h2>
      <span class="kind" :class="`kind-${group.kind}`">{{ group.kind }}</span>
    </header>
    <p v-if="group.summary" class="group-summary">{{ group.summary }}</p>

    <div
      v-for="item in group.items"
      :key="item.path"
      class="item"
      :data-stack-item="`${group.id}:${item.path}`"
      tabindex="-1"
    >
      <div class="item-head">
        <button class="path" @click="emit('open', item.path, item.hunks[0]?.newStart)">
          {{ item.path }}
        </button>
        <span v-if="item.note" class="note">· {{ item.note }}</span>
        <span v-if="!item.hunks.length" class="note dim">· no patch shown</span>
      </div>
      <HunkExcerpt
        v-for="h in item.hunks"
        :key="h.id"
        :hunk="h"
        @open="emit('open', item.path, h.newStart)"
      />
    </div>
  </section>
</template>

<style scoped>
.group {
  padding: 18px 20px 6px;
  border-left: 3px solid var(--border);
  scroll-margin-top: 8px;
}
.group-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  scroll-margin-top: 8px;
}
.num {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg-dim);
  min-width: 14px;
}
.title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
}
.kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg-3);
  color: var(--fg-dim);
}
.kind-feat { color: var(--green); }
.kind-fix { color: var(--red); }
.kind-refactor { color: var(--purple); }
.kind-test { color: var(--yellow); }
.kind-docs, .kind-config, .kind-chore { color: var(--fg-dim); }
.group-summary {
  margin: 4px 0 12px 24px;
  font-size: 12px;
  color: var(--fg-dim);
}
.item {
  margin: 0 0 14px 24px;
  border-radius: 5px;
  outline: none;
  scroll-margin-top: 12px;
}
.item:focus-visible, .item.focused { box-shadow: 0 0 0 2px var(--accent); }
.item-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 12px;
}
.path {
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  font-family: var(--mono);
  color: var(--accent);
  cursor: pointer;
}
.path:hover { text-decoration: underline; background: transparent; }
.note { color: var(--fg-dim); }
.note.dim { font-style: italic; }
</style>
