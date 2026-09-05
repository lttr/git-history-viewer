import { simpleGit, type SimpleGit } from 'simple-git'

export function useGit(): SimpleGit {
  const cfg = useRuntimeConfig()
  return simpleGit(cfg.repoPath)
}

export function useFilePath(): string {
  const cfg = useRuntimeConfig()
  return (cfg.filePath as string) || ''
}

export function withPath(args: string[], path: string): string[] {
  return path ? [...args, '--', path] : args
}

const PATH_RE = /^[^\0]+$/
export function readPath(q: any): string {
  const raw = typeof q?.path === 'string' ? q.path.trim() : ''
  if (!raw) return ''
  if (raw.startsWith('-') || !PATH_RE.test(raw)) {
    throw createError({ statusCode: 400, message: 'invalid path' })
  }
  return raw
}

const SHA_RE = /^[0-9a-f]{4,64}$/i
export function assertSha(sha: string | undefined | null): string {
  if (!sha || !SHA_RE.test(sha)) {
    throw createError({ statusCode: 400, message: 'invalid sha' })
  }
  return sha
}

export function assertPath(p: string | undefined | null): string {
  if (typeof p !== 'string' || !p.length || p.startsWith('-')) {
    throw createError({ statusCode: 400, message: 'invalid path' })
  }
  return p
}

export function cleanGitError(msg: string | undefined, range: string): string {
  const m = msg || ''
  const ambig = m.match(/ambiguous argument '([^']+)':\s*unknown revision/i)
  if (ambig) return `unknown revision: ${ambig[1]}`
  const bad = m.match(/bad revision '([^']+)'/i)
  if (bad) return `bad revision: ${bad[1]}`
  if (range) return `invalid range '${range}'`
  return 'invalid range'
}

const RANGE_TOKEN_RE = /^[A-Za-z0-9._/^~@{}=:+-]+$/
export function assertRangeTokens(tokens: string[]): string[] {
  for (const t of tokens) {
    if (!t) continue
    if (t.startsWith('-')) {
      throw createError({ statusCode: 400, message: `invalid range token: ${t}` })
    }
    if (!RANGE_TOKEN_RE.test(t)) {
      throw createError({ statusCode: 400, message: `invalid range token: ${t}` })
    }
  }
  return tokens
}

export function parseNameStatus(raw: string): Array<{ path: string; status: string; oldPath?: string }> {
  const out: Array<{ path: string; status: string; oldPath?: string }> = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const code = parts[0]
    if (!code) continue
    const letter = code[0]
    if (letter === 'R' || letter === 'C') {
      out.push({ status: letter, oldPath: parts[1], path: parts[2] ?? parts[1] })
    } else {
      out.push({ status: letter, path: parts[1] })
    }
  }
  return out
}

/**
 * Split a multi-file `git diff` patch into per-file chunks keyed by new path.
 * Shared by the branch diff endpoint and the change-stack model input builder.
 */
export function splitPatchByFile(raw: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!raw) return out
  const chunks = raw.split(/^diff --git /m)
  for (let i = 1; i < chunks.length; i++) {
    const chunk = 'diff --git ' + chunks[i]
    const first = chunk.split('\n', 1)[0]
    const m = first.match(/ b\/(.+)$/)
    if (!m) continue
    out.set(m[1].trim(), chunk)
  }
  return out
}
