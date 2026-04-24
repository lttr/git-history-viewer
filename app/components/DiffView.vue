<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { DiffView, DiffModeEnum } from '@git-diff-view/vue'
import '@git-diff-view/vue/styles/diff-view.css'
import { useViewerStore } from '~/stores/viewer'
import type { FileDiff } from '~/stores/viewer'

const store = useViewerStore()
const scrollEl = ref<HTMLElement | null>(null)
const expanded = ref<Set<string>>(new Set())
const showDeleted = ref<Set<string>>(new Set())

function fileId(path: string) {
  return `diff-${btoa(unescape(encodeURIComponent(path))).replace(/[^a-zA-Z0-9]/g, '')}`
}

function extOf(path: string) {
  const i = path.lastIndexOf('.')
  return i > 0 ? path.slice(i + 1) : ''
}

function diffDataFor(f: FileDiff) {
  return {
    oldFile: { fileName: f.oldPath || f.path, fileLang: extOf(f.path), content: f.oldContent },
    newFile: { fileName: f.path, fileLang: extOf(f.path), content: f.newContent },
    hunks: f.patch ? [f.patch] : [],
  }
}

const mode = computed(() =>
  store.diffMode === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified,
)

const statusColor: Record<string, string> = {
  A: '#bae67e', M: '#ffcc66', D: '#f28779',
  R: '#73d0ff', C: '#d4bfff',
}

function toggleExpanded(path: string) {
  const next = new Set(expanded.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expanded.value = next
}

function toggleDeleted(path: string) {
  const next = new Set(showDeleted.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  showDeleted.value = next
}

let userScrolling = false
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

function scrollToFile(path: string) {
  const container = scrollEl.value
  if (!container) return
  const target = container.querySelector<HTMLElement>(`#${fileId(path)}`)
  if (!target) return
  userScrolling = false
  const top = target.offsetTop - container.offsetTop
  container.scrollTo({ top, behavior: 'smooth' })
}

watch(
  () => store.selectedFile,
  (path) => {
    if (!path || userScrolling) return
    if (store.skipNextScroll) {
      store.skipNextScroll = false
      return
    }
    nextTick(() => scrollToFile(path))
  },
)

watch(
  () => store.selectedSha,
  () => {
    expanded.value = new Set()
    showDeleted.value = new Set()
    nextTick(() => scrollEl.value?.scrollTo({ top: 0 }))
  },
)

let io: IntersectionObserver | null = null
function setupObserver() {
  if (!scrollEl.value) return
  io?.disconnect()
  io = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (!visible) return
      const path = (visible.target as HTMLElement).dataset.path
      if (path && path !== store.selectedFile) {
        userScrolling = true
        store.selectFile(path)
        if (scrollTimeout) clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => { userScrolling = false }, 400)
      }
    },
    { root: scrollEl.value, threshold: [0, 0.25, 0.5], rootMargin: '-20% 0px -60% 0px' },
  )
  for (const el of scrollEl.value.querySelectorAll<HTMLElement>('[data-path]')) {
    io.observe(el)
  }
}

watch(
  () => store.diffs,
  () => nextTick(setupObserver),
)

onMounted(() => nextTick(setupObserver))
onUnmounted(() => io?.disconnect())
</script>

<template>
  <div class="diff-pane">
    <div class="header">
      <span class="path">
        {{ store.commitDetail ? `${store.commitDetail.files.length} files` : '—' }}
        <span v-if="store.selectedFile" class="active-file">· {{ store.selectedFile }}</span>
      </span>
      <button @click="store.toggleDiffMode()">
        {{ store.diffMode === 'split' ? 'Side-by-side' : 'Unified' }}
      </button>
    </div>
    <div ref="scrollEl" class="body">
      <div v-if="store.diffsLoading" class="state">Loading…</div>
      <div v-else-if="!store.diffs" class="state">Select a commit</div>
      <div v-else-if="!store.diffs.files.length" class="state">No files changed</div>
      <template v-else>
        <div v-if="store.commitDetail" class="commit-meta">
          <div class="subject">{{ store.commitDetail.subject }}</div>
          <pre v-if="store.commitDetail.body" class="body-text">{{ store.commitDetail.body }}</pre>
          <div class="meta-row">
            <span class="sha">{{ store.commitDetail.hash }}</span>
            <span class="author">{{ store.commitDetail.author }} &lt;{{ store.commitDetail.email }}&gt;</span>
            <span class="date">{{ new Date(store.commitDetail.date).toLocaleString('cs-CZ') }}</span>
            <span v-if="store.commitDetail.isMerge" class="merge-tag">merge</span>
          </div>
        </div>
        <section
          v-for="f in store.diffs.files"
          :id="fileId(f.path)"
          :key="f.path"
          :data-path="f.path"
          class="file-section"
        >
          <div class="file-header">
            <span class="status" :style="{ color: statusColor[f.status] || 'var(--fg-dim)' }">
              {{ f.status }}
            </span>
            <span class="filename">{{ f.oldPath && f.oldPath !== f.path ? `${f.oldPath} → ${f.path}` : f.path }}</span>
          </div>

          <template v-if="f.status === 'D'">
            <div class="deleted-block">
              <button class="link-btn" @click="toggleDeleted(f.path)">
                {{ showDeleted.has(f.path) ? 'Hide content' : 'Show content' }}
              </button>
            </div>
            <div
              v-if="showDeleted.has(f.path)"
              class="diff-wrap"
              :class="{ truncated: !expanded.has(f.path) }"
            >
              <DiffView
                :data="diffDataFor(f)"
                :diff-view-mode="mode"
                :diff-view-theme="'dark'"
                :diff-view-wrap="false"
                :diff-view-highlight="false"
              />
              <div v-if="!expanded.has(f.path)" class="fade">
                <button class="show-more" @click="toggleExpanded(f.path)">Show more</button>
              </div>
              <div v-else class="collapse-row">
                <button class="show-more" @click="toggleExpanded(f.path)">Show less</button>
              </div>
            </div>
          </template>

          <template v-else-if="f.isBinary">
            <div class="binary">Binary file — diff skipped</div>
          </template>

          <template v-else-if="!f.patch">
            <div class="binary">No changes shown</div>
          </template>

          <template v-else>
            <div class="diff-wrap" :class="{ truncated: !expanded.has(f.path) }">
              <DiffView
                :data="diffDataFor(f)"
                :diff-view-mode="mode"
                :diff-view-theme="'dark'"
                :diff-view-wrap="false"
                :diff-view-highlight="false"
              />
              <div v-if="!expanded.has(f.path)" class="fade">
                <button class="show-more" @click="toggleExpanded(f.path)">Show more</button>
              </div>
              <div v-else class="collapse-row">
                <button class="show-more" @click="toggleExpanded(f.path)">Show less</button>
              </div>
            </div>
          </template>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.diff-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  gap: 8px;
}
.path {
  font-size: 12px;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.active-file {
  font-family: var(--mono);
  color: var(--fg-dim);
  margin-left: 4px;
}
.body {
  flex: 1;
  overflow: auto;
  scroll-behavior: auto;
}
.state {
  padding: 24px;
  color: var(--fg-dim);
  text-align: center;
}
.file-section {
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}
.file-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
}
.file-header .status {
  font-family: var(--mono);
  font-weight: 700;
  font-size: 12px;
  min-width: 14px;
  text-align: center;
}
.file-header .filename {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.binary {
  padding: 16px 24px;
  color: var(--fg-dim);
  font-style: italic;
  font-size: 12px;
}
.deleted-block {
  padding: 10px 16px;
  color: var(--fg-dim);
  font-size: 12px;
}
.link-btn {
  background: transparent;
  border: none;
  color: #ffcc66;
  padding: 0;
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
}
.link-btn:hover { color: var(--fg); background: transparent; }

.diff-wrap {
  position: relative;
}
.diff-wrap.truncated {
  max-height: 70vh;
  overflow: hidden;
}
.fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100px;
  background: linear-gradient(180deg, rgba(13, 17, 23, 0) 0%, var(--bg) 70%);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 12px;
  pointer-events: none;
}
.fade .show-more,
.collapse-row .show-more {
  pointer-events: auto;
}
.collapse-row {
  display: flex;
  justify-content: center;
  padding: 8px 0 12px;
}
.show-more {
  background: var(--bg-3);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 4px 14px;
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}
.show-more:hover { background: var(--border); }

.commit-meta {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  margin-bottom: 8px;
}
.commit-meta .subject {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 8px;
}
.commit-meta .body-text {
  margin: 0 0 12px 0;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg);
  background: var(--bg);
  padding: 10px 12px;
  border-radius: 4px;
  border: 1px solid var(--border);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}
.commit-meta .meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: var(--fg-dim);
  align-items: center;
}
.commit-meta .sha {
  font-family: var(--mono);
  color: #ffcc66;
  user-select: all;
}
.commit-meta .author { color: var(--fg); }
.commit-meta .date { color: var(--fg-dim); }
.commit-meta .merge-tag {
  font-family: var(--mono);
  color: #d4bfff;
  font-size: 11px;
}
.commit-meta .merge-tag::before { content: '◇ '; }
</style>
