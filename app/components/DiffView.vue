<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DiffView, DiffModeEnum } from '@git-diff-view/vue'
import '@git-diff-view/vue/styles/diff-view.css'
import { useViewerStore } from '~/stores/viewer'

const store = useViewerStore()

interface DiffPayload {
  sha: string
  file: string
  parent?: string
  patch: string
  oldContent: string
  newContent: string
  isBinary: boolean
}

const data = ref<DiffPayload | null>(null)
const loading = ref(false)
const err = ref('')

async function load() {
  if (!store.selectedSha || !store.selectedFile) {
    data.value = null
    return
  }
  loading.value = true
  err.value = ''
  try {
    data.value = await $fetch<DiffPayload>('/api/diff', {
      query: { sha: store.selectedSha, file: store.selectedFile },
    })
  } catch (e: any) {
    err.value = e?.message || 'Failed to load diff'
  } finally {
    loading.value = false
  }
}

watch(
  () => [store.selectedSha, store.selectedFile],
  () => load(),
  { immediate: true },
)

const fileExt = computed(() => {
  const p = store.selectedFile
  const i = p.lastIndexOf('.')
  return i > 0 ? p.slice(i + 1) : ''
})

const diffData = computed(() => {
  if (!data.value || data.value.isBinary) return null
  return {
    oldFile: { fileName: data.value.file, fileLang: fileExt.value, content: data.value.oldContent },
    newFile: { fileName: data.value.file, fileLang: fileExt.value, content: data.value.newContent },
    hunks: data.value.patch ? [data.value.patch] : [],
  }
})

const mode = computed(() =>
  store.diffMode === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified,
)
</script>

<template>
  <div class="diff-pane">
    <div class="header">
      <span class="path">{{ store.selectedFile || '—' }}</span>
      <button @click="store.toggleDiffMode()">
        {{ store.diffMode === 'split' ? 'Side-by-side' : 'Unified' }}
      </button>
    </div>
    <div class="body">
      <div v-if="loading" class="state">Loading…</div>
      <div v-else-if="err" class="state error">{{ err }}</div>
      <div v-else-if="!store.selectedFile" class="state">Select a file</div>
      <div v-else-if="data?.isBinary" class="state">Binary file — diff skipped</div>
      <DiffView
        v-else-if="diffData"
        :data="diffData"
        :diff-view-mode="mode"
        :diff-view-theme="'dark'"
        :diff-view-wrap="false"
        :diff-view-highlight="true"
      />
      <div v-else class="state">No diff available</div>
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
}
.path {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.body {
  flex: 1;
  overflow: auto;
}
.state {
  padding: 24px;
  color: var(--fg-dim);
  text-align: center;
}
.state.error { color: var(--red); }
</style>
