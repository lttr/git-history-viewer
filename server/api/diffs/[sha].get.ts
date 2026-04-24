import { LRU } from '../../utils/cache'

interface FileDiff {
  path: string
  oldPath?: string
  status: string
  patch: string
  oldContent: string
  newContent: string
  isBinary: boolean
}
interface DiffsPayload {
  sha: string
  parent?: string
  files: FileDiff[]
}

const cache = new LRU<DiffsPayload>(100)

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
  const sha = getRouterParam(event, 'sha')
  if (!sha) throw createError({ statusCode: 400, message: 'sha required' })

  const hit = cache.get(sha)
  if (hit) return hit

  const git = useGit()

  const [parentsRaw, nameStatusRaw, patchRaw] = await Promise.all([
    git.raw(['rev-list', '--parents', '-n', '1', sha]),
    git.raw(['show', '--format=', '--name-status', '-m', '--first-parent', sha]),
    git.raw(['show', '--format=', '-m', '--first-parent', sha]),
  ])

  const parent = parentsRaw.trim().split(' ').slice(1)[0]

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
        git.raw(['show', `${sha}:${f.path}`])
          .then((c) => { newContent = c })
          .catch(() => {}),
      )
    }
    if (!isBinary && parent && f.status !== 'A') {
      const oldPath = f.oldPath || f.path
      jobs.push(
        git.raw(['show', `${parent}:${oldPath}`])
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

  const payload: DiffsPayload = { sha, parent, files: results }
  cache.set(sha, payload)
  return payload
})
