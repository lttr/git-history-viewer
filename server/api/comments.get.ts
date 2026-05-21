import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { CommentsDoc } from '~/types/comments'

// Serves the comments JSON pointed at by `--comments` (GV_COMMENTS_PATH).
// Returns an empty doc when no path is configured or the file is unreadable,
// so the viewer degrades gracefully rather than erroring.
export default defineEventHandler(async (): Promise<CommentsDoc> => {
  const cfg = useRuntimeConfig()
  const repoPath = cfg.repoPath as string
  const commentsPath = (cfg.commentsPath as string) || ''
  const empty: CommentsDoc = { version: 1, threads: [] }
  if (!commentsPath) return empty

  const abs = isAbsolute(commentsPath) ? commentsPath : resolve(repoPath, commentsPath)
  try {
    const raw = await readFile(abs, 'utf8')
    const doc = JSON.parse(raw) as CommentsDoc
    if (doc?.version !== 1 || !Array.isArray(doc.threads)) {
      throw createError({ statusCode: 422, statusMessage: `comments: unexpected format in ${abs}` })
    }
    return doc
  } catch (err: any) {
    if (err?.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: `comments: cannot read ${abs}: ${err?.message ?? err}` })
  }
})
