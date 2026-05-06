<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useViewerStore } from '~/stores/viewer'

const store = useViewerStore()
const scrollEl = ref<HTMLElement | null>(null)

watch(
  () => store.selectedSha,
  (sha) => {
    if (!sha) return
    nextTick(() => {
      const el = scrollEl.value?.querySelector<HTMLElement>(`[data-sha="${sha}"]`)
      el?.scrollIntoView({ block: 'nearest' })
    })
  },
)

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('cs-CZ')
}

function onClick(e: MouseEvent, sha: string) {
  if (e.shiftKey) {
    e.preventDefault()
    store.extendSelectionTo(sha)
  } else if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    store.toggleCommit(sha)
  } else {
    store.selectCommit(sha)
  }
}

function isSelected(hash: string) {
  return store.selectedShas.includes(hash)
}

function selectChanges(kind: 'staged' | 'unstaged') {
  store.selectChanges(kind)
}
function refreshChanges(e: MouseEvent, kind: 'staged' | 'unstaged') {
  e.stopPropagation()
  if (store.selectedChanges === kind) store.selectChanges(kind)
  else store.refreshChanges()
}
</script>

<template>
  <div class="commit-list">
    <RangeBar />
    <div ref="scrollEl" class="scroll">
      <div
        v-if="store.changesSummary.unstaged > 0"
        class="row ch-row"
        :class="{ active: store.selectedChanges === 'unstaged', primary: store.selectedChanges === 'unstaged' }"
        @click="selectChanges('unstaged')"
      >
        <div class="subject">
          <span class="ch-dot unstaged" />
          Unstaged changes
        </div>
        <div class="meta">
          <span class="ch-tag">working tree</span>
          <span class="ch-count">{{ store.changesSummary.unstaged }} file{{ store.changesSummary.unstaged === 1 ? '' : 's' }}</span>
          <button class="ch-refresh" title="Refresh" @click="refreshChanges($event, 'unstaged')">↻</button>
        </div>
      </div>
      <div
        v-if="store.changesSummary.staged > 0"
        class="row ch-row"
        :class="{ active: store.selectedChanges === 'staged', primary: store.selectedChanges === 'staged' }"
        @click="selectChanges('staged')"
      >
        <div class="subject">
          <span class="ch-dot staged" />
          Staged changes
        </div>
        <div class="meta">
          <span class="ch-tag">index</span>
          <span class="ch-count">{{ store.changesSummary.staged }} file{{ store.changesSummary.staged === 1 ? '' : 's' }}</span>
          <button class="ch-refresh" title="Refresh" @click="refreshChanges($event, 'staged')">↻</button>
        </div>
      </div>
      <div
        v-for="c in store.commits"
        :key="c.hash"
        class="row"
        :class="{ active: isSelected(c.hash), primary: c.hash === store.selectedSha }"
        :data-sha="c.hash"
        @click="onClick($event, c.hash)"
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
.row.active { background: var(--bg-3); border-left: 2px solid #ffcc66; padding-left: 10px; }
.row.primary { background: var(--bg-3); box-shadow: inset 2px 0 0 #ffcc66; }
.subject {
  font-weight: 600;
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
.sha { font-family: var(--mono); color: #ffcc66; }
.author { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg); }
.date { color: var(--fg-dim); }
.load-more {
  padding: 12px;
  text-align: center;
}
.done {
  color: var(--fg-dim);
  font-size: 11px;
}
.ch-row {
  background: var(--bg);
}
.ch-row .subject {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ch-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.ch-dot.unstaged { background: #f28779; }
.ch-dot.staged { background: #bae67e; }
.ch-tag {
  font-family: var(--mono);
  color: #73d0ff;
}
.ch-count {
  flex: 1;
  color: var(--fg-dim);
}
.ch-refresh {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--fg-dim);
  font-size: 11px;
  width: 20px;
  height: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.ch-refresh:hover { color: var(--fg); border-color: var(--fg-dim); }
</style>
