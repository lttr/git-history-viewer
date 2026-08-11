<script setup lang="ts">
import { computed, ref } from 'vue'
import { useViewerStore } from '~/stores/viewer'
import type { CommentThread } from '~/types/comments'
import { comparePath } from '~/utils/comparePath'

const store = useViewerStore()

// All threads grouped by file (inline + file-level), then a General group for
// PR-level threads. buildCommentIndex already partitions threads this way.
const groups = computed(() => {
  const idx = store.commentIndex
  const out: { path: string; threads: CommentThread[] }[] = []
  for (const path of Object.keys(idx.byPath).sort(comparePath)) {
    const fc = idx.byPath[path]
    const threads = [
      ...fc.fileLevel,
      ...Object.values(fc.byLine.new).flat(),
      ...Object.values(fc.byLine.old).flat(),
    ].sort((a, b) => (a.anchor?.line ?? -1) - (b.anchor?.line ?? -1))
    out.push({ path, threads })
  }
  return out
})

function isDraft(id: string) {
  return store.collect && id.startsWith('draft-')
}

const editingId = ref<string | null>(null)
function saveEdit(id: string, body: string) {
  store.editComment(id, body)
  editingId.value = null
}
</script>

<template>
  <div class="overview">
    <div class="ov-header">
      <span>Comments</span>
      <span class="ov-count">{{ store.commentIndex.total }}</span>
    </div>
    <div v-if="!store.commentIndex.total" class="ov-empty">
      No comments yet. Hover a diff line and click <strong>+</strong> to add one.
    </div>
    <div v-else class="ov-body">
      <template v-for="g in groups" :key="g.path">
        <div class="ov-group">{{ g.path }}</div>
        <template v-for="t in g.threads" :key="t.id">
          <CommentComposer
            v-if="editingId === t.id"
            submit-label="Save"
            :initial-value="t.comments[0]?.body"
            @save="(b) => saveEdit(t.id, b)"
            @cancel="editingId = null"
          />
          <CommentRow
            v-else
            :thread="t"
            :authored="isDraft(t.id)"
            @navigate="store.navigateToComment(t)"
            @edit="editingId = t.id"
            @delete="store.removeComment(t.id)"
          />
        </template>
      </template>
      <template v-for="c in store.commentsByCommit" :key="c.sha">
        <div class="ov-group">{{ c.label }}</div>
        <template v-for="t in c.threads" :key="t.id">
          <CommentComposer
            v-if="editingId === t.id"
            submit-label="Save"
            :initial-value="t.comments[0]?.body"
            @save="(b) => saveEdit(t.id, b)"
            @cancel="editingId = null"
          />
          <CommentRow
            v-else
            :thread="t"
            :authored="isDraft(t.id)"
            @navigate="store.navigateToComment(t)"
            @edit="editingId = t.id"
            @delete="store.removeComment(t.id)"
          />
        </template>
      </template>
      <template v-if="store.commentIndex.reviewLevel.length">
        <div class="ov-group">General</div>
        <template v-for="t in store.commentIndex.reviewLevel" :key="t.id">
          <CommentComposer
            v-if="editingId === t.id"
            submit-label="Save"
            :initial-value="t.comments[0]?.body"
            @save="(b) => saveEdit(t.id, b)"
            @cancel="editingId = null"
          />
          <CommentRow
            v-else
            :thread="t"
            :authored="isDraft(t.id)"
            @navigate="store.navigateToComment(t)"
            @edit="editingId = t.id"
            @delete="store.removeComment(t.id)"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}
.ov-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
}
.ov-count {
  font-size: 11px;
  color: #707a8c;
  background: var(--bg-3);
  padding: 0 7px;
  border-radius: 9px;
}
.ov-empty {
  padding: 16px 14px;
  color: var(--fg-dim);
  font-size: 12px;
  line-height: 1.5;
}
.ov-empty strong { color: #79b8ff; }
.ov-body { flex: 1; overflow: auto; }
.ov-group {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 12px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
