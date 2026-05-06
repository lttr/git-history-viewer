export default defineEventHandler(async (event) => {
  const git = useGit()
  const path = readPath(getQuery(event))
  const [unstagedNS, stagedNS] = await Promise.all([
    git.raw(withPath(['diff', '--name-status'], path)).catch(() => ''),
    git.raw(withPath(['diff', '--cached', '--name-status'], path)).catch(() => ''),
  ])
  const unstaged = parseNameStatus(unstagedNS)
  const staged = parseNameStatus(stagedNS)
  return {
    unstaged: unstaged.length,
    staged: staged.length,
  }
})
