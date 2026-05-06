export default defineEventHandler(async () => {
  const git = useGit()
  let branches: string[] = []
  try {
    const raw = await git.raw([
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname:short)',
      'refs/heads',
    ])
    branches = raw.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {}
  let tags: string[] = []
  try {
    const raw = await git.raw([
      'for-each-ref',
      '--sort=-creatordate',
      '--format=%(refname:short)',
      '--count=20',
      'refs/tags',
    ])
    tags = raw.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {}
  return { branches, tags }
})
