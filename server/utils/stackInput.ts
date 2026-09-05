// Builds the plain-text prompt input for the change stack: the branch's files
// and their hunks, pre-numbered as "path#n" so the model can reference exact
// regions instead of copying line ranges.

export interface InputHunk {
  /** "app/x.ts#2" */
  id: string
  path: string
  /** 1-based within the file */
  index: number
  newStart: number
  oldStart: number
  header: string
  /** raw patch body lines (' ', '+', '-', '\' prefixed) */
  lines: string[]
}

export interface InputFile {
  path: string
  status: string
  hunks: InputHunk[]
  /** patch listed but not included (lockfile, binary, generated) */
  omitted: boolean
}

export interface StackInput {
  text: string
  files: InputFile[]
  hunksById: Map<string, InputHunk>
  truncated: boolean
}

/** Files whose content is noise for grouping: listed, never inlined. */
const OMIT_PATTERNS: RegExp[] = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/,
  /\.lock$/,
  /(^|\/)(dist|\.output|\.nuxt|node_modules|coverage)\//,
  /\.min\.[a-z0-9]+$/i,
  /\.(snap|map)$/,
]

export function isOmittedPath(path: string): boolean {
  return OMIT_PATTERNS.some((re) => re.test(path))
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * Split one file's patch chunk into numbered hunks. The `diff --git` preamble
 * (index/mode/---/+++ lines) is dropped; only `@@` sections survive.
 */
export function splitHunks(path: string, patch: string): InputHunk[] {
  const out: InputHunk[] = []
  if (!patch) return out
  let current: InputHunk | null = null
  for (const line of patch.split('\n')) {
    const m = line.match(HUNK_RE)
    if (m) {
      current = {
        id: `${path}#${out.length + 1}`,
        path,
        index: out.length + 1,
        oldStart: Number(m[1]),
        newStart: Number(m[2]),
        header: line,
        lines: [],
      }
      out.push(current)
      continue
    }
    if (!current) continue
    current.lines.push(line)
  }
  // Trailing newline of the patch shows up as one empty final line.
  for (const h of out) {
    while (h.lines.length && h.lines[h.lines.length - 1] === '') h.lines.pop()
  }
  return out
}

export interface BuildInputArgs {
  repo: string
  branch: string
  range: string
  /** oldest first */
  commits: Array<{ shortHash: string; subject: string }>
  files: Array<{ path: string; status: string; patch: string; isBinary: boolean }>
  budget?: number
}

const DEFAULT_BUDGET = 200_000
const MAX_COMMITS = 50

export function buildStackInput(args: BuildInputArgs): StackInput {
  const budget = args.budget ?? DEFAULT_BUDGET

  const files: InputFile[] = args.files.map((f) => {
    const omitted = f.isBinary || isOmittedPath(f.path)
    return {
      path: f.path,
      status: f.status,
      omitted,
      hunks: omitted ? [] : splitHunks(f.path, f.patch),
    }
  })

  const hunksById = new Map<string, InputHunk>()
  for (const f of files) for (const h of f.hunks) hunksById.set(h.id, h)

  const header: string[] = []
  header.push(`REPO: ${args.repo}   BRANCH: ${args.branch}   RANGE: ${args.range}`)
  const commits = args.commits.slice(-MAX_COMMITS)
  header.push(`COMMITS (oldest first, max ${MAX_COMMITS}):`)
  if (!commits.length) header.push('- (none)')
  for (const c of commits) header.push(`- ${c.shortHash} ${c.subject}`)
  header.push(`FILES (${files.length}):`)
  for (const f of files) {
    const detail = f.omitted ? 'patch omitted' : `${f.hunks.length} hunk${f.hunks.length === 1 ? '' : 's'}`
    header.push(`${f.status} ${f.path} (${detail})`)
  }
  const headerText = header.join('\n')

  const withPatches = files.filter((f) => f.hunks.length)
  const full = renderBodies(withPatches, Infinity)
  if (headerText.length + full.length <= budget) {
    return { text: `${headerText}\n\n${full}`, files, hunksById, truncated: false }
  }

  const perFile = Math.max(400, Math.floor((budget - headerText.length) / Math.max(1, withPatches.length)))
  const capped = renderBodies(withPatches, perFile)
  return { text: `${headerText}\n\n${capped}`, files, hunksById, truncated: true }
}

/** `perFileBudget` is a soft char cap: hunk headers always survive, bodies are cut. */
function renderBodies(files: InputFile[], perFileBudget: number): string {
  const out: string[] = []
  for (const f of files) {
    out.push(`=== ${f.path} ===`)
    const perHunk = perFileBudget === Infinity
      ? Infinity
      : Math.max(120, Math.floor(perFileBudget / f.hunks.length))
    for (const h of f.hunks) {
      out.push(`--- hunk ${h.id}  ${h.header}`)
      let used = 0
      let cut = false
      for (const line of h.lines) {
        if (used + line.length + 1 > perHunk) { cut = true; break }
        used += line.length + 1
        out.push(line)
      }
      if (cut) out.push('[… truncated]')
    }
    out.push('')
  }
  return out.join('\n')
}

export interface StackSource {
  base: string
  head: string
  headSha: string
  mergeBase: string
  input: StackInput
}

/**
 * Resolve a `base..head` range to the same three-dot diff the branch review
 * shows, plus the commit subjects, and turn it into model input.
 */
export interface StackRefs {
  base: string
  head: string
  headSha: string
  mergeBase: string
  /** three-dot spec, matching what branch review diffs */
  spec: string
}

/** Parse and resolve a `base..head` range without touching the patch. */
export async function resolveStackRefs(range: string): Promise<StackRefs> {
  const m = range.match(/^(.*?)(\.\.\.?)(.*)$/)
  if (!m) throw createError({ statusCode: 400, message: 'range must be base..HEAD' })
  const base = m[1].trim()
  const head = m[3].trim() || 'HEAD'
  if (!base) throw createError({ statusCode: 400, message: 'range needs a base, e.g. main..HEAD' })
  assertRangeTokens([base, head])

  const git = useGit()
  try {
    const [headSha, mergeBase] = await Promise.all([
      git.raw(['rev-parse', head]).then((s) => s.trim()),
      git.raw(['merge-base', base, head]).then((s) => s.trim()),
    ])
    return { base, head, headSha, mergeBase, spec: `${base}...${head}` }
  } catch (e: any) {
    throw createError({ statusCode: 400, message: cleanGitError(e?.message, range) })
  }
}

/**
 * Resolve a `base..head` range to the same three-dot diff the branch review
 * shows, plus the commit subjects, and turn it into model input.
 */
export async function collectStackSource(range: string): Promise<StackSource> {
  const refs = await resolveStackRefs(range)
  const { base, head, headSha, mergeBase, spec } = refs
  const git = useGit()

  let branch = ''
  let nameStatusRaw = ''
  let patchRaw = ''
  let logRaw = ''
  try {
    ;[nameStatusRaw, patchRaw, logRaw, branch] = await Promise.all([
      git.raw(['diff', '--name-status', spec]),
      git.raw(['diff', spec]),
      git.raw(['log', '--reverse', '--format=%h%x09%s', `${base}..${head}`]),
      git.raw(['rev-parse', '--abbrev-ref', 'HEAD']).then((s) => s.trim()),
    ])
  } catch (e: any) {
    throw createError({ statusCode: 400, message: cleanGitError(e?.message, range) })
  }

  const patchMap = splitPatchByFile(patchRaw)
  const files = parseNameStatus(nameStatusRaw).map((f) => {
    const patch = patchMap.get(f.path) ?? ''
    return {
      path: f.path,
      status: f.status,
      patch,
      isBinary: /^Binary files /m.test(patch) || patch.includes('GIT binary patch'),
    }
  })

  const commits = logRaw
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [shortHash, ...rest] = l.split('\t')
      return { shortHash, subject: rest.join('\t') }
    })

  const cfg = useRuntimeConfig()
  const repoPath: string = cfg.repoPath
  const repo = repoPath.replace(/\/+$/, '').split('/').pop() || repoPath

  const input = buildStackInput({ repo, branch, range: spec, commits, files })
  return { base, head, headSha, mergeBase, input }
}
