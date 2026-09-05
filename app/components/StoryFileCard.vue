<script setup lang="ts">
// One file inside a story group: collapsed to a peek of its diff, expanded to
// the full patch. Rendering goes through @git-diff-view (same component as the
// classic pane) so the story gets real syntax highlighting; the plain
// HunkExcerpt is only the fallback when the branch diff has no entry for the
// path (binary, or a story loaded without its diff).
import { computed } from 'vue'
import { DiffView, DiffModeEnum } from '@git-diff-view/vue'
import '@git-diff-view/vue/styles/diff-view.css'
import type { StoryItem } from '~/types/story'
import type { FileDiff } from '~/stores/viewer'

const props = defineProps<{
  item: StoryItem
  file?: FileDiff
  expanded: boolean
  wrap: boolean
}>()
const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'open', line?: number): void
}>()

// Above this the diff library gets expensive enough that we make expanding an
// explicit, one-file-at-a-time choice instead of rendering it behind a clip.
const HEAVY_LINE_THRESHOLD = 3000
const HIGHLIGHT_LINE_THRESHOLD = 2000

function countLines(s: string): number {
  if (!s) return 0
  let n = 1
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
  return n
}
function extOf(path: string) {
  const i = path.lastIndexOf('.')
  return i > 0 ? path.slice(i + 1) : ''
}

const stats = computed(() => {
  let add = 0
  let del = 0
  const patch = props.file?.patch ?? ''
  if (patch) {
    for (const line of patch.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) add++
      else if (line.startsWith('-') && !line.startsWith('---')) del++
    }
  } else {
    for (const h of props.item.hunks) {
      for (const line of h.lines) {
        if (line[0] === '+') add++
        else if (line[0] === '-') del++
      }
    }
  }
  return { add, del }
})

const patchLines = computed(() => countLines(props.file?.patch ?? '') - 1)
const heavy = computed(() => patchLines.value > HEAVY_LINE_THRESHOLD)
const highlight = computed(() => {
  const f = props.file
  if (!f) return false
  const lines = Math.max(countLines(f.newContent), countLines(f.oldContent))
  return lines > 0 && lines < HIGHLIGHT_LINE_THRESHOLD
})

// Stable identity per file+mode: the library rebuilds its internal DiffFile
// whenever `data` changes identity, which would reset scroll on every render.
const diffData = computed(() => {
  const f = props.file
  if (!f) return null
  return {
    oldFile: { fileName: f.oldPath || f.path, fileLang: extOf(f.path), content: f.oldContent },
    newFile: { fileName: f.path, fileLang: extOf(f.path), content: f.newContent },
    hunks: f.patch ? [f.patch] : [],
  }
})

const renderDiff = computed(() => !!diffData.value && (props.expanded || !heavy.value))
const firstLine = computed(() => props.item.hunks[0]?.newStart)
const statusColor: Record<string, string> = {
  A: '#bae67e', M: '#ffcc66', D: '#f28779',
  R: '#73d0ff', C: '#d4bfff', '?': '#bae67e',
}
</script>

<template>
  <article class="card" :class="{ open: expanded }">
    <header class="card-head" @click="emit('toggle')">
      <span class="chev">{{ expanded ? '▾' : '▸' }}</span>
      <span class="status" :style="{ color: statusColor[file?.status ?? ''] || 'var(--fg-dim)' }">
        {{ file?.status ?? '·' }}
      </span>
      <span class="path">{{ item.path }}</span>
      <span class="stats">
        <span class="add">+{{ stats.add }}</span>
        <span class="del">−{{ stats.del }}</span>
      </span>
      <button
        class="jump"
        title="Open in the classic diff"
        @click.stop="emit('open', firstLine)"
      >↗</button>
    </header>
    <p v-if="item.note" class="note">{{ item.note }}</p>

    <div v-if="renderDiff && diffData" class="diff-wrap" :class="{ peek: !expanded }">
      <DiffView
        :data="diffData"
        :diff-view-mode="DiffModeEnum.Unified"
        :diff-view-theme="'dark'"
        :diff-view-wrap="wrap"
        :diff-view-highlight="highlight"
      />
      <div v-if="!expanded" class="fade" />
    </div>
    <div v-else-if="diffData" class="heavy">
      <button class="link-btn" @click="emit('toggle')">
        Large diff ({{ patchLines }} lines) — click to render
      </button>
    </div>
    <div v-else class="fallback">
      <HunkExcerpt
        v-for="h in item.hunks"
        :key="h.id"
        :hunk="h"
        @open="emit('open', h.newStart)"
      />
      <p v-if="!item.hunks.length" class="empty">no patch shown</p>
    </div>

    <button
      v-if="renderDiff"
      class="toggle"
      @click="emit('toggle')"
    >
      {{ expanded ? 'Collapse' : 'Expand full diff' }}
    </button>
  </article>
</template>

<style scoped>
.card {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-2);
  overflow: hidden;
  scroll-margin: 12px;
}
.card:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--accent); }
.card.open { border-color: #3c4657; }
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}
.card-head:hover { background: var(--bg-3); }
.chev { color: var(--fg-dim); width: 10px; }
.status { font-family: var(--mono); font-size: 11px; width: 10px; }
.path {
  flex: 1;
  font-family: var(--mono);
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}
.stats { font-family: var(--mono); font-size: 11px; display: flex; gap: 6px; }
.stats .add { color: var(--green); }
.stats .del { color: var(--red); }
.jump {
  background: transparent;
  border: none;
  color: var(--fg-dim);
  cursor: pointer;
  font: inherit;
  padding: 0 2px;
}
.jump:hover { color: var(--accent); background: transparent; }
.note {
  margin: 0;
  padding: 0 10px 6px 28px;
  font-size: 11px;
  color: var(--fg-dim);
}
.diff-wrap { position: relative; border-top: 1px solid var(--border); }
.diff-wrap.peek { max-height: 156px; overflow: hidden; }
.fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 46px;
  pointer-events: none;
  /* the peek clips mid-line; fade over the diff's own plain background */
  background: linear-gradient(to bottom, transparent, #1f2430 85%);
}
.heavy, .fallback { padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
.empty { margin: 0; font-size: 11px; font-style: italic; color: var(--fg-dim); }
.link-btn, .toggle {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-top: 1px solid var(--border);
  padding: 4px 10px;
  color: var(--fg-dim);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.link-btn { border-top: none; }
.toggle:hover, .link-btn:hover { color: var(--accent); background: var(--bg-3); }
</style>
