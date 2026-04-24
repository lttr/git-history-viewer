<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { helpOpen as open } from '~/stores/ui'

function toggle() { open.value = !open.value }
function close() { open.value = false }

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    toggle()
  } else if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const bindings: Array<{ keys: string[]; desc: string }> = [
  { keys: ['n'], desc: 'Next commit' },
  { keys: ['p'], desc: 'Previous commit' },
  { keys: ['Shift', 'N'], desc: 'Extend group to next commit' },
  { keys: ['Shift', 'P'], desc: 'Extend group to previous commit' },
  { keys: ['j'], desc: 'Next file (scroll diff)' },
  { keys: ['k'], desc: 'Previous file' },
  { keys: ['?'], desc: 'Toggle this legend' },
  { keys: ['Esc'], desc: 'Close legend' },
]
</script>

<template>
  <button class="help-btn" title="Keyboard shortcuts (?)" @click="toggle">?</button>
  <Teleport to="body">
    <div v-if="open" class="backdrop" @click.self="close">
      <div class="panel" role="dialog" aria-label="Keyboard shortcuts">
        <div class="panel-header">
          <span>Keyboard shortcuts</span>
          <button class="close" aria-label="Close" @click="close">×</button>
        </div>
        <table>
          <tbody>
            <tr v-for="b in bindings" :key="b.desc">
              <td class="keys">
                <template v-for="(k, i) in b.keys" :key="k">
                  <kbd>{{ k }}</kbd>
                  <span v-if="i < b.keys.length - 1" class="sep">or</span>
                </template>
              </td>
              <td class="desc">{{ b.desc }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help-btn {
  position: fixed;
  right: 14px;
  bottom: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-3);
  color: var(--fg);
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.help-btn:hover { background: var(--border); }

.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.panel {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  min-width: 320px;
  max-width: 480px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}
.panel-header .close {
  background: transparent;
  border: none;
  color: var(--fg-dim);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
  padding: 0 6px;
}
.panel-header .close:hover { color: var(--fg); background: transparent; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
td {
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  vertical-align: middle;
}
td.keys { white-space: nowrap; width: 1%; }
td.desc { color: var(--fg-dim); }
kbd {
  display: inline-block;
  font-family: var(--mono);
  font-size: 11px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 2px 8px;
  color: var(--fg);
}
.sep {
  margin: 0 6px;
  color: var(--fg-dim);
  font-size: 11px;
}
</style>
