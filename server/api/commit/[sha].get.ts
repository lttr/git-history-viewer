import { LRU } from '../../utils/cache'

const cache = new LRU<any>(200)

export default defineEventHandler(async (event) => {
  const sha = assertSha(getRouterParam(event, 'sha'))
  const path = readPath(getQuery(event))
  const key = path ? `${sha}::${path}` : sha

  const hit = cache.get(key)
  if (hit) return hit

  const git = useGit()

  const combined = await git.raw(withPath([
    'show',
    '--name-status',
    '-m',
    '--first-parent',
    '--format=%H%n%P%n%an%n%ae%n%aI%n%s%n%b%x00',
    sha,
  ], path))

  const nullIdx = combined.indexOf('\x00')
  const metaRaw = nullIdx === -1 ? combined : combined.slice(0, nullIdx)
  const rest = nullIdx === -1 ? '' : combined.slice(nullIdx + 1)
  const metaLines = metaRaw.split('\n')
  const [hash, parentsLine, author, email, date, subject, ...bodyLines] = metaLines
  const parents = (parentsLine || '').trim().split(' ').filter(Boolean)

  const files = parseNameStatus(rest)

  const payload = {
    hash,
    author,
    email,
    date,
    subject,
    body: bodyLines.join('\n').trim(),
    parents,
    isMerge: parents.length > 1,
    files,
  }
  cache.set(key, payload)
  return payload
})
