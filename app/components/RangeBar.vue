<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useViewerStore } from '~/stores/viewer'

const store = useViewerStore()

const editing = ref(false)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const menuOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)
const refs = ref<{ branches: string[]; tags: string[] }>({ branches: [], tags: [] })
let refsLoaded = false
let settled = false

async function ensureRefs() {
  if (refsLoaded) return
  refsLoaded = true
  try {
    refs.value = await $fetch('/api/refs')
  } catch {
    refsLoaded = false
  }
}

function toggleMenu() {
  if (menuOpen.value) {
    menuOpen.value = false
    return
  }
  ensureRefs()
  menuOpen.value = true
}

async function pickRange(r: string) {
  menuOpen.value = false
  if (r === store.range) return
  await store.setRange(r)
}

function pickCustom() {
  menuOpen.value = false
  startEdit()
}

function onDocClick(e: MouseEvent) {
  if (!menuOpen.value) return
  const t = e.target as Node
  if (menuEl.value && !menuEl.value.contains(t)) menuOpen.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))

const rangeOptions = computed(() => {
  const out: Array<{ label: string; value: string; hint?: string }> = [
    { label: 'all history', value: '' },
  ]
  const cur = store.context?.branch || ''
  for (const b of refs.value.branches) {
    if (b === cur) continue
    out.push({ label: `${b}..HEAD`, value: `${b}..HEAD`, hint: 'branch' })
  }
  for (const t of refs.value.tags.slice(0, 10)) {
    out.push({ label: `${t}..HEAD`, value: `${t}..HEAD`, hint: 'tag' })
  }
  return out
})

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
      <div class="labels">
        <span v-if="store.context" class="branch" :title="store.context.branch">{{ store.context.branch || 'detached' }}</span>
        <span class="count">{{ store.commits.length }}{{ store.commitsDone ? '' : '+' }} commits</span>
      </div>
      <div ref="menuEl" class="range-picker">
        <button
          class="icon-btn"
          :title="`Range: ${store.range || 'HEAD'}`"
          :aria-expanded="menuOpen"
          @click="toggleMenu"
        >
          {{ store.range || 'all history' }}
          <span class="caret">▾</span>
        </button>
        <div v-if="menuOpen" class="menu" role="menu">
          <button
            v-for="opt in rangeOptions"
            :key="opt.value || 'all'"
            class="menu-item"
            :class="{ active: store.range === opt.value }"
            role="menuitem"
            @click="pickRange(opt.value)"
          >
            <span class="menu-label">{{ opt.label }}</span>
            <span v-if="opt.hint" class="menu-hint">{{ opt.hint }}</span>
          </button>
          <div class="menu-sep" />
          <button class="menu-item" role="menuitem" @click="pickCustom">
            <span class="menu-label">custom range…</span>
          </button>
        </div>
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
  gap: 6px 8px;
  padding: 6px 10px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}
.labels {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex: 1 1 auto;
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
.icon-btn {
  display: inline-flex;
  align-items: center;
  font-family: var(--mono);
  font-size: 11px;
  padding: 3px 8px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 3px;
  cursor: pointer;
  max-width: 240px;
  white-space: nowrap;
}
.icon-btn:hover { border-color: var(--fg-dim); }
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
.range-picker { position: relative; display: inline-flex; flex-shrink: 0; }
.range-picker .icon-btn { max-width: 100%; }
.icon-btn .caret { color: var(--fg-dim); margin-left: 4px; font-size: 9px; }
.menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 3px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 10;
  padding: 2px 0;
}
.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  font-family: var(--mono);
  font-size: 11px;
  padding: 4px 10px;
  background: transparent;
  color: var(--fg);
  border: none;
  border-radius: 0;
  cursor: pointer;
  text-align: left;
}
.menu-item:hover { background: var(--bg-3); color: #ffcc66; }
.menu-item.active { color: #ffcc66; font-weight: 600; }
.menu-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-hint { color: var(--fg-dim); font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
.menu-sep { height: 1px; background: var(--border); margin: 2px 0; }
.err {
  flex-basis: 100%;
  color: #f28779;
  font-family: var(--mono);
  font-size: 11px;
  margin-top: 4px;
}
</style>
