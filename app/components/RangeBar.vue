<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useViewerStore } from '~/stores/viewer'

const store = useViewerStore()

const editing = ref(false)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const refs = ref<{ branches: string[]; tags: string[] }>({ branches: [], tags: [] })
let refsLoaded = false
let settled = false

const CUSTOM = '__custom__'

async function ensureRefs() {
  if (refsLoaded) return
  refsLoaded = true
  try {
    refs.value = await $fetch('/api/refs')
  } catch {
    refsLoaded = false
  }
}

async function onSelectChange(e: Event) {
  const sel = e.target as HTMLSelectElement
  const v = sel.value
  if (v === CUSTOM) {
    sel.value = store.range
    startEdit()
    return
  }
  if (v === store.range) return
  await store.setRange(v)
}

const branchOptions = computed(() => {
  const cur = store.context?.branch || ''
  return refs.value.branches.filter(b => b !== cur).map(b => `${b}..HEAD`)
})
const tagOptions = computed(() => refs.value.tags.slice(0, 20).map(t => `${t}..HEAD`))

const knownValues = computed(() => new Set<string>(['', ...branchOptions.value, ...tagOptions.value]))
const isCustomRange = computed(() => store.range !== '' && !knownValues.value.has(store.range))

function startEdit() {
  draft.value = store.range
  editing.value = true
  settled = false
  nextTick(() => inputEl.value?.select())
}

async function submit() {
  if (settled) return
  settled = true
  editing.value = false
  await store.setRange(draft.value)
}

function cancel() {
  if (settled) return
  settled = true
  editing.value = false
}

function onBlur() {
  if (settled) return
  submit()
}

watch(
  () => store.range,
  (r) => { if (!editing.value) draft.value = r },
)

async function reset() {
  await store.resetView()
}

const canReset = computed(() => {
  const s = store.initialSnapshot
  if (!s) return false
  return (
    store.range !== s.range
    || store.focusPath !== s.focus
    || store.selectedChanges !== s.changes
    || store.selectedShas.join(',') !== s.shas.join(',')
  )
})
</script>

<template>
  <div class="range-bar">
    <template v-if="editing">
      <input
        ref="inputEl"
        v-model="draft"
        class="input"
        :placeholder="store.context?.base ? `${store.context.base}..HEAD` : 'master..HEAD'"
        spellcheck="false"
        @keydown.enter="submit"
        @keydown.esc="cancel"
        @blur="onBlur"
      />
    </template>
    <template v-else>
      <div class="top-row">
        <button
          class="home-btn"
          :disabled="!canReset"
          title="Reset to initial view"
          @click="reset"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 1.5 1 7.5v.5h2v6h3.5v-4h3v4H13v-6h2v-.5L8 1.5Z"
            />
          </svg>
        </button>
        <div class="spacer" />
        <select
          class="range-select"
          :title="`Range: ${store.range || 'HEAD'}`"
          :value="store.range"
          @mousedown="ensureRefs"
          @focus="ensureRefs"
          @change="onSelectChange"
        >
          <option value="">all history</option>
          <optgroup v-if="branchOptions.length" label="Branches">
            <option v-for="b in branchOptions" :key="b" :value="b">{{ b }}</option>
          </optgroup>
          <optgroup v-if="tagOptions.length" label="Tags">
            <option v-for="t in tagOptions" :key="t" :value="t">{{ t }}</option>
          </optgroup>
          <option v-if="isCustomRange" :value="store.range">{{ store.range }}</option>
          <option :value="CUSTOM">custom range…</option>
        </select>
      </div>
      <div class="labels">
        <span v-if="store.context" class="branch" :title="store.context.branch">{{ store.context.branch || 'detached' }}</span>
        <span class="count">{{ store.commits.length }}{{ store.commitsDone ? '' : '+' }} commits</span>
      </div>
      <button
        v-if="store.focusPath"
        class="file-chip"
        :title="`File focus: ${store.focusPath} (click to exit)`"
        @click="store.clearFocus()"
      >
        <span class="path-text">{{ store.focusPath }}</span>
        <span class="x">x</span>
      </button>
    </template>
    <div v-if="store.rangeError" class="err">{{ store.rangeError }}</div>
  </div>
</template>

<style scoped>
.range-bar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}
.top-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.labels {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  color: var(--fg-dim);
}
.branch {
  flex: 0 1 auto;
  min-width: 0;
  color: #ffcc66;
  font-family: var(--mono);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count { flex-shrink: 0; }
.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 100%;
  min-width: 0;
  font: inherit;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--fg);
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px 6px;
  cursor: pointer;
}
.file-chip:hover { border-color: #ffcc66; color: #ffcc66; }
.file-chip .path-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.file-chip .x { color: var(--fg-dim); font-size: 10px; flex-shrink: 0; }
.file-chip:hover .x { color: #ffcc66; }
.spacer { flex: 1; min-width: 0; }
.range-select {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  font-family: var(--mono);
  font-size: 11px;
  padding: 3px 22px 3px 8px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 3px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--fg-dim) 50%),
                    linear-gradient(135deg, var(--fg-dim) 50%, transparent 50%);
  background-position: calc(100% - 12px) 50%, calc(100% - 7px) 50%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.range-select:hover { border-color: var(--fg-dim); }
.range-select:focus { outline: none; border-color: #ffcc66; }
.home-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  color: var(--fg-dim);
  border: 1px solid var(--border);
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
}
.home-btn:hover:not(:disabled) { color: #ffcc66; border-color: #ffcc66; }
.home-btn:disabled { opacity: 0.35; cursor: default; }
.input {
  flex: 1;
  min-width: 0;
  font-family: var(--mono);
  font-size: 11px;
  padding: 3px 6px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid #ffcc66;
  border-radius: 3px;
  cursor: text;
  outline: none;
}
.err {
  flex-basis: 100%;
  color: #f28779;
  font-family: var(--mono);
  font-size: 11px;
  margin-top: 4px;
}
</style>
