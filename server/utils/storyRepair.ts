// Validation + repair for model-authored changeset-story groups. Pure functions:
// the model is never trusted for lengths, kinds, paths or hunk ids.
import type { InputFile, InputHunk } from './storyInput'
import type { RawStoryGroup, StoryGroup, StoryHunk, StoryItem, StoryKind } from '../../app/types/story'
import { CAPS, EXCERPT_LINE_CAP, MAX_GROUPS, STORY_KINDS } from '../../app/types/story'

export interface RepairContext {
  files: InputFile[]
  hunksById: Map<string, InputHunk>
}

export function truncate(value: unknown, cap: number): string {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (s.length <= cap) return s
  return s.slice(0, Math.max(1, cap - 1)).trimEnd() + '…'
}

function toKind(value: unknown): StoryKind {
  return STORY_KINDS.includes(value as StoryKind) ? (value as StoryKind) : 'other'
}

export function toExcerpt(h: InputHunk): StoryHunk {
  const lines = h.lines.slice(0, EXCERPT_LINE_CAP)
  return {
    id: h.id,
    newStart: h.newStart,
    oldStart: h.oldStart,
    header: h.header,
    lines,
    truncatedLines: Math.max(0, h.lines.length - lines.length),
  }
}

/**
 * Coerce one model group into a `StoryGroup`, dropping what doesn't resolve.
 * Returns null when nothing usable survives. `id` is assigned later.
 */
export function normalizeGroup(raw: unknown, ctx: RepairContext): StoryGroup | null {
  const g = raw as RawStoryGroup
  if (!g || typeof g !== 'object') return null
  const known = new Set(ctx.files.map((f) => f.path))
  const items: StoryItem[] = []
  const seenHunks = new Set<string>()
  for (const rawItem of Array.isArray(g.items) ? g.items : []) {
    const path = typeof rawItem?.path === 'string' ? rawItem.path.trim() : ''
    if (!path || !known.has(path)) continue
    const hunks: StoryHunk[] = []
    for (const id of Array.isArray(rawItem.hunks) ? rawItem.hunks : []) {
      if (typeof id !== 'string') continue
      const hunk = ctx.hunksById.get(id.trim())
      // A hunk listed twice in one group would render the same excerpt twice.
      if (!hunk || seenHunks.has(hunk.id)) continue
      seenHunks.add(hunk.id)
      hunks.push(toExcerpt(hunk))
    }
    const file = ctx.files.find((f) => f.path === path)
    // An item with no hunks is only meaningful for a file that has none to
    // begin with (binary / patch omitted); otherwise the model missed.
    if (!hunks.length && file && file.hunks.length) continue
    hunks.sort((a, b) => a.newStart - b.newStart)
    const note = truncate(rawItem.note, CAPS.itemNote)
    // Models sometimes split one file across two items of the same group;
    // that renders as the same path twice, so fold them together.
    const sameFile = items.find((i) => i.path === path)
    if (sameFile) {
      sameFile.hunks.push(...hunks)
      sameFile.hunks.sort((a, b) => a.newStart - b.newStart)
      if (!sameFile.note) sameFile.note = note
      continue
    }
    items.push({ path, note, hunks })
  }
  if (!items.length) return null
  return {
    id: '',
    title: truncate(g.title, CAPS.groupTitle) || 'Changes',
    summary: truncate(g.summary, CAPS.groupSummary),
    kind: toKind(g.kind),
    items,
  }
}

/**
 * Append a group, honouring the group cap: everything past `MAX_GROUPS` is
 * folded into the last group rather than dropped.
 */
export function appendGroup(groups: StoryGroup[], group: StoryGroup): 'added' | 'merged' {
  if (groups.length < MAX_GROUPS) {
    groups.push(group)
    return 'added'
  }
  const last = groups[groups.length - 1]
  for (const item of group.items) mergeItem(last, item)
  return 'merged'
}

function mergeItem(group: StoryGroup, item: StoryItem) {
  const existing = group.items.find((i) => i.path === item.path)
  if (!existing) { group.items.push(item); return }
  const have = new Set(existing.hunks.map((h) => h.id))
  for (const h of item.hunks) if (!have.has(h.id)) existing.hunks.push(h)
  existing.hunks.sort((a, b) => a.newStart - b.newStart)
}

/**
 * Final pass: assign ids and make sure nothing in the diff went unmentioned.
 * Unreferenced hunks (and never-named patch-omitted files) land in a trailing
 * `Other` group so the story always accounts for the whole branch.
 */
export function finalizeGroups(groups: StoryGroup[], ctx: RepairContext): StoryGroup[] {
  const referencedHunks = new Set<string>()
  const referencedPaths = new Set<string>()
  for (const g of groups) {
    for (const item of g.items) {
      referencedPaths.add(item.path)
      for (const h of item.hunks) referencedHunks.add(h.id)
    }
  }

  const leftovers = new Map<string, StoryHunk[]>()
  for (const [id, hunk] of ctx.hunksById) {
    if (referencedHunks.has(id)) continue
    const list = leftovers.get(hunk.path) ?? []
    list.push(toExcerpt(hunk))
    leftovers.set(hunk.path, list)
  }
  for (const f of ctx.files) {
    if (f.hunks.length || referencedPaths.has(f.path)) continue
    leftovers.set(f.path, [])
  }

  if (leftovers.size) {
    const items: StoryItem[] = [...leftovers.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([path, hunks]) => ({
        path,
        note: hunks.length ? '' : 'listed only',
        hunks: hunks.sort((a, b) => a.newStart - b.newStart),
      }))
    appendGroup(groups, {
      id: '',
      title: 'Other',
      summary: 'Remaining changes.',
      kind: 'other',
      items,
    })
  }

  groups.forEach((g, i) => { g.id = `g${i + 1}` })
  return groups
}
