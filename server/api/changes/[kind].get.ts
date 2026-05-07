import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function isBinaryBuffer(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

function buildAddedPatch(path: string, content: string): string {
  const lines = content.length ? content.split('\n') : []
  const hasTrailingNewline = content.endsWith('\n')
  const bodyLines = hasTrailingNewline ? lines.slice(0, -1) : lines
  const count = bodyLines.length
  const header = [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${path}`,
    `@@ -0,0 +1,${count} @@`,
  ].join('\n')
  const body = bodyLines.map((l) => '+' + l).join('\n')
  let out = header + (count ? '\n' + body : '')
  if (count && !hasTrailingNewline) out += '\n\\ No newline at end of file'
  return out + '\n'
}

interface FileDiff {
  path: string
  oldPath?: string
  status: string
  patch: string
  oldContent: string
  newContent: string
  isBinary: boolean
}
interface Payload {
  kind: 'staged' | 'unstaged'
  files: FileDiff[]
}

function splitPatchByFile(raw: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!raw) return out
  const chunks = raw.split(/^diff --git /m)
  for (let i = 1; i < chunks.length; i++) {
    const chunk = 'diff --git ' + chunks[i]
    const first = chunk.split('\n', 1)[0]
    const m = first.match(/ b\/(.+)$/)
    if (!m) continue
    out.set(m[1].trim(), chunk)
  }
  return out
}

export default defineEventHandler(async (event): Promise<Payload> => {
  const kind = getRouterParam(event, 'kind')
  if (kind !== 'staged' && kind !== 'unstaged') {
    throw createError({ statusCode: 400, message: 'invalid kind' })
  }
  const git = useGit()
  const cfg = useRuntimeConfig()
  const repoPath = cfg.repoPath as string
  const path = readPath(getQuery(event))

  const isStaged = kind === 'staged'
  const baseArgs = isStaged ? ['diff', '--cached'] : ['diff']

  const [nameStatusRaw, patchRaw] = await Promise.all([
    git.raw(withPath([...baseArgs, '--name-status'], path)).catch(() => ''),
    git.raw(withPath([...baseArgs], path)).catch(() => ''),
  ])

  const tracked = parseNameStatus(nameStatusRaw)
  const patchMap = splitPatchByFile(patchRaw)

  const untrackedPaths: string[] = !isStaged
    ? (await git.raw(withPath(['ls-files', '--others', '--exclude-standard'], path)).catch(() => ''))
        .split('\n').map((l) => l.trim()).filter(Boolean)
    : []

  const trackedFiles = await Promise.all(tracked.map(async (f) => {
    const patch = patchMap.get(f.path) ?? ''
    const isBinary = /^Binary files /m.test(patch) || patch.includes('GIT binary patch')

    let oldContent = ''
    let newContent = ''
    const jobs: Promise<void>[] = []

    if (!isBinary && f.status !== 'D') {
      if (isStaged) {
        jobs.push(
          git.raw(['show', `:${f.path}`])
            .then((c) => { newContent = c })
            .catch(() => {}),
        )
      } else {
        jobs.push(
          readFile(join(repoPath, f.path), 'utf8')
            .then((c) => { newContent = c })
            .catch(() => {}),
        )
      }
    }
    if (!isBinary && f.status !== 'A') {
      const oldPath = f.oldPath || f.path
      const ref = isStaged ? `HEAD:${oldPath}` : `:${oldPath}`
      jobs.push(
        git.raw(['show', ref])
          .then((c) => { oldContent = c })
          .catch(() => {}),
      )
    }
    await Promise.all(jobs)

    return {
      path: f.path,
      oldPath: f.oldPath,
      status: f.status,
      patch,
      oldContent,
      newContent,
      isBinary,
    }
  }))

  const untrackedFiles = await Promise.all(untrackedPaths.map(async (p) => {
    let buf: Buffer | null = null
    try { buf = await readFile(join(repoPath, p)) } catch { /* unreadable */ }
    if (!buf) {
      return { path: p, status: '?', patch: '', oldContent: '', newContent: '', isBinary: false }
    }
    const binary = isBinaryBuffer(buf)
    if (binary) {
      const patch = `diff --git a/${p} b/${p}\nnew file mode 100644\nBinary files /dev/null and b/${p} differ\n`
      return { path: p, status: '?', patch, oldContent: '', newContent: '', isBinary: true }
    }
    const newContent = buf.toString('utf8')
    return { path: p, status: '?', patch: buildAddedPatch(p, newContent), oldContent: '', newContent, isBinary: false }
  }))

  return { kind, files: [...trackedFiles, ...untrackedFiles] }
})
