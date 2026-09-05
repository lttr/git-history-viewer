// Persisted change stacks live under the repo's git dir, keyed by the exact
// commits they describe, so a reload reuses a result instead of re-running the
// model. `git rev-parse --absolute-git-dir` keeps worktrees pointing at their
// own dir, and nothing under it is ever committed.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ChangeStack } from '../../app/types/stack'
import { LRU } from './cache'
import { useGit } from './git'

const memory = new LRU<ChangeStack>(20)

export function stackKey(mergeBase: string, headSha: string): string {
  return `${mergeBase}-${headSha}`
}

async function stackPath(key: string): Promise<string> {
  const git = useGit()
  const gitDir = (await git.raw(['rev-parse', '--absolute-git-dir'])).trim()
  return join(gitDir, 'gv', 'stack', `${key}.json`)
}

export async function readStack(key: string): Promise<ChangeStack | null> {
  const hit = memory.get(key)
  if (hit) return hit
  try {
    const raw = await readFile(await stackPath(key), 'utf8')
    const parsed = JSON.parse(raw) as ChangeStack
    if (!parsed || !Array.isArray(parsed.groups)) return null
    memory.set(key, parsed)
    return parsed
  } catch {
    // Missing or corrupt file — both mean "no persisted stack".
    return null
  }
}

export async function writeStack(key: string, stack: ChangeStack): Promise<void> {
  memory.set(key, stack)
  try {
    const file = await stackPath(key)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(stack), 'utf8')
  } catch {
    // Persistence is best-effort; the in-memory copy still serves this session.
  }
}
