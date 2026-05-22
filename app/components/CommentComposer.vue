<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{
  placeholder?: string
  cancellable?: boolean
  autofocus?: boolean
  initialValue?: string
  submitLabel?: string
}>()
const emit = defineEmits<{ save: [body: string]; cancel: [] }>()

const text = ref(props.initialValue ?? '')
const ta = ref<HTMLTextAreaElement | null>(null)

function save() {
  const v = text.value.trim()
  if (!v) return
  emit('save', v)
  text.value = ''
}

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    save()
  } else if (e.key === 'Escape' && props.cancellable !== false) {
    e.preventDefault()
    emit('cancel')
  }
}

onMounted(() => {
  if (props.autofocus === false) return
  ta.value?.focus()
  // Edit prefill: drop the caret at the end rather than selecting all.
  const len = text.value.length
  ta.value?.setSelectionRange(len, len)
})
</script>

<template>
  <div class="composer">
    <textarea
      ref="ta"
      v-model="text"
      class="composer-input"
      rows="3"
      :placeholder="placeholder || 'Add a comment… (markdown supported)'"
      @keydown="onKey"
    />
    <div class="composer-actions">
      <span class="hint">⌘/Ctrl+Enter to save</span>
      <button v-if="cancellable !== false" class="btn" @click="emit('cancel')">Cancel</button>
      <button class="btn primary" :disabled="!text.trim()" @click="save">{{ submitLabel || 'Comment' }}</button>
    </div>
  </div>
</template>

<style scoped>
.composer {
  margin: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-2);
  padding: 6px;
}
.composer-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  line-height: 1.4;
}
.composer-input:focus { outline: none; border-color: #79b8ff; }
.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.hint { flex: 1; font-size: 11px; color: #707a8c; }
.btn {
  background: var(--bg-3);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 3px 12px;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.btn:hover { background: var(--border); }
.btn.primary { background: #2f81f7; border-color: #2f81f7; color: #fff; }
.btn.primary:hover { background: #4d92f8; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
