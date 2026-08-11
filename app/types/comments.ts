// gv comment format v1 — viewer-native, source-agnostic.
// External importers (e.g. Azure DevOps via `az`) convert into this shape.
// See README "Comments" section for the importer contract.

export type CommentSide = 'new' | 'old'
export type ThreadStatus = 'open' | 'resolved'

export interface CommentAnchor {
  /** repo-relative path, no leading slash (matches git diff paths) */
  path: string
  /** which side of the diff the line refers to; defaults to 'new' */
  side?: CommentSide
  /** start line; omit for a file-level (whole-file) thread */
  line?: number
  /** optional end line for a multi-line span */
  endLine?: number
}

export interface Comment {
  author: string
  /** ISO-8601 */
  date: string
  /** markdown */
  body: string
}

/**
 * Client-only navigation hint: the diff selection active when an authored draft
 * was created. Underscore-prefixed so it's never serialized to output; lets the
 * overview re-open the right commit/range/changes/review before scrolling to
 * the anchored line. Absent on loaded `--comments`.
 */
export interface ThreadSource {
  sha?: string
  shas?: string[]
  range?: string
  changes?: 'staged' | 'unstaged' | ''
  review?: boolean
  focus?: string
}

export interface CommentThread {
  id: string
  status: ThreadStatus
  /** null = unanchored (no file). {path} only = file-level. {path,line} = inline. */
  anchor: CommentAnchor | null
  /**
   * Full sha this thread is about as a whole. Only meaningful for unanchored
   * threads: with it the thread is commit-level and shows only while that commit
   * is selected; without it the thread is review-level and shows everywhere.
   */
  commit?: string
  comments: Comment[]
  _source?: ThreadSource
}

export interface CommentsDoc {
  version: 1
  source?: { kind: string; ref?: string; url?: string }
  /** the base/head the line numbers were taken against, for drift badges */
  anchoredTo?: { base?: string; head?: string }
  threads: CommentThread[]
}

// ---- indexed view the components consume ----

export interface FileComments {
  /** inline threads keyed by side then line number */
  byLine: { new: Record<number, CommentThread[]>; old: Record<number, CommentThread[]> }
  /** file-level threads (anchor has path but no line) */
  fileLevel: CommentThread[]
  /** total threads touching this file, for the badge */
  count: number
}

export interface CommentIndex {
  byPath: Record<string, FileComments>
  /** unanchored threads bound to one commit, keyed by full sha */
  byCommit: Record<string, CommentThread[]>
  /** unanchored threads with no commit — they apply to the whole review */
  reviewLevel: CommentThread[]
  source?: CommentsDoc['source']
  anchoredTo?: CommentsDoc['anchoredTo']
  total: number
}

export function buildCommentIndex(doc: CommentsDoc | null): CommentIndex {
  const idx: CommentIndex = { byPath: {}, byCommit: {}, reviewLevel: [], total: 0 }
  if (!doc?.threads) return idx
  idx.source = doc.source
  idx.anchoredTo = doc.anchoredTo
  for (const t of doc.threads) {
    if (!t.comments?.length) continue
    idx.total++
    const a = t.anchor
    if (!a) {
      if (t.commit) (idx.byCommit[t.commit] ??= []).push(t)
      else idx.reviewLevel.push(t)
      continue
    }
    const fc = (idx.byPath[a.path] ??= {
      byLine: { new: {}, old: {} },
      fileLevel: [],
      count: 0,
    })
    fc.count++
    if (a.line == null) {
      fc.fileLevel.push(t)
    } else {
      const side: CommentSide = a.side === 'old' ? 'old' : 'new'
      ;(fc.byLine[side][a.line] ??= []).push(t)
    }
  }
  return idx
}
