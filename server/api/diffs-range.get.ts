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
interface DiffsRangePayload {
  shas: string[]
  from: string
  to: string
  base: string
  files: FileDiff[]
}

const cache = new LRU<DiffsRangePayload>(60)

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
  const raw = typeof q.shas === 'string' ? q.shas : ''
  const shas = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (shas.length < 2) throw createError({ statusCode: 400, message: 'need >= 2 shas' })
  for (const s of shas) assertSha(s)

  const git = useGit()

  const orderRaw = await git.raw([
    'rev-list', '--no-walk', '--date-order', ...shas,
  ])
  const ordered = orderRaw.trim().split('\n').filter(Boolean)
  if (!ordered.length) throw createError({ statusCode: 400, message: 'invalid shas' })

  const to = ordered[0]
  const from = ordered[ordered.length - 1]

  const cacheKey = [...ordered].sort().join(',')
  const hit = cache.get(cacheKey)
  if (hit) return hit

  const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  let base: string
  try {
    const parentsRaw = await git.raw(['rev-list', '--parents', '-n', '1', from])
    const parents = parentsRaw.trim().split(' ').slice(1)
    base = parents[0] || EMPTY_TREE
  } catch {
    base = EMPTY_TREE
  }

  const [nameStatusRaw, patchRaw] = await Promise.all([
    git.raw(['diff', '--name-status', `${base}..${to}`]),
    git.raw(['diff', `${base}..${to}`]),
  ])

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
        git.raw(['show', `${to}:${f.path}`])
          .then((c) => { newContent = c })
          .catch(() => {}),
      )
    }
    if (!isBinary && f.status !== 'A') {
      const oldPath = f.oldPath || f.path
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

  const payload: DiffsRangePayload = { shas: ordered, from, to, base, files: results }
  cache.set(cacheKey, payload)
  return payload
})
