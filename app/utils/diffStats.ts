export interface DiffStats {
  additions: number
  deletions: number
}

/**
 * Count added/removed lines in a unified `git diff` patch for a single file.
 * Only counts inside hunks, so the `+++`/`---` file headers are ignored.
 */
export function patchStats(patch: string | undefined): DiffStats {
  let additions = 0
  let deletions = 0
  if (!patch) return { additions, deletions }
  let inHunk = false
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('diff --git ')) {
      inHunk = false
      continue
    }
    if (line.startsWith('+')) additions++
    else if (line.startsWith('-')) deletions++
  }
  return { additions, deletions }
}

export function addStats(a: DiffStats, b: DiffStats): DiffStats {
  return { additions: a.additions + b.additions, deletions: a.deletions + b.deletions }
}

// Extensions and filenames that carry docs or configuration rather than code.
// Excluded from the "code" line counts so a lockfile refresh or a long README
// edit doesn't drown out the actual implementation diff.
const NON_CODE_EXT = new Set([
  'md', 'mdx', 'markdown', 'rst', 'adoc', 'txt',
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'properties',
  'lock', 'csv', 'tsv', 'svg', 'snap',
])

const NON_CODE_FILE = new Set([
  '.gitignore', '.gitattributes', '.npmrc', '.nvmrc', '.editorconfig',
  '.dockerignore', '.prettierignore', '.eslintignore', 'dockerfile', 'makefile',
  'license', 'licence', 'notice', 'codeowners',
])

export function isCodePath(path: string): boolean {
  const name = (path.split('/').pop() ?? '').toLowerCase()
  if (NON_CODE_FILE.has(name)) return false
  if (name.startsWith('.env')) return false
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false // extensionless files are config/docs more often than not
  return !NON_CODE_EXT.has(name.slice(dot + 1))
}
