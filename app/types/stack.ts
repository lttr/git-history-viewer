// Change Stack — a branch diff regrouped by intent for skim reading.
// Produced by the local Claude Code CLI (see server/api/stack.post.ts) and
// treated as a pure reading layer: the classic diff stays the source of truth.

export type StackKind = 'feat' | 'fix' | 'refactor' | 'test' | 'docs' | 'config' | 'chore' | 'other'

export const STACK_KINDS: StackKind[] = ['feat', 'fix', 'refactor', 'test', 'docs', 'config', 'chore', 'other']

/** Hard caps on every model-authored string; enforced in the prompt and again server-side. */
export const CAPS = {
  stackTitle: 60,
  stackSummary: 120,
  groupTitle: 40,
  groupSummary: 90,
  itemNote: 40,
} as const

export const MAX_GROUPS = 12
export const EXCERPT_LINE_CAP = 60

export interface StackHunk {
  /** "app/x.ts#2" — path plus 1-based hunk index within the branch patch */
  id: string
  newStart: number
  oldStart: number
  /** "@@ -100,7 +120,15 @@ fn name" */
  header: string
  /** raw patch lines (' ', '+', '-' prefixed), capped server-side */
  lines: string[]
  /** lines dropped by the cap, 0 if none */
  truncatedLines: number
}

export interface StackItem {
  path: string
  /** ≤ 40 chars */
  note: string
  /** resolved server-side; [] for binary / patch-omitted files */
  hunks: StackHunk[]
}

export interface StackGroup {
  /** "g1".."gN" */
  id: string
  title: string
  summary: string
  kind: StackKind
  items: StackItem[]
}

export interface ChangeStack {
  base: string
  head: string
  headSha: string
  mergeBase: string
  title: string
  summary: string
  groups: StackGroup[]
  model: string
  durationMs: number
  createdAt: string
  /** model input was cut to fit the budget */
  truncated: boolean
}

/** What the model emits, before hunk ids are resolved to excerpts. */
export interface RawStackItem {
  path: string
  note: string
  hunks: string[]
}
export interface RawStackGroup {
  title: string
  summary: string
  kind: string
  items: RawStackItem[]
}
