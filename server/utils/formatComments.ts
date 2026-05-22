import type { CommentThread } from '~/types/comments'

// Renders authored review threads as markdown for the agent reading CLI stdout.
// Plain text is purely an output concern, so this serializer lives server-side
// only — the client renders threads structurally and never needs it.
//
// Grouped by file (line-sorted), PR-level threads under "General". Only the
// threads passed in are emitted; the store already filters to authored drafts.

function anchorLabel(t: CommentThread): string {
  const a = t.anchor
  if (!a) return ''
  if (a.line == null) return 'L— (file)'
  const span = a.endLine && a.endLine !== a.line ? `${a.line}-${a.endLine}` : `${a.line}`
  // 'new' is the default side, so only annotate 'old'.
  return `L${span}${a.side === 'old' ? ' (old)' : ''}`
}

// One markdown list item; continuation lines of a multi-line body are indented
// two spaces so the list structure stays intact.
function item(label: string, body: string): string {
  const lines = body.replace(/\s+$/, '').split('\n')
  const head = label ? `- ${label}: ${lines[0] ?? ''}` : `- ${lines[0] ?? ''}`
  const rest = lines.slice(1).map((l) => `  ${l}`)
  return [head, ...rest].join('\n')
}

function threadBody(t: CommentThread): string {
  return t.comments.map((c) => c.body.trim()).filter(Boolean).join('\n\n')
}

export function formatCommentsText(threads: CommentThread[]): string {
  const authored = threads.filter((t) => t.comments?.length)
  if (!authored.length) return '# Review comments (0)\n(none)'

  const byPath = new Map<string, CommentThread[]>()
  const general: CommentThread[] = []
  for (const t of authored) {
    if (!t.anchor) general.push(t)
    else (byPath.get(t.anchor.path) ?? byPath.set(t.anchor.path, []).get(t.anchor.path)!).push(t)
  }

  const out: string[] = [`# Review comments (${authored.length})`]

  for (const path of [...byPath.keys()].sort((a, b) => a.localeCompare(b))) {
    const sorted = byPath.get(path)!.slice().sort((a, b) => {
      const la = a.anchor?.line ?? -1
      const lb = b.anchor?.line ?? -1
      return la - lb
    })
    out.push('', `## ${path}`, ...sorted.map((t) => item(anchorLabel(t), threadBody(t))))
  }

  if (general.length) {
    out.push('', '## General', ...general.map((t) => item('', threadBody(t))))
  }

  return out.join('\n')
}
