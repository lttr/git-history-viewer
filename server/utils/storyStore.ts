// Persisted changeset stories live under the repo's git dir, keyed by the exact
// commits they describe, so a reload reuses a result instead of re-running the
// model. `git rev-parse --absolute-git-dir` keeps worktrees pointing at their
// own dir, and nothing under it is ever committed.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ChangesetStory } from '../../app/types/story'
import { LRU } from './cache'
import { useGit } from './git'

const memory = new LRU<ChangesetStory>(20)

export function storyKey(mergeBase: string, headSha: string): string {
  return `${mergeBase}-${headSha}`
}

async function storyPath(key: string): Promise<string> {
  const git = useGit()
  const gitDir = (await git.raw(['rev-parse', '--absolute-git-dir'])).trim()
  return join(gitDir, 'gv', 'story', `${key}.json`)
}

export async function readStory(key: string): Promise<ChangesetStory | null> {
  const hit = memory.get(key)
  if (hit) return hit
  try {
    const raw = await readFile(await storyPath(key), 'utf8')
    const parsed = JSON.parse(raw) as ChangesetStory
    if (!parsed || !Array.isArray(parsed.groups)) return null
    memory.set(key, parsed)
    return parsed
  } catch {
    // Missing or corrupt file — both mean "no persisted story".
    return null
  }
}

export async function writeStory(key: string, story: ChangesetStory): Promise<void> {
  memory.set(key, story)
  try {
    const file = await storyPath(key)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(story), 'utf8')
  } catch {
    // Persistence is best-effort; the in-memory copy still serves this session.
  }
}
