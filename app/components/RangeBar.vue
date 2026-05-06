<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useViewerStore } from '~/stores/viewer'

const store = useViewerStore()

const editing = ref(false)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
let settled = false

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

async function useBase() {
  if (store.context?.base) await store.setRange(`${store.context.base}..HEAD`)
}

async function useAll() {
  await store.setRange('')
}
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
      <div class="labels">
        <span v-if="store.context" class="branch">{{ store.context.branch || 'detached' }}</span>
        <span class="count">{{ store.commits.length }}{{ store.commitsDone ? '' : '+' }} commits</span>
      </div>
      <div class="spacer" />
      <button
        class="icon-btn"
        :title="`Range: ${store.range || 'HEAD'} (click to edit)`"
        @click="startEdit"
      >
        {{ store.range || 'HEAD' }}
      </button>
      <div class="actions">
        <button
          v-if="store.context?.base"
          :disabled="store.range === `${store.context.base}..HEAD`"
          :title="`Show ${store.context.base}..HEAD`"
          @click="useBase"
        >
          branch
        </button>
        <button v-if="!store.focusPath" :disabled="!store.range" title="Show full history" @click="useAll">all</button>
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
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}
.labels {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--fg-dim);
}
.branch {
  color: #ffcc66;
  font-family: var(--mono);
  font-weight: 600;
}
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
.count { color: var(--fg-dim); }
.spacer { flex: 1; min-width: 0; }
.icon-btn {
  font-family: var(--mono);
  font-size: 11px;
  padding: 3px 8px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 3px;
  cursor: pointer;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon-btn:hover { border-color: var(--fg-dim); }
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
.actions {
  display: flex;
  gap: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.actions button {
  font-size: 10px;
  padding: 3px 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: transparent;
  color: var(--fg-dim);
  border: none;
  border-radius: 0;
  cursor: pointer;
}
.actions button + button { border-left: 1px solid var(--border); }
.actions button:hover:not(:disabled) { background: var(--bg-3); color: var(--fg); }
.actions button:disabled {
  color: #ffcc66;
  cursor: default;
  font-weight: 600;
  box-shadow: inset 0 -2px 0 #ffcc66;
}
.err {
  flex-basis: 100%;
  color: #f28779;
  font-family: var(--mono);
  font-size: 11px;
  margin-top: 4px;
}
</style>
