<script setup lang="ts">
import { computed, ref } from 'vue'
import { useViewerStore } from '~/stores/viewer'
import type { CommitFile } from '~/stores/viewer'

const store = useViewerStore()

interface TreeNode {
  name: string
  path: string
  isFile: boolean
  file?: CommitFile
  children: TreeNode[]
}

function buildTree(files: CommitFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isFile: false, children: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLast = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')
      let child = node.children.find((c) => c.name === name)
      if (!child) {
        child = { name, path, isFile: isLast, children: [] }
        if (isLast) child.file = f
        node.children.push(child)
      }
      node = child
    }
  }
  sortNode(root)
  return root
}

function sortNode(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
    return a.name.localeCompare(b.name)
  })
  for (const c of node.children) sortNode(c)
}

const files = computed<CommitFile[]>(() => {
  if (store.commitDetail) return store.commitDetail.files
  if (store.diffs) return store.diffs.files.map((f) => ({ path: f.path, status: f.status, oldPath: f.oldPath }))
  return []
})
const tree = computed(() => buildTree(files.value))
const collapsed = ref(new Set<string>())

function toggle(path: string) {
  const next = new Set(collapsed.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsed.value = next
}
</script>

<template>
  <div class="file-tree">
    <div class="header">
      Files
      <span v-if="files.length" class="count">({{ files.length }})</span>
    </div>
    <div class="scroll">
      <template v-if="files.length">
        <TreeNodeRow
          v-for="child in tree.children"
          :key="child.path"
          :node="child"
          :depth="0"
          :collapsed="collapsed"
          :selected="store.selectedFile"
          @toggle="toggle"
          @select="(p: string) => store.selectFile(p)"
        />
      </template>
      <div v-else class="empty">Select a commit</div>
    </div>
  </div>
</template>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-2);
  border-right: 1px solid var(--border);
}
.header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  color: var(--fg-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.count { margin-left: 6px; font-weight: 400; }
.scroll { flex: 1; overflow: auto; padding: 4px 0; }
.empty { padding: 16px; color: var(--fg-dim); text-align: center; }
</style>
