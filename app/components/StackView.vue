<script setup lang="ts">
// The Stack layout, read as a story: the left column is the model's narrative
// (one card per group, scrolled top to bottom), the right column is the files
// that group touches — collapsed to a peek of their diff, expanded on click.
// `Esc` / `Diff` returns to the classic pane with review=1 intact.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useViewerStore } from '~/stores/viewer'
import { helpOpen } from '~/stores/ui'
import type { FileDiff } from '~/stores/viewer'

const store = useViewerStore()
const storyEl = ref<HTMLElement | null>(null)
const filesEl = ref<HTMLElement | null>(null)
const currentGroup = ref('')
const focusIndex = ref(0)
const expanded = ref<Set<string>>(new Set())
const elapsed = ref(0)

const groups = computed(() => store.stack?.groups ?? [])
const fileCount = computed(() => {
  const set = new Set<string>()
  for (const g of groups.value) for (const i of g.items) set.add(i.path)
  return set.size
})

const activeGroup = computed(() =>
  groups.value.find((g) => g.id === currentGroup.value) ?? groups.value[0] ?? null,
)
const activeIndex = computed(() => groups.value.findIndex((g) => g.id === activeGroup.value?.id))
const items = computed(() => activeGroup.value?.items ?? [])

// The branch diff is already loaded for the classic pane; the stack reuses it
// so every file renders as a real highlighted diff rather than raw patch text.
const byPath = computed<Record<string, FileDiff>>(() => {
  const map: Record<string, FileDiff> = {}
  for (const f of store.diffs?.files ?? []) map[f.path] = f
  return map
})

function cardKey(path: string) {
  return `${activeGroup.value?.id ?? ''}:${path}`
}
function isExpanded(path: string) {
  return expanded.value.has(cardKey(path))
}
function toggle(path: string) {
  const next = new Set(expanded.value)
  const k = cardKey(path)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  expanded.value = next
}
const allExpanded = computed(() =>
  items.value.length > 0 && items.value.every((i) => isExpanded(i.path)),
)
function toggleAll() {
  const next = new Set(expanded.value)
  for (const i of items.value) {
    if (allExpanded.value) next.delete(cardKey(i.path))
    else next.add(cardKey(i.path))
  }
  expanded.value = next
}

function selectGroup(id: string, { scrollStory = false } = {}) {
  currentGroup.value = id
  focusIndex.value = 0
  nextTick(() => {
    filesEl.value?.scrollTo({ top: 0 })
    if (scrollStory) {
      storyEl.value
        ?.querySelector<HTMLElement>(`[data-group="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
}

function stepGroup(delta: number) {
  const list = groups.value
  if (!list.length) return
  const idx = Math.max(0, Math.min(list.length - 1, activeIndex.value + delta))
  const next = list[idx]
  if (next) selectGroup(next.id, { scrollStory: true })
}

function focusCard(next: number) {
  const list = items.value
  if (!list.length) return
  focusIndex.value = Math.max(0, Math.min(list.length - 1, next))
  const path = list[focusIndex.value]?.path
  if (!path) return
  const el = filesEl.value?.querySelector<HTMLElement>(`[data-card="${CSS.escape(path)}"]`)
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function openInDiff(path: string, line?: number) {
  store.openStackHunk(path, line)
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.metaKey || e.ctrlKey || e.altKey || helpOpen.value) return
  const focused = items.value[focusIndex.value]
  switch (e.key) {
    case 'Escape': e.preventDefault(); store.closeStack(); break
    case ']': e.preventDefault(); stepGroup(1); break
    case '[': e.preventDefault(); stepGroup(-1); break
    case 'j': e.preventDefault(); focusCard(focusIndex.value + 1); break
    case 'k': e.preventDefault(); focusCard(focusIndex.value - 1); break
    case 'Enter': if (focused) { e.preventDefault(); toggle(focused.path) } break
    case 'o': if (focused) { e.preventDefault(); openInDiff(focused.path, focused.hunks[0]?.newStart) } break
  }
}

watch(() => groups.value.length, () => {
  const first = groups.value[0]
  if (!currentGroup.value && first) selectGroup(first.id)
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

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
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
            :title="store.diffWrap ? 'Disable line wrapping' : 'Enable line wrapping'"
            @click="store.toggleDiffWrap()"
          >
            {{ store.diffWrap ? 'Wrap: on' : 'Wrap: off' }}
          </button>
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
      <p v-if="store.stackError" class="stack-error">{{ store.stackError }}</p>
    </div>

    <div class="body">
      <div ref="storyEl" class="story">
        <header v-if="store.stack?.title" class="story-head">
          <h1>{{ store.stack.title }}</h1>
          <p v-if="store.stack.summary">{{ store.stack.summary }}</p>
        </header>

        <button
          v-for="(g, i) in groups"
          :key="g.id"
          class="chapter"
          :class="{ on: g.id === activeGroup?.id }"
          :data-group="g.id"
          @click="selectGroup(g.id)"
        >
          <div class="chapter-head">
            <span class="num">{{ i + 1 }}</span>
            <h2>{{ g.title }}</h2>
            <span class="kind" :class="`kind-${g.kind}`">{{ g.kind }}</span>
          </div>
          <p v-if="g.summary" class="chapter-summary">{{ g.summary }}</p>
          <div class="chapter-files">
            <span v-for="it in g.items" :key="it.path" class="chip">
              {{ it.path.split('/').pop() }}
            </span>
          </div>
        </button>

        <p v-if="store.stackStatus === 'loading'" class="pending">Grouping the rest…</p>
      </div>

      <div class="files-pane">
        <div v-if="activeGroup" class="files-head">
          <span class="files-title">
            {{ activeIndex + 1 }}. {{ activeGroup.title }} · {{ items.length }} files
          </span>
          <div class="files-actions">
            <button @click="stepGroup(-1)" :disabled="activeIndex <= 0" title="Previous group ([)">↑</button>
            <button
              :disabled="activeIndex >= groups.length - 1"
              title="Next group (])"
              @click="stepGroup(1)"
            >↓</button>
            <button v-if="items.length" @click="toggleAll">
              {{ allExpanded ? 'Collapse all' : 'Expand all' }}
            </button>
          </div>
        </div>
        <div ref="filesEl" class="files">
          <div
            v-for="(it, i) in items"
            :key="it.path"
            class="card-slot"
            :class="{ focused: i === focusIndex }"
            :data-card="it.path"
          >
            <StackFileCard
              :item="it"
              :file="byPath[it.path]"
              :expanded="isExpanded(it.path)"
              :wrap="store.diffWrap"
              @toggle="toggle(it.path)"
              @open="(line) => openInDiff(it.path, line)"
            />
          </div>
          <p v-if="!items.length" class="empty">Nothing grouped here yet.</p>
        </div>
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
.stack-error { margin: 6px 0 0; font-size: 12px; color: var(--red); }

.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 380px) 1fr;
}

/* --- left: the story --- */
.story {
  border-right: 1px solid var(--border);
  overflow-y: auto;
  background: var(--bg-2);
  padding: 12px 12px 40vh;
}
.story-head { padding: 0 4px 10px; border-bottom: 1px solid var(--border); margin-bottom: 10px; }
.story-head h1 { margin: 0; font-size: 15px; font-weight: 600; color: var(--fg); }
.story-head p { margin: 4px 0 0; font-size: 12px; color: var(--fg-dim); line-height: 1.5; }
.chapter {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-left: 2px solid var(--border);
  border-radius: 0 6px 6px 0;
  padding: 8px 10px;
  margin-bottom: 4px;
  font: inherit;
  cursor: pointer;
}
.chapter:hover { background: var(--bg-3); }
.chapter.on { background: var(--bg-3); border-left-color: var(--accent); }
.chapter-head { display: flex; align-items: baseline; gap: 8px; }
.num { font-family: var(--mono); font-size: 11px; color: var(--fg-dim); min-width: 12px; }
.chapter-head h2 { margin: 0; flex: 1; font-size: 13px; font-weight: 600; color: var(--fg); }
.kind {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg-dim);
}
.kind-feat { color: var(--green); }
.kind-fix { color: var(--red); }
.kind-refactor { color: var(--purple); }
.kind-test { color: var(--yellow); }
.chapter-summary {
  margin: 4px 0 0 20px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--fg-dim);
}
.chapter-files { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 0 20px; }
.chip {
  font-family: var(--mono);
  font-size: 10px;
  color: #7c8698;
  background: var(--bg);
  border-radius: 4px;
  padding: 1px 5px;
}
.pending { padding: 10px 4px; color: var(--fg-dim); font-size: 12px; }

/* --- right: the files --- */
.files-pane { display: flex; flex-direction: column; min-width: 0; }
.files-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  font-size: 12px;
}
.files-title { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.files-actions { display: flex; gap: 6px; flex-shrink: 0; }
.files {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 40vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card-slot { border-radius: 7px; }
.card-slot.focused { box-shadow: 0 0 0 2px var(--accent); }
.empty { color: var(--fg-dim); font-size: 12px; }
</style>
