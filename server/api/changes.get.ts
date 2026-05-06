export default defineEventHandler(async () => {
  const git = useGit()
  const [unstagedNS, stagedNS] = await Promise.all([
    git.raw(['diff', '--name-status']).catch(() => ''),
    git.raw(['diff', '--cached', '--name-status']).catch(() => ''),
  ])
  const unstaged = parseNameStatus(unstagedNS)
  const staged = parseNameStatus(stagedNS)
  return {
    unstaged: unstaged.length,
    staged: staged.length,
  }
})
