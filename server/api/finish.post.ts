import type { CommentsDoc } from '~/types/comments'
import { formatCommentsText } from '../utils/formatComments'

// Receives the collected review comments from the browser, formats them as
// plain-text markdown, and emits them on a sentinel line the `gv --collect` CLI
// wrapper captures, then shuts the server down so the wrapper's blocking
// invocation returns to the calling agent.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const cfg = useRuntimeConfig()
  if (!cfg.collect) {
    throw createError({ statusCode: 403, statusMessage: 'finish: not in --collect mode' })
  }
  const body = await readBody<CommentsDoc>(event)
  const doc: CommentsDoc = {
    version: 1,
    threads: Array.isArray(body?.threads) ? body.threads : [],
  }
  // The plain text is multi-line; base64-encode so it stays on a single
  // newline-free line the CLI can match by prefix, then decode on the far side.
  const text = formatCommentsText(doc.threads)
  const encoded = Buffer.from(text, 'utf8').toString('base64')
  process.stdout.write(`\n__GV_REVIEW_TEXT__${encoded}\n`)
  // Let the HTTP response flush before tearing down the process.
  setTimeout(() => process.exit(0), 150)
  return { ok: true }
})
