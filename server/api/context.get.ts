export default defineEventHandler(async () => {
  const git = useGit()
  const cfg = useRuntimeConfig()
  const repoPath: string = cfg.repoPath
  const repo = repoPath.replace(/\/+$/, '').split('/').pop() || repoPath

  let branch = ''
  try {
    branch = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  } catch {}

  const candidates = ['main', 'master', 'develop', 'trunk']
  let base = ''
  for (const c of candidates) {
    if (c === branch) continue
    try {
      await git.raw(['rev-parse', '--verify', `refs/heads/${c}`])
      base = c
      break
    } catch {}
  }

  const defaultRange = base ? `${base}..HEAD` : 'HEAD'

  let head = ''
  try { head = (await git.raw(['rev-parse', 'HEAD'])).trim() } catch {}

  return { branch, base, defaultRange, head, repo }
})
