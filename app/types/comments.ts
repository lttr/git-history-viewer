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

export interface CommentThread {
  id: string
  status: ThreadStatus
  /** null = PR-level (no file). {path} only = file-level. {path,line} = inline. */
  anchor: CommentAnchor | null
  comments: Comment[]
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
  prLevel: CommentThread[]
  source?: CommentsDoc['source']
  anchoredTo?: CommentsDoc['anchoredTo']
  total: number
}

export function buildCommentIndex(doc: CommentsDoc | null): CommentIndex {
  const idx: CommentIndex = { byPath: {}, prLevel: [], total: 0 }
  if (!doc?.threads) return idx
  idx.source = doc.source
  idx.anchoredTo = doc.anchoredTo
  for (const t of doc.threads) {
    if (!t.comments?.length) continue
    idx.total++
    const a = t.anchor
    if (!a) {
      idx.prLevel.push(t)
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
