<script setup lang="ts">
import { computed } from 'vue'

interface TreeNode {
  name: string
  path: string
  isFile: boolean
  file?: { path: string; status: string; oldPath?: string }
  children: TreeNode[]
}

const props = defineProps<{
  node: TreeNode
  depth: number
  collapsed: Set<string>
  selected: string
}>()

const emit = defineEmits<{
  toggle: [path: string]
  select: [path: string]
}>()

const statusColor: Record<string, string> = {
  A: 'var(--green)', M: 'var(--yellow)', D: 'var(--red)',
  R: 'var(--blue)', C: 'var(--purple)',
}

const isCollapsed = computed(() => props.collapsed.has(props.node.path))
const isSelected = computed(() => props.node.isFile && props.node.file?.path === props.selected)
const pad = computed(() => ({ paddingLeft: `${props.depth * 12 + 8}px` }))
</script>

<template>
  <template v-if="node.isFile && node.file">
    <div
      class="row file"
      :class="{ active: isSelected }"
      :style="pad"
      :data-path="node.file.path"
      @click="emit('select', node.file.path)"
    >
      <span class="icon">·</span>
      <span class="name">{{ node.name }}</span>
      <span class="badge" :style="{ color: statusColor[node.file.status] || 'var(--fg-dim)' }">
        {{ node.file.status }}
      </span>
    </div>
  </template>
  <template v-else>
    <div class="row dir" :style="pad" @click="emit('toggle', node.path)">
      <span class="icon">{{ isCollapsed ? '▶' : '▼' }}</span>
      <span class="name">{{ node.name }}</span>
    </div>
    <template v-if="!isCollapsed">
      <TreeNodeRow
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :collapsed="collapsed"
        :selected="selected"
        @toggle="(p) => emit('toggle', p)"
        @select="(p) => emit('select', p)"
      />
    </template>
  </template>
</template>

<style>
.file-tree .row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}
.file-tree .row:hover { background: var(--bg-3); }
.file-tree .row.active { background: var(--bg-3); color: var(--accent); }
.file-tree .row .icon {
  width: 12px;
  color: var(--fg-dim);
  font-size: 10px;
  text-align: center;
}
.file-tree .row .name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-tree .row .badge {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
}
.file-tree .row.dir .name { color: var(--fg-dim); }
</style>
