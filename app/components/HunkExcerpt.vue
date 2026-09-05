<script setup lang="ts">
// Deliberately not @git-diff-view: that component wants full file contents and
// split-mode plumbing. The skim view only needs the patch lines themselves.
import { computed } from 'vue'
import type { StoryHunk } from '~/types/story'

const props = defineProps<{ hunk: StoryHunk }>()
const emit = defineEmits<{ (e: 'open'): void }>()

interface Row { num: number | null; kind: 'add' | 'del' | 'ctx' | 'meta'; text: string }

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  let newLn = props.hunk.newStart
  for (const line of props.hunk.lines) {
    const c = line[0]
    if (c === '+') out.push({ num: newLn++, kind: 'add', text: line.slice(1) })
    else if (c === '-') out.push({ num: null, kind: 'del', text: line.slice(1) })
    else if (c === '\\') out.push({ num: null, kind: 'meta', text: line })
    else out.push({ num: newLn++, kind: 'ctx', text: line.slice(1) })
  }
  return out
})

// "@@ -1,42 +1,42 @@ fn name" → the trailing context is noise in a skim view.
const shortHeader = computed(() => {
  const m = props.hunk.header.match(/^@@[^@]*@@/)
  return m ? m[0] : props.hunk.header
})
</script>

<template>
  <div class="excerpt">
    <div class="excerpt-head">
      <span class="hunk-range">{{ shortHeader }}</span>
    </div>
    <div class="excerpt-body">
      <div v-for="(r, i) in rows" :key="i" class="row" :class="r.kind">
        <span class="num">{{ r.num ?? '' }}</span>
        <span class="sign">{{ r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' ' }}</span>
        <span class="text">{{ r.text }}</span>
      </div>
    </div>
    <button v-if="hunk.truncatedLines" class="more" @click="emit('open')">
      … {{ hunk.truncatedLines }} more lines · open in diff ↗
    </button>
  </div>
</template>

<style scoped>
.excerpt {
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
  background: var(--bg);
}
.excerpt-head {
  padding: 3px 8px;
  background: var(--bg-3);
  border-bottom: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-dim);
}
.excerpt-body {
  overflow-x: auto;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.5;
  padding: 3px 0;
}
.row { display: flex; white-space: pre; }
.row.add { background: #16281c; }
.row.del { background: #2b1d20; }
.row.meta { color: var(--fg-dim); font-style: italic; }
.num {
  flex: 0 0 auto;
  width: 46px;
  padding-right: 8px;
  text-align: right;
  color: #6b7482;
  user-select: none;
}
.sign {
  flex: 0 0 auto;
  width: 12px;
  color: var(--fg-dim);
  user-select: none;
}
.row.add .sign { color: var(--green); }
.row.del .sign { color: var(--red); }
.text { flex: 1 1 auto; padding-right: 12px; }
.more {
  display: block;
  width: 100%;
  text-align: left;
  padding: 4px 10px;
  background: var(--bg-2);
  border: none;
  border-top: 1px solid var(--border);
  color: var(--fg-dim);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.more:hover { color: var(--accent); }
</style>
