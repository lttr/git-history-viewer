export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = Math.min(Number(q.limit ?? 200), 1000)
  const skip = Math.max(Number(q.skip ?? 0), 0)
  const range = typeof q.range === 'string' ? q.range.trim() : ''

  const git = useGit()

  const filePath = readPath(q)
  const args = [
    'log',
    `--max-count=${limit}`,
    `--skip=${skip}`,
    '--format=%H%x01%an%x01%ae%x01%aI%x01%s',
  ]
  if (range) {
    const tokens = range.split(/\s+/).filter(Boolean)
    assertRangeTokens(tokens)
    args.push(...tokens)
  }
  if (filePath) args.push('--', filePath)

  let raw = ''
  try {
    raw = await git.raw(args)
  } catch (e: any) {
    throw createError({ statusCode: 400, message: cleanGitError(e?.message, range) })
  }

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, email, date, subject] = line.split('\x01')
      return {
        hash,
        shortHash: hash.slice(0, 8),
        subject,
        author,
        email,
        date,
      }
    })
})
