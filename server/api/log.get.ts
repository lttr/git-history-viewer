export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = Math.min(Number(q.limit ?? 200), 1000)
  const skip = Math.max(Number(q.skip ?? 0), 0)
  const git = useGit()

  const log = await git.log({
    maxCount: limit,
    '--skip': String(skip),
  } as any)

  return log.all.map((c) => ({
    hash: c.hash,
    shortHash: c.hash.slice(0, 8),
    subject: c.message,
    author: c.author_name,
    email: c.author_email,
    date: c.date,
  }))
})
