export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const sha = String(q.sha ?? '')
  const file = String(q.file ?? '')
  if (!sha || !file) throw createError({ statusCode: 400, message: 'sha and file required' })
  const git = useGit()

  const parents = (await git.raw(['rev-list', '--parents', '-n', '1', sha])).trim().split(' ')
  const parent = parents[1]

  let patch = ''
  let oldContent = ''
  let newContent = ''

  if (!parent) {
    patch = await git.raw(['show', '--format=', sha, '--', file])
  } else {
    patch = await git.raw(['diff', `${parent}..${sha}`, '--', file])
  }

  try {
    newContent = await git.raw(['show', `${sha}:${file}`])
  } catch { newContent = '' }

  if (parent) {
    try {
      oldContent = await git.raw(['show', `${parent}:${file}`])
    } catch { oldContent = '' }
  }

  const isBinary = /^Binary files /m.test(patch) || patch.includes('GIT binary patch')

  return {
    sha,
    file,
    parent,
    patch,
    oldContent,
    newContent,
    isBinary,
  }
})
