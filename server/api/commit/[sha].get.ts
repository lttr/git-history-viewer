export default defineEventHandler(async (event) => {
  const sha = getRouterParam(event, 'sha')
  if (!sha) throw createError({ statusCode: 400, message: 'sha required' })
  const git = useGit()

  const [showRaw, parentsRaw] = await Promise.all([
    git.raw(['show', '--name-status', '--format=', '-m', '--first-parent', sha]),
    git.raw(['rev-list', '--parents', '-n', '1', sha]),
  ])

  const files = parseNameStatus(showRaw)
  const parents = parentsRaw.trim().split(' ').slice(1)

  const meta = await git.show([
    '--no-patch',
    '--format=%H%n%an%n%ae%n%aI%n%s%n%b',
    sha,
  ])
  const lines = meta.split('\n')
  return {
    hash: lines[0],
    author: lines[1],
    email: lines[2],
    date: lines[3],
    subject: lines[4],
    body: lines.slice(5).join('\n').trim(),
    parents,
    isMerge: parents.length > 1,
    files,
  }
})
