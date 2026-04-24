export default defineEventHandler(async (event) => {
  const sha = getRouterParam(event, 'sha')
  if (!sha) throw createError({ statusCode: 400, message: 'sha required' })
  const git = useGit()

  const parents = (await git.raw(['rev-list', '--parents', '-n', '1', sha])).trim().split(' ').slice(1)
  const parent = parents[0]

  const nameStatusRaw = await git.raw([
    'show', '--name-status', '--format=', '-m', '--first-parent', sha,
  ])
  const files = parseNameStatus(nameStatusRaw)

  const results = await Promise.all(files.map(async (f) => {
    let patch = ''
    let oldContent = ''
    let newContent = ''

    if (!parent) {
      patch = await git.raw(['show', '--format=', sha, '--', f.path]).catch(() => '')
    } else {
      patch = await git.raw(['diff', `${parent}..${sha}`, '--', f.path]).catch(() => '')
    }

    if (f.status !== 'D') {
      try { newContent = await git.raw(['show', `${sha}:${f.path}`]) } catch {}
    }
    if (parent && f.status !== 'A') {
      const oldPath = f.oldPath || f.path
      try { oldContent = await git.raw(['show', `${parent}:${oldPath}`]) } catch {}
    }

    const isBinary = /^Binary files /m.test(patch) || patch.includes('GIT binary patch')
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

  return { sha, parent, files: results }
})
