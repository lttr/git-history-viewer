<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useViewerStore } from '~/stores/viewer'

const store = useViewerStore()

onMounted(() => {
  store.loadMore()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  const shift = e.shiftKey
  if (e.key === 'j' || e.key === 'k') {
    e.preventDefault()
    if (shift) stepFile(e.key === 'j' ? 1 : -1)
    else stepCommit(e.key === 'j' ? 1 : -1)
  }
}

function stepCommit(delta: number) {
  if (!store.commits.length) return
  const idx = store.commits.findIndex((c) => c.hash === store.selectedSha)
  const next = Math.max(0, Math.min(store.commits.length - 1, idx + delta))
  const target = store.commits[next]
  if (target && target.hash !== store.selectedSha) store.selectCommit(target.hash)
}

function stepFile(delta: number) {
  const files = store.commitDetail?.files ?? []
  if (!files.length) return
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
