<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useViewerStore } from '~/stores/viewer'
import { helpOpen } from '~/stores/ui'
import { comparePath } from '~/utils/comparePath'

const store = useViewerStore()

watch(
  () => store.selectedSha,
  (sha) => {
    if (!sha) return
    const idx = store.commits.findIndex((c) => c.hash === sha)
    if (idx < 0) return
    const neighbors = [
      store.commits[idx + 1],
      store.commits[idx - 1],
      store.commits[idx + 2],
      store.commits[idx - 2],
    ].filter(Boolean)
    for (const n of neighbors) store.prefetch(n.hash)
  },
)

onMounted(() => {
  store.init()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (helpOpen.value) return
  const key = e.key.toLowerCase()
  if ((key === 'n' || key === 'p') && e.shiftKey) {
    e.preventDefault()
    extendGroup(key === 'n' ? 1 : -1)
    return
  }
  if (e.shiftKey) return
  if (key === 'n' || key === 'p') {
    e.preventDefault()
    stepCommit(key === 'n' ? 1 : -1)
    return
  }
  if (key === 'j' || key === 'k') {
    e.preventDefault()
    stepFile(key === 'j' ? 1 : -1)
  }
}

function stepCommit(delta: number) {
  if (!store.commits.length) return
  const idx = store.commits.findIndex((c) => c.hash === store.selectedSha)
  const next = Math.max(0, Math.min(store.commits.length - 1, idx + delta))
  const target = store.commits[next]
  if (target && target.hash !== store.selectedSha) store.selectCommit(target.hash)
}

function extendGroup(delta: number) {
  if (!store.commits.length) return
  const indices = store.selectedShas
    .map((sha) => store.commits.findIndex((c) => c.hash === sha))
    .filter((i) => i >= 0)
  if (!indices.length) return
  let lo = Math.min(...indices)
  let hi = Math.max(...indices)
  if (delta > 0) hi = Math.min(store.commits.length - 1, hi + 1)
  else lo = Math.max(0, lo - 1)
  const range = store.commits.slice(lo, hi + 1).map((c) => c.hash)
  if (range.length === store.selectedShas.length) return
  store.setMultiSelection(range)
}

function stepFile(delta: number) {
  const raw = store.diffs?.files ?? store.commitDetail?.files ?? []
  if (!raw.length) return
  const files = [...raw].sort((a, b) => comparePath(a.path, b.path))
  const idx = files.findIndex((f) => f.path === store.selectedFile)
  const next = Math.max(0, Math.min(files.length - 1, idx + delta))
  const target = files[next]
  if (target) store.selectFile(target.path)
}
</script>

<template>
  <div class="layout">
    <CommitList class="pane pane-commits" />
    <FileTree class="pane pane-files" />
    <DiffView class="pane pane-diff" />
    <HotkeyHelp />
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 320px 280px 1fr;
  height: 100vh;
  width: 100vw;
}
.pane { height: 100vh; overflow: hidden; min-width: 0; }
</style>
