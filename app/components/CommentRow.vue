<script setup lang="ts">
import { computed } from 'vue'
import type { CommentThread } from '~/types/comments'

const props = defineProps<{ thread: CommentThread; authored?: boolean }>()
const emit = defineEmits<{ navigate: []; edit: []; delete: [] }>()

const anchorLabel = computed(() => {
  const a = props.thread.anchor
  if (!a) return props.thread.commit ? `${props.thread.commit.slice(0, 8)} · commit` : 'General'
  if (a.line == null) return `${a.path} · file`
  const span = a.endLine && a.endLine !== a.line ? `${a.line}-${a.endLine}` : `${a.line}`
  return `${a.path}:${span}${a.side === 'old' ? ' (old)' : ''}`
})

// First non-empty line of the thread's first comment, for a compact preview.
const preview = computed(() => {
  const body = props.thread.comments[0]?.body ?? ''
  return body.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
})
</script>

<template>
  <div class="row" :class="{ resolved: thread.status === 'resolved' }">
    <button class="row-main" :title="anchorLabel" @click="emit('navigate')">
      <span class="dot" :class="thread.status" />
      <span class="anchor">{{ anchorLabel }}</span>
      <span class="badge" :class="authored ? 'authored' : 'loaded'">{{ authored ? 'draft' : 'loaded' }}</span>
      <span class="preview">{{ preview }}</span>
    </button>
    <div v-if="authored" class="row-actions">
      <button class="act" title="Edit comment" @click.stop="emit('edit')">✎</button>
      <button class="act del" title="Remove comment" @click.stop="emit('delete')">✕</button>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--border);
}
.row.resolved { opacity: 0.6; }
.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--fg);
  cursor: pointer;
  text-align: left;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
}
.row-main:hover { background: var(--bg-3); }
.dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffcc66;
}
.dot.resolved { background: #5c6773; }
.anchor {
  flex: 0 0 auto;
  max-width: 45%;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  flex: 0 0 auto;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 8px;
}
.badge.authored { color: #79b8ff; background: rgba(47, 129, 247, 0.14); }
.badge.loaded { color: #707a8c; background: rgba(112, 122, 140, 0.14); }
.preview {
  flex: 1;
  min-width: 0;
  color: var(--fg-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-actions { display: flex; gap: 2px; padding-right: 6px; flex: 0 0 auto; }
.act {
  background: transparent;
  border: none;
  color: #707a8c;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  line-height: 1;
}
.act:hover { color: var(--fg); }
.act.del:hover { color: #f28779; }
</style>
