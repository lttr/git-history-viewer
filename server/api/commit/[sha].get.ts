import { LRU } from '../../utils/cache'

const cache = new LRU<any>(200)

export default defineEventHandler(async (event) => {
  const sha = getRouterParam(event, 'sha')
  if (!sha) throw createError({ statusCode: 400, message: 'sha required' })

  const hit = cache.get(sha)
  if (hit) return hit

  const git = useGit()

  const combined = await git.raw([
    'show',
    '--name-status',
    '-m',
    '--first-parent',
    '--format=%H%n%P%n%an%n%ae%n%aI%n%s%n%b%x00',
    sha,
  ])

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
  cache.set(sha, payload)
  return payload
})
