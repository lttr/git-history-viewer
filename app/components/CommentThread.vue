<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import type { CommentThread } from '~/types/comments'

const props = defineProps<{ thread: CommentThread }>()

function relTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const d = new Date(t)
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Comments come from a local, trusted --comments file, so full markdown is
// safe to render without sanitization. GFM + line breaks on single newlines.
function render(body: string): string {
  return marked.parse(body, { gfm: true, breaks: true, async: false })
}

const rendered = computed(() => props.thread.comments.map((c) => ({
  ...c, when: relTime(c.date), html: render(c.body),
})))
</script>

<template>
  <div class="ct" :class="{ 'ct-resolved': thread.status === 'resolved' }">
    <div v-for="(c, i) in rendered" :key="i" class="ct-comment">
      <div class="ct-meta">
        <span class="ct-author">{{ c.author }}</span>
        <span class="ct-when">{{ c.when }}</span>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html — sanitized by render() -->
      <div class="ct-body" v-html="c.html" />
    </div>
  </div>
</template>

<style scoped>
.ct {
  border-left: 2px solid rgba(255, 204, 102, 0.35);
  background: rgba(255, 204, 102, 0.04);
  margin: 4px 8px;
  padding: 6px 10px;
  font-size: 13px;
  line-height: 1.5;
}
.ct-resolved { border-left-color: rgba(92, 103, 115, 0.5); opacity: 0.7; }
.ct-comment { padding: 4px 0; border-top: 1px solid rgba(255, 255, 255, 0.06); }
.ct-comment:first-of-type { border-top: 0; }
.ct-meta { display: flex; gap: 8px; align-items: baseline; margin-bottom: 2px; }
.ct-author { font-weight: 600; color: var(--fg-dim); }
.ct-when { font-size: 11px; color: #707a8c; }
.ct-body { white-space: normal; word-break: break-word; }
.ct-body :deep(> :first-child) { margin-top: 0; }
.ct-body :deep(> :last-child) { margin-bottom: 0; }
.ct-body :deep(p) { margin: 4px 0; }
.ct-body :deep(h1),
.ct-body :deep(h2),
.ct-body :deep(h3),
.ct-body :deep(h4) { margin: 8px 0 4px; font-size: 13px; font-weight: 600; }
.ct-body :deep(ul),
.ct-body :deep(ol) { margin: 4px 0; padding-left: 20px; }
.ct-body :deep(li) { margin: 2px 0; }
.ct-body :deep(a) { color: #79b8ff; text-decoration: underline; }
.ct-body :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid rgba(255, 255, 255, 0.15);
  color: var(--fg-dim);
}
.ct-body :deep(hr) { border: 0; border-top: 1px solid rgba(255, 255, 255, 0.12); margin: 8px 0; }
.ct-body :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  padding: 0 4px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.ct-body :deep(pre) {
  background: rgba(0, 0, 0, 0.3);
  padding: 6px 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  margin: 4px 0;
}
.ct-body :deep(pre code) {
  background: none;
  padding: 0;
  white-space: pre;
}
</style>
