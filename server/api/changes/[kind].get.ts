import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

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

  const files = await Promise.all(tracked.map(async (f) => {
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

  return { kind, files }
})
