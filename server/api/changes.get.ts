export default defineEventHandler(async (event) => {
  const git = useGit()
  const path = readPath(getQuery(event))
  const [unstagedNS, stagedNS, untrackedRaw] = await Promise.all([
    git.raw(withPath(['diff', '--name-status'], path)).catch(() => ''),
    git.raw(withPath(['diff', '--cached', '--name-status'], path)).catch(() => ''),
    git.raw(withPath(['ls-files', '--others', '--exclude-standard'], path)).catch(() => ''),
  ])
  const unstaged = parseNameStatus(unstagedNS)
  const staged = parseNameStatus(stagedNS)
  const untracked = untrackedRaw.split('\n').filter((l) => l.trim()).length
  return {
    unstaged: unstaged.length + untracked,
    staged: staged.length,
  }
})
