<script setup lang="ts">
import { useViewerStore } from '~/stores/viewer'

const store = useViewerStore()

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: '2-digit' })
}
</script>

<template>
  <div class="commit-list">
    <div class="header">Commits ({{ store.commits.length }})</div>
    <div class="scroll">
      <div
        v-for="c in store.commits"
        :key="c.hash"
        class="row"
        :class="{ active: c.hash === store.selectedSha }"
        @click="store.selectCommit(c.hash)"
      >
        <div class="subject">{{ c.subject }}</div>
        <div class="meta">
          <span class="sha">{{ c.shortHash }}</span>
          <span class="author">{{ c.author }}</span>
          <span class="date">{{ fmtDate(c.date) }}</span>
        </div>
      </div>
      <div class="load-more">
        <button v-if="!store.commitsDone" :disabled="store.commitsLoading" @click="store.loadMore()">
          {{ store.commitsLoading ? 'Loading…' : 'Load more' }}
        </button>
        <span v-else class="done">end of history</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.commit-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-2);
  border-right: 1px solid var(--border);
}
.header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  color: var(--fg-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.scroll {
  flex: 1;
  overflow-y: auto;
}
.row {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.row:hover { background: var(--bg-3); }
.row.active { background: var(--bg-3); border-left: 2px solid var(--accent); padding-left: 10px; }
.subject {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--fg-dim);
}
.sha { font-family: var(--mono); color: var(--yellow); }
.author { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.load-more {
  padding: 12px;
  text-align: center;
}
.done {
  color: var(--fg-dim);
  font-size: 11px;
}
</style>
