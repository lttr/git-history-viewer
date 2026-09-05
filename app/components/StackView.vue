<script setup lang="ts">
// The Stack layout: outline + document. It replaces the classic 3-pane grid so
// the walkthrough gets the full width; `Esc` / `Diff` returns, and the URL keeps
// review=1 so the classic state is exactly where it was left.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useViewerStore } from '~/stores/viewer'
import { helpOpen } from '~/stores/ui'

const store = useViewerStore()
const docEl = ref<HTMLElement | null>(null)
const currentGroup = ref('')
const focusIndex = ref(-1)
const elapsed = ref(0)

const groups = computed(() => store.stack?.groups ?? [])
const fileCount = computed(() => {
  const set = new Set<string>()
  for (const g of groups.value) for (const i of g.items) set.add(i.path)
  return set.size
})

// Flat item list backing j/k; keys are what the DOM nodes carry.
interface FlatItem { key: string; groupId: string; path: string; line?: number }
const flatItems = computed<FlatItem[]>(() =>
  groups.value.flatMap((g) =>
    g.items.map((i) => ({
      key: `${g.id}:${i.path}`,
      groupId: g.id,
      path: i.path,
      line: i.hunks[0]?.newStart,
    })),
  ),
)

function itemEl(key: string) {
  return docEl.value?.querySelector<HTMLElement>(`[data-stack-item="${CSS.escape(key)}"]`) ?? null
}
function groupHeadEl(id: string) {
  return docEl.value?.querySelector<HTMLElement>(`[data-group-head="${CSS.escape(id)}"]`) ?? null
}

function focusItem(next: number) {
  const items = flatItems.value
  if (!items.length) return
  const idx = Math.max(0, Math.min(items.length - 1, next))
  focusIndex.value = idx
  const el = itemEl(items[idx].key)
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el?.focus({ preventScroll: true })
}

function stepGroup(delta: number) {
  const list = groups.value
  if (!list.length) return
  let idx = list.findIndex((g) => g.id === currentGroup.value)
  if (idx < 0) idx = 0
  const next = Math.max(0, Math.min(list.length - 1, idx + delta))
  scrollToGroup(list[next].id)
}

function scrollToGroup(id: string) {
  groupHeadEl(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  currentGroup.value = id
  const first = flatItems.value.findIndex((i) => i.groupId === id)
  if (first >= 0) focusIndex.value = first
}

function openFocused() {
  const item = flatItems.value[focusIndex.value]
  if (item) store.openStackHunk(item.path, item.line)
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.metaKey || e.ctrlKey || e.altKey || helpOpen.value) return
  const key = e.key
  if (key === 'Escape') { e.preventDefault(); store.closeStack(); return }
  if (key === 'Enter') { e.preventDefault(); openFocused(); return }
  if (key === ']') { e.preventDefault(); stepGroup(1); return }
  if (key === '[') { e.preventDefault(); stepGroup(-1); return }
  if (key === 'j') { e.preventDefault(); focusItem(focusIndex.value + 1); return }
  if (key === 'k') { e.preventDefault(); focusItem(focusIndex.value - 1) }
}

// Scroll spy: the topmost group header still above the fold wins.
let observer: IntersectionObserver | null = null
function observeGroups() {
  observer?.disconnect()
  if (!docEl.value) return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const id = (entry.target as HTMLElement).dataset.groupHead
        if (id) currentGroup.value = id
      }
    },
    { root: docEl.value, rootMargin: '0px 0px -70% 0px', threshold: 0 },
  )
  for (const el of docEl.value.querySelectorAll('[data-group-head]')) observer.observe(el)
}

watch(() => groups.value.length, () => {
  if (!currentGroup.value && groups.value[0]) currentGroup.value = groups.value[0].id
  requestAnimationFrame(observeGroups)
})

let timer: ReturnType<typeof setInterval> | null = null
watch(() => store.stackStatus, (status) => {
  if (timer) { clearInterval(timer); timer = null }
  if (status !== 'loading') return
  elapsed.value = 0
  timer = setInterval(() => {
    elapsed.value = Math.round((Date.now() - store.stackStartedAt) / 1000)
  }, 1000)
}, { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', onKey)
  requestAnimationFrame(observeGroups)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  observer?.disconnect()
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="stack">
    <div class="head">
      <div class="head-line">
        <span class="crumb">
          Stack · {{ store.range }} · {{ fileCount }} files · {{ groups.length }} groups
          <span v-if="store.stack?.truncated" class="tag">partial</span>
          <span v-if="store.stackStatus === 'loading'" class="tag live">
            grouping… {{ elapsed }}s
          </span>
        </span>
        <div class="head-actions">
          <button
            :disabled="store.stackStatus === 'loading'"
            title="Regenerate the stack"
            @click="store.buildStack({ force: true })"
          >
            ↻ Regenerate
          </button>
          <button title="Back to the classic diff (Esc)" @click="store.closeStack()">Diff</button>
        </div>
      </div>
      <h1 v-if="store.stack?.title" class="stack-title">{{ store.stack.title }}</h1>
      <p v-if="store.stack?.summary" class="stack-summary">{{ store.stack.summary }}</p>
      <p v-if="store.stackError" class="stack-error">{{ store.stackError }}</p>
    </div>

    <div class="body">
      <nav class="outline">
        <button
          v-for="(g, i) in groups"
          :key="g.id"
          class="outline-row"
          :class="{ on: g.id === currentGroup }"
          @click="scrollToGroup(g.id)"
        >
          <span class="o-num">{{ i + 1 }}</span>
          <span class="o-title">{{ g.title }}</span>
          <span class="o-count">{{ g.items.length }}</span>
        </button>
      </nav>

      <div ref="docEl" class="document">
        <StackGroup
          v-for="(g, i) in groups"
          :key="g.id"
          :group="g"
          :index="i"
          @open="(path, line) => store.openStackHunk(path, line)"
        />
        <div v-if="store.stackStatus === 'loading'" class="pending">Grouping the rest…</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--bg);
}
.head {
  flex: 0 0 auto;
  padding: 8px 16px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
}
.head-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.crumb { font-size: 12px; color: var(--fg-dim); }
.tag {
  margin-left: 6px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg-3);
  color: var(--yellow);
}
.tag.live { color: var(--accent); }
.head-actions { display: flex; gap: 6px; flex-shrink: 0; }
.stack-title {
  margin: 6px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fg);
}
.stack-summary { margin: 3px 0 0; font-size: 12px; color: var(--fg-dim); }
.stack-error { margin: 6px 0 0; font-size: 12px; color: var(--red); }

.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px 1fr;
}
.outline {
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 8px 0;
  background: var(--bg-2);
}
.outline-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  padding: 6px 12px;
  color: var(--fg-dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.outline-row:hover { color: var(--fg); background: var(--bg-3); }
.outline-row.on { color: var(--fg); border-left-color: var(--accent); background: var(--bg-3); }
.o-num { font-family: var(--mono); font-size: 11px; min-width: 12px; }
.o-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.o-count { font-size: 10px; color: #707a8c; }

.document {
  overflow-y: auto;
  padding-bottom: 40vh;
}
.pending { padding: 16px 20px; color: var(--fg-dim); font-size: 12px; }
</style>
