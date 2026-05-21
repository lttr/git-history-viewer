import { LRU } from '../utils/cache'

interface FileDiff {
  path: string
  oldPath?: string
  status: string
  patch: string
  oldContent: string
  newContent: string
  isBinary: boolean
}
interface DiffBranchPayload {
  base: string
  head: string
  range: string
  files: FileDiff[]
}

const cache = new LRU<DiffBranchPayload>(40)

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

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const range = typeof q.range === 'string' ? q.range.trim() : ''

  // Branch review needs a base..head range (two- or three-dot). We always diff
  // with three-dot semantics so it matches what a PR shows: changes on HEAD
  // since it diverged from base (merge-base), not commits added to base since.
  const m = range.match(/^(.*?)(\.\.\.?)(.*)$/)
  if (!m) throw createError({ statusCode: 400, message: 'range must be base..HEAD' })
  const base = m[1].trim()
  const head = m[3].trim() || 'HEAD'
  if (!base) throw createError({ statusCode: 400, message: 'range needs a base, e.g. main..HEAD' })
  assertRangeTokens([base, head])

  const path = readPath(q)
  const spec = `${base}...${head}`
  const cacheKey = spec + (path ? `::${path}` : '')
  const hit = cache.get(cacheKey)
  if (hit) return hit

  const git = useGit()

  let nameStatusRaw: string
  let patchRaw: string
  try {
    [nameStatusRaw, patchRaw] = await Promise.all([
      git.raw(withPath(['diff', '--name-status', spec], path)),
      git.raw(withPath(['diff', spec], path)),
    ])
  } catch (e: any) {
    throw createError({ statusCode: 400, message: cleanGitError(e?.message, range) })
  }

  const files = parseNameStatus(nameStatusRaw)
  const patchMap = splitPatchByFile(patchRaw)

  const results = await Promise.all(files.map(async (f) => {
    const patch = patchMap.get(f.path) ?? ''
    const isBinary = /^Binary files /m.test(patch) || patch.includes('GIT binary patch')

    let oldContent = ''
    let newContent = ''
    const jobs: Promise<void>[] = []
    if (!isBinary && f.status !== 'D') {
      jobs.push(
        git.raw(['show', `${head}:${f.path}`])
          .then((c) => { newContent = c })
          .catch(() => {}),
      )
    }
    if (!isBinary && f.status !== 'A') {
      const oldPath = f.oldPath || f.path
      // Old side is the merge-base of base..head; `git show base:path` is close
      // enough for content rendering (the patch carries the authoritative diff).
      jobs.push(
        git.raw(['show', `${base}:${oldPath}`])
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

  const payload: DiffBranchPayload = { base, head, range, files: results }
  cache.set(cacheKey, payload)
  return payload
})
