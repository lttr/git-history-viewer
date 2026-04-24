<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useViewerStore } from '~/stores/viewer'

const store = useViewerStore()

const editing = ref(false)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

function startEdit() {
  draft.value = store.range
  editing.value = true
  nextTick(() => inputEl.value?.select())
}

async function submit() {
  editing.value = false
  await store.setRange(draft.value)
}

function cancel() {
  editing.value = false
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
    <div class="labels">
      <span v-if="store.context" class="branch">{{ store.context.branch || 'detached' }}</span>
      <span class="count">· {{ store.commits.length }}{{ store.commitsDone ? '' : '+' }} commits</span>
    </div>
    <div class="range">
      <input
        v-if="editing"
        ref="inputEl"
        v-model="draft"
        class="input"
        placeholder="main..HEAD"
        spellcheck="false"
        @keydown.enter="submit"
        @keydown.esc="cancel"
        @blur="submit"
      />
      <button v-else class="range-btn" :title="'Edit range'" @click="startEdit">
        {{ store.range || 'HEAD' }}
      </button>
    </div>
    <div class="actions">
      <button
        v-if="store.context?.base"
        :disabled="store.range === `${store.context.base}..HEAD`"
        :title="`Show ${store.context.base}..HEAD`"
        @click="useBase"
      >
        branch
      </button>
      <button :disabled="!store.range" title="Show full history" @click="useAll">all</button>
    </div>
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
.count { color: var(--fg-dim); }
.range {
  flex: 1;
  min-width: 0;
  display: flex;
}
.range-btn, .input {
  width: 100%;
  font-family: var(--mono);
  font-size: 11px;
  padding: 3px 6px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 3px;
  cursor: text;
}
.range-btn { text-align: left; }
.range-btn:hover { border-color: var(--fg-dim); background: var(--bg); }
.input { outline: none; }
.input:focus { border-color: #ffcc66; }
.actions { display: flex; gap: 4px; }
.actions button {
  font-size: 10px;
  padding: 3px 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.actions button:disabled { opacity: 0.4; cursor: default; }
.err {
  flex-basis: 100%;
  color: #f28779;
  font-family: var(--mono);
  font-size: 11px;
  margin-top: 4px;
}
</style>
